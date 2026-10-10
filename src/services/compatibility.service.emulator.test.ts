/**
 * Tests de integración para getMatchesForJob contra el emulador de Firestore.
 *
 * Requieren el emulador de Firestore. Se SALTAN automáticamente si no está disponible
 * (`FIRESTORE_EMULATOR_HOST` no definido), para no romper CI sin emulador.
 *
 * Para ejecutarlos localmente:
 *   firebase emulators:exec --only firestore "npm test -- compatibility.service.emulator.test.ts"
 * (o arranca el emulador y exporta FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  Timestamp 
} from "firebase/firestore";
import { CompatibilityService } from "./compatibility.service";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("getMatchesForJob — security & pagination against emulator", () => {
  let testEnv: RulesTestEnvironment;
  
  const recruiter1 = "recruiter1";
  const recruiter2 = "recruiter2";
  const job1 = "job1_r1";
  const job2 = "job2_r2";

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-nextape-pagination",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe("Security: ownership validation", () => {
    it("recruiter ajeno no puede listar matches de otro recruiter (query sin filtro de recruiterId → assertFails)", async () => {
      // Setup: recruiter1 tiene un job y un match
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "jobs", job1), {
          createdBy: recruiter1,
          title: "Senior React Dev",
          requiredSkills: ["react", "typescript"],
          active: true,
          postedAt: Timestamp.now(),
        });
        await setDoc(doc(db, "candidate_matches", `user1_${job1}`), {
          userId: "user1",
          recruiterId: recruiter1,
          jobId: job1,
          jobTitle: "Senior React Dev",
          candidateName: "Alice",
          score: 85,
          matchPercent: 90,
          skills: { react: 85, typescript: 80 },
          completedAt: Timestamp.now(),
        });
      });

      // Test: recruiter2 intenta hacer query sin filtro de recruiterId
      const recruiter2Ctx = testEnv.authenticatedContext(recruiter2);
      const db = recruiter2Ctx.firestore();
      
      // Query directa sin filtro recruiterId (debería fallar por reglas)
      await assertFails(
        getDocs(query(
          collection(db, "candidate_matches"),
          where("jobId", "==", job1),
          orderBy("completedAt", "desc"),
          limit(10)
        ))
      );
    });

    it("jobId ajeno → error controlado (Job not found or access denied)", async () => {
      // Setup: recruiter1 tiene job1, recruiter2 tiene job2
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "jobs", job1), {
          createdBy: recruiter1,
          title: "Job1",
          requiredSkills: [],
          active: true,
          postedAt: Timestamp.now(),
        });
        await setDoc(doc(db, "jobs", job2), {
          createdBy: recruiter2,
          title: "Job2",
          requiredSkills: [],
          active: true,
          postedAt: Timestamp.now(),
        });
      });

      // Test: recruiter1 intenta acceder a job2 (de recruiter2)
      // Nota: Necesitamos usar el servicio directamente pero con contexto autenticado
      // Como CompatibilityService usa el cliente por defecto, vamos a verificar el error
      
      try {
        await CompatibilityService.getMatchesForJob(recruiter1, job2);
        expect.fail("Debería lanzar error de acceso");
      } catch (err) {
        expect((err as Error).message).toBe("Job not found or access denied");
      }
    });

    it("jobId inexistente → error controlado (mismo mensaje)", async () => {
      // Test: recruiter1 intenta acceder a job inexistente
      try {
        await CompatibilityService.getMatchesForJob(recruiter1, "job_inexistente");
        expect.fail("Debería lanzar error de acceso");
      } catch (err) {
        expect((err as Error).message).toBe("Job not found or access denied");
      }
    });
  });

  describe("Pagination: empate de completedAt con desempate por docId", () => {
    it("3+ matches con mismo completedAt, pageSize 2 → no pierde ni duplica entre páginas", async () => {
      const sameTime = Timestamp.fromDate(new Date("2026-10-09T12:00:00Z"));
      
      // Setup: crear job y 3 matches con mismo completedAt pero diferentes docId
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "jobs", job1), {
          createdBy: recruiter1,
          title: "Test Job",
          requiredSkills: ["typescript"],
          active: true,
          postedAt: Timestamp.now(),
        });
        
        // Matches con mismo timestamp: userA, userB, userC
        await setDoc(doc(db, "candidate_matches", `userA_${job1}`), {
          userId: "userA",
          recruiterId: recruiter1,
          jobId: job1,
          jobTitle: "Test Job",
          candidateName: "Alice",
          score: 85,
          matchPercent: 90,
          skills: { typescript: 85 },
          completedAt: sameTime,
        });
        await setDoc(doc(db, "candidate_matches", `userB_${job1}`), {
          userId: "userB",
          recruiterId: recruiter1,
          jobId: job1,
          jobTitle: "Test Job",
          candidateName: "Bob",
          score: 88,
          matchPercent: 92,
          skills: { typescript: 88 },
          completedAt: sameTime,
        });
        await setDoc(doc(db, "candidate_matches", `userC_${job1}`), {
          userId: "userC",
          recruiterId: recruiter1,
          jobId: job1,
          jobTitle: "Test Job",
          candidateName: "Charlie",
          score: 90,
          matchPercent: 95,
          skills: { typescript: 90 },
          completedAt: sameTime,
        });
      });

      // Página 1: pedir 2 resultados
      const page1 = await CompatibilityService.getMatchesForJob(recruiter1, job1, {
        pageSize: 2,
      });

      expect(page1.matches).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      // Página 2: usar el cursor
      const page2 = await CompatibilityService.getMatchesForJob(recruiter1, job1, {
        pageSize: 2,
        cursor: page1.nextCursor,
      });

      expect(page2.matches).toHaveLength(1);
      expect(page2.hasMore).toBe(false);

      // Verificar que no hay duplicados ni pérdidas
      const allUserIds = [
        ...page1.matches.map((m) => m.userId),
        ...page2.matches.map((m) => m.userId),
      ];
      expect(allUserIds).toHaveLength(3);
      expect(new Set(allUserIds).size).toBe(3); // No duplicados
      expect(allUserIds.sort()).toEqual(["userA", "userB", "userC"].sort());
    });

    it("5 matches con mismo completedAt, pageSize 2 → verificar que se recuperan todos", async () => {
      const sameTime = Timestamp.fromDate(new Date("2026-10-09T12:00:00Z"));
      
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "jobs", job1), {
          createdBy: recruiter1,
          title: "Test Job",
          requiredSkills: ["typescript"],
          active: true,
          postedAt: Timestamp.now(),
        });
        
        // Crear 5 matches con mismo timestamp
        for (const userId of ["user1", "user2", "user3", "user4", "user5"]) {
          await setDoc(doc(db, "candidate_matches", `${userId}_${job1}`), {
            userId,
            recruiterId: recruiter1,
            jobId: job1,
            jobTitle: "Test Job",
            candidateName: userId,
            score: 85,
            matchPercent: 90,
            skills: { typescript: 85 },
            completedAt: sameTime,
          });
        }
      });

      // Paginar con pageSize 2: deberíamos obtener 3 páginas (2+2+1)
      const allMatches: string[] = [];
      let cursor: string | undefined;
      let pageCount = 0;

      do {
        const page = await CompatibilityService.getMatchesForJob(recruiter1, job1, {
          pageSize: 2,
          cursor,
        });
        allMatches.push(...page.matches.map((m) => m.userId));
        cursor = page.nextCursor;
        pageCount++;
        
        // Safety: no más de 10 páginas (evitar loop infinito si hay bug)
        if (pageCount > 10) break;
      } while (cursor);

      expect(allMatches).toHaveLength(5);
      expect(new Set(allMatches).size).toBe(5); // No duplicados
      expect(pageCount).toBe(3); // 2+2+1
    });
  });
});
