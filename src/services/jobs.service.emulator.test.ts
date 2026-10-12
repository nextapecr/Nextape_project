/**
 * Tests de integración para getJobsByRecruiter contra el emulador de Firestore.
 *
 * Requieren el emulador de Firestore. Se SALTAN automáticamente si no está disponible
 * (`FIRESTORE_EMULATOR_HOST` no definido), para no romper CI sin emulador.
 *
 * Para ejecutarlos localmente:
 *   firebase emulators:exec --only firestore "npm test -- jobs.service.emulator.test.ts"
 * (o arranca el emulador y exporta FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp, Firestore } from "firebase/firestore";
import { JobService } from "./jobs.service";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("getJobsByRecruiter — orderBy and limit against emulator", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-nextape-jobs",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    expect(testEnv.projectId).toMatch(/^demo-/);
  });

  /**
   * Helper: inyecta el Firestore del testEnv autenticado para el recruiter.
   * Garantiza aislamiento: NUNCA usa el db del cliente.
   */
  const callService = async (recruiterId: string) => {
    const ctx = testEnv.authenticatedContext(recruiterId);
    const testDb = ctx.firestore() as unknown as Firestore;
    
    // Monkey-patch temporal para inyectar testDb en JobService
    const originalDb = await import("@/lib/firebase/client");
    const dbSpy = vi.spyOn(originalDb, "db", "get").mockReturnValue(testDb);
    
    try {
      const result = await JobService.getJobsByRecruiter(recruiterId);
      return result;
    } finally {
      dbSpy.mockRestore();
    }
  };

  describe("Order by postedAt DESC", () => {
    it("returns jobs ordered by postedAt DESC (newest first)", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "jobs/j1"), {
          createdBy: "recruiter1",
          title: "Old Job",
          requiredSkills: [],
          postedAt: Timestamp.fromDate(new Date("2026-01-01T10:00:00Z")),
        });
        await setDoc(doc(db, "jobs/j2"), {
          createdBy: "recruiter1",
          title: "New Job",
          requiredSkills: [],
          postedAt: Timestamp.fromDate(new Date("2026-10-01T10:00:00Z")),
        });
        await setDoc(doc(db, "jobs/j3"), {
          createdBy: "recruiter1",
          title: "Middle Job",
          requiredSkills: [],
          postedAt: Timestamp.fromDate(new Date("2026-05-01T10:00:00Z")),
        });
      });

      const jobs = await callService("recruiter1");

      expect(jobs).toHaveLength(3);
      expect(jobs[0].title).toBe("New Job"); // 2026-10-01
      expect(jobs[1].title).toBe("Middle Job"); // 2026-05-01
      expect(jobs[2].title).toBe("Old Job"); // 2026-01-01
    });
  });

  describe("Limit to 100", () => {
    it("returns at most 100 jobs when recruiter has >100", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const baseTime = new Date("2026-01-01T00:00:00Z").getTime();
        
        // Crear 150 jobs con timestamps crecientes
        for (let i = 0; i < 150; i++) {
          await setDoc(doc(db, `jobs/j${i}`), {
            createdBy: "mega_recruiter",
            title: `Job ${i}`,
            requiredSkills: [],
            postedAt: Timestamp.fromMillis(baseTime + i * 1000),
          });
        }
      });

      const jobs = await callService("mega_recruiter");

      expect(jobs).toHaveLength(100);
      // Verificar que son los 100 más recientes (j149 a j50)
      expect(jobs[0].title).toBe("Job 149");
      expect(jobs[99].title).toBe("Job 50");
    });
  });

  describe("console.warn behavior", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("warns when recruiter has exactly 100 jobs", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        for (let i = 0; i < 100; i++) {
          await setDoc(doc(db, `jobs/j${i}`), {
            createdBy: "prolific_recruiter",
            title: `Job ${i}`,
            requiredSkills: [],
            postedAt: Timestamp.now(),
          });
        }
      });

      await callService("prolific_recruiter");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[getJobsByRecruiter]")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(">=100 jobs")
      );
    });

    it("does not warn when recruiter has <100 jobs", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "jobs/j1"), {
          createdBy: "alice",
          title: "Job 1",
          requiredSkills: [],
          postedAt: Timestamp.now(),
        });
        await setDoc(doc(db, "jobs/j2"), {
          createdBy: "alice",
          title: "Job 2",
          requiredSkills: [],
          postedAt: Timestamp.now(),
        });
      });

      await callService("alice");

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not include full uid in warning (no PII)", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        for (let i = 0; i < 100; i++) {
          await setDoc(doc(db, `jobs/j${i}`), {
            createdBy: "sensitive_uid_1234567890abcdef",
            title: `Job ${i}`,
            requiredSkills: [],
            postedAt: Timestamp.now(),
          });
        }
      });

      await callService("sensitive_uid_1234567890abcdef");

      expect(warnSpy).toHaveBeenCalled();
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      
      // Verifica que NO contiene el uid completo
      expect(warnMessage).not.toContain("sensitive_uid_1234567890abcdef");
      
      // Verifica que SÍ contiene los primeros 8 caracteres + "..."
      expect(warnMessage).toContain("sensitiv...");
    });
  });
});
