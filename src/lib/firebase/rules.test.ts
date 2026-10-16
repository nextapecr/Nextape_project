/**
 * Tests de las reglas de seguridad de Firestore.
 *
 * Requieren el emulador de Firestore. Se SALTAN automáticamente si no está disponible
 * (`FIRESTORE_EMULATOR_HOST` no definido), para no romper CI sin emulador.
 *
 * Para ejecutarlos localmente:
 *   firebase emulators:exec --only firestore "npm test"
 * (o arranca el emulador y exporta FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
 */
import { describe, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("firestore.rules — integridad del DNA y ownership", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-nextape",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("un usuario NO puede escribir su propio DNA (write:false, solo servidor)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "user_skill_scores/alice"), { uid: "alice", scores: { react: 100 } })
    );
  });

  it("un usuario puede leer su propio DNA pero no el de otro", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "user_skill_scores/alice"), {
        uid: "alice",
        scores: { react: 80 },
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(alice, "user_skill_scores/alice")));
    await assertFails(getDoc(doc(bob, "user_skill_scores/alice")));
  });

  it("nadie puede leer sesiones ni claves de respuestas (server-only)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "line_sessions/s1")));
    await assertFails(getDoc(doc(alice, "job_answer_keys/j1")));
    // Preguntas vistas: si el cliente pudiera vaciarlas, elegiría qué preguntas le tocan.
    await assertFails(getDoc(doc(alice, "line_seen/alice_react_senior")));
    await assertFails(setDoc(doc(alice, "line_seen/alice_react_senior"), { fingerprints: [] }));
  });

  it("nadie puede crear intentos desde cliente (create:false, solo servidor)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "assessment_attempts/a1"), { userId: "alice", score: 100 })
    );
  });

  it("solo el reclutador dueño puede crear su vacante", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(
      setDoc(doc(alice, "jobs/j1"), { createdBy: "alice", title: "React Architect" })
    );
    // bob no puede crear una vacante a nombre de alice
    await assertFails(
      setDoc(doc(bob, "jobs/j2"), { createdBy: "alice", title: "Fake" })
    );
  });

  it("el dueño lee la evidencia de sus repositorios, nadie más, y nadie la escribe", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "github_evidence/alice/repos/alice__app"), { uid: "alice" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(alice, "github_evidence/alice/repos/alice__app")));
    await assertFails(getDoc(doc(bob, "github_evidence/alice/repos/alice__app")));
    await assertFails(
      setDoc(doc(alice, "github_evidence/alice/repos/alice__app"), { uid: "alice", skillScores: {} })
    );
  });

  it("los contadores de límite de peticiones son server-only", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "api_rate_limits/evaluate:alice")));
    await assertFails(setDoc(doc(alice, "api_rate_limits/evaluate:alice"), { count: 0, windowStart: 0 }));
  });

  it("el dueño edita su vacante pero no los campos que escribe el servidor", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "jobs/j3"), {
        createdBy: "alice",
        title: "Backend",
        applicantsCount: 2,
        assessmentReady: false,
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(updateDoc(doc(alice, "jobs/j3"), { title: "Backend Senior", examQuestionCount: null }));
    await assertFails(updateDoc(doc(alice, "jobs/j3"), { applicantsCount: 500 }));
    await assertFails(updateDoc(doc(alice, "jobs/j3"), { assessmentReady: true, assessmentPoolSize: 999 }));
  });

  it("create job con applicantsCount=999 → assertFails", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "jobs/j_applicants_999"), {
        createdBy: "alice",
        title: "Job1",
        applicantsCount: 999,
      })
    );
  });

  it("create job con applicantsCount=0 → assertSucceeds", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      setDoc(doc(alice, "jobs/j_applicants_0"), {
        createdBy: "alice",
        title: "Job2",
        applicantsCount: 0,
      })
    );
  });

  it("create job sin applicantsCount → assertSucceeds", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      setDoc(doc(alice, "jobs/j_no_applicants"), {
        createdBy: "alice",
        title: "Job3",
      })
    );
  });

  it("create job con assessmentReady=true → assertFails", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "jobs/j_ready_true"), {
        createdBy: "alice",
        title: "Job4",
        assessmentReady: true,
      })
    );
  });

  it("create job con assessmentReady=false → assertSucceeds", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      setDoc(doc(alice, "jobs/j_ready_false"), {
        createdBy: "alice",
        title: "Job5",
        assessmentReady: false,
      })
    );
  });

  it("create job con assessmentPoolSize → assertFails", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "jobs/j_pool"), {
        createdBy: "alice",
        title: "Job6",
        assessmentPoolSize: 10,
      })
    );
  });

  it("create job con assessmentMissingSkills → assertFails", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "jobs/j_missing"), {
        createdBy: "alice",
        title: "Job7",
        assessmentMissingSkills: ["react"],
      })
    );
  });
});
