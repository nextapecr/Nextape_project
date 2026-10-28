import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentData, WriteBatch } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import {
  examSizeFor,
  normalizeStoredQuestions,
  LEVELS,
  pickRandomQuestions,
  shuffleQuestionOptions,
  stripAnswerKey,
} from "@/lib/server/assessment";
import {
  attemptRule,
  attemptScope,
  isSessionDisposable,
  questionFingerprint,
  SESSION_CLEANUP_SCAN_LIMIT,
  seenRanks,
  timeLimitMinutesFor,
  updateSeenList,
} from "@/lib/server/line-policy";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/server/rate-limit";
import { composeJobPoolFromBank, JOB_POOL_MIN_QUESTIONS } from "@/lib/server/job-pool";
import { hasGithubEvidence } from "@/lib/server/github-evidence";
import {
  combinedPoolDocIds,
  composeCombinedExam,
  lineLevelFromSelfLevel,
  MAX_LINE_TECHNOLOGIES,
} from "@/lib/server/combined-exam";
import { normalizeLineTechnologies } from "@/lib/line-technologies";
import type { Question } from "@/types/question.types";

// El Admin SDK requiere el runtime de Node (no Edge).
export const runtime = "nodejs";

/**
 * Lee el repertorio de un documento de banco de preguntas. `[]` si no hay.
 * Normaliza repertorios anteriores a los tipos de pregunta (sin campo `type`).
 */
function readPool(data: DocumentData | undefined): Question[] {
  const questions = data?.questions;
  return Array.isArray(questions) ? normalizeStoredQuestions(questions as Question[]) : [];
}

/** Nivel válido o, si no lo es, `senior` (mismo criterio que el resto de The LINE). */
function normalizeLevel(level: unknown): string {
  const l = String(level ?? "").toLowerCase();
  return (LEVELS as readonly string[]).includes(l) ? l : "senior";
}

/**
 * Nivel de las preguntas de cada skill de una vacante. Al componer el repertorio, una skill sin
 * banco en el nivel de la vacante cae a otro nivel (`covered[].level`): se pondera con el nivel
 * de las preguntas que de verdad respondió, no con el de la vacante.
 */
function readCoveredLevels(covered: unknown, fallback: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(covered)) return out;
  for (const c of covered) {
    if (c && typeof c.key === "string") out[c.key] = normalizeLevel(c.level ?? fallback);
  }
  return out;
}

/**
 * POST /api/line/start
 * Inicia una simulación: sortea las preguntas de un repertorio ya existente, guarda la clave en
 * una sesión que el cliente no puede leer y devuelve las preguntas SIN claves de respuesta.
 *
 * Tamaño del examen: 10 preguntas si el candidato tiene su GitHub analizado (su código real aporta
 * señal) y 20 si no; en una vacante, el reclutador puede fijarlo (10–30).
 *
 * En ningún camino se llama a un modelo de IA: la práctica general lee el banco precargado, y una
 * vacante sin repertorio lo compone al vuelo desde ese mismo banco.
 *
 * Límites (H1 de la auditoría): 1 intento cada 24 h por tecnología (o por vacante) → 429; y tiempo
 * límite de 30 min en práctica, o el que fije el reclutador en su vacante. El tiempo se guarda en
 * la sesión y lo hace cumplir `/api/line/submit`.
 *
 * Variedad: se priorizan las preguntas que el usuario no ha visto (`line_seen`) y las opciones se
 * barajan en cada sesión.
 *
 * Sin vacante = PRUEBA COMBINADA (2026-10): ~70 % de las tecnologías del perfil del candidato
 * (`users.lineTechnologies`, server-only) + ~30 % de teoría de ingeniería de software, al nivel que
 * declaró (`candidateProfile.selfLevel`). El candidato no elige tecnología ni nivel: si el body trae
 * `technology`/`level`, se ignoran. Ver `src/lib/server/combined-exam.ts`.
 *
 * Body: { jobId?: string }
 * Auth: header `Authorization: Bearer <Firebase ID token>`.
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jobId: string | undefined = typeof body?.jobId === "string" ? body.jobId : undefined;

  try {
    const githubSnap = await adminDb().collection("github_evidence").doc(uid).get();
    const withGithub = hasGithubEvidence(githubSnap.data());

    // Preguntas que el usuario ya vio, de la más antigua a la más reciente. En la prueba combinada
    // la memoria es una sola para todas sus tecnologías (las huellas son por enunciado).
    const seenKey = jobId ? `job_${jobId}` : "combined";
    const seenRef = adminDb().collection("line_seen").doc(`${uid}_${seenKey}`);
    const seen: string[] = (await seenRef.get()).data()?.fingerprints ?? [];
    const ranks = seenRanks(Array.isArray(seen) ? seen : []);
    const recency = (q: Question) => ranks.get(questionFingerprint(q));

    const prepared = jobId
      ? await prepareJobExam(jobId)
      : await prepareCombinedExam(uid, examSizeFor({ hasGithubEvidence: withGithub }), recency);
    if (prepared instanceof NextResponse) return prepared;
    const { level, poolKey, scope, skillLevels } = prepared;

    if (!prepared.picked && prepared.pool.length === 0) {
      return NextResponse.json({ error: "no_questions" }, { status: 502 });
    }

    const overrideSet = typeof prepared.override === "number" && Number.isInteger(prepared.override);
    const examSize = examSizeFor({ hasGithubEvidence: withGithub, override: prepared.override });

    // Límite de intentos. Se consume AQUÍ, con el repertorio ya validado: un 503/409 anterior no
    // gasta el intento, pero abandonar una prueba empezada sí (si no, bastaría con abrirla para
    // ver las preguntas y salir).
    const limited = await consumeAttempt(scope, uid);
    if (limited) return limited;

    // Sorteo estratificado por skill y por tipo, priorizando lo no visto; y opciones barajadas.
    // (La prueba combinada ya viene sorteada de composeCombinedExam.)
    const picked = prepared.picked ?? pickRandomQuestions(prepared.pool, examSize, recency);
    const questions = picked.map(shuffleQuestionOptions);

    fillDefaultLevels(questions, skillLevels, level);

    const timeLimitMinutes = timeLimitMinutesFor(prepared.timeOverride);
    const now = Date.now();
    const expiresAt = now + timeLimitMinutes * 60 * 1000;

    const sessionRef = adminDb().collection("line_sessions").doc();
    const batch = adminDb().batch();
    await deleteDisposableSessions(uid, now, batch);
    batch.set(sessionRef, {
      userId: uid,
      jobId: jobId ?? null,
      questions,
      level,
      skillLevels,
      timeLimitMinutes,
      expiresAt,
      // Para una política TTL de Firestore sobre este campo: borra las sesiones abandonadas un
      // día después de vencer (ver docs/DEPLOYMENT.md). Sin la política, no hace nada.
      expireAt: Timestamp.fromMillis(expiresAt + 24 * 60 * 60 * 1000),
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(seenRef, {
      uid,
      poolKey,
      fingerprints: updateSeenList(seen, picked.map(questionFingerprint)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({
      sessionId: sessionRef.id,
      questions: stripAnswerKey(questions),
      examSize: questions.length,
      githubCompensated: withGithub && !overrideSet,
      level,
      // Prueba combinada: tecnologías del perfil que aún no tienen preguntas, y si hubo teoría.
      ...(prepared.combinedInfo ?? {}),
      timeLimitMinutes,
      // El cliente cuenta con su propio reloj a partir de esto (no con `expiresAt`, que depende
      // de que los relojes coincidan).
      timeLimitSeconds: timeLimitMinutes * 60,
    });
  } catch (err) {
    console.error("[line/start] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/** Lo que cada modo (vacante o prueba combinada) aporta antes de crear la sesión. */
interface PreparedExam {
  /** Repertorio del que se sortea (vacante). */
  pool: Question[];
  /** Preguntas ya sorteadas (prueba combinada). */
  picked?: Question[];
  /** Tamaño del examen fijado por el reclutador. */
  override?: unknown;
  /** Tiempo fijado por el reclutador; `undefined` = 30 min de práctica. */
  timeOverride?: unknown;
  /** Clave del repertorio, para recordar qué preguntas ya vio el usuario. */
  poolKey: string;
  /** Límite de intentos: por vacante o por la prueba combinada. */
  scope: string;
  /** Nivel de las preguntas por skill (para ponderar el DNA). */
  skillLevels: Record<string, string>;
  level: string;
  combinedInfo?: { uncoveredTechnologies: string[]; theoryIncluded: boolean };
}

/** Vacante: valida que se pueda evaluar y lee (o compone) su repertorio. */
async function prepareJobExam(jobId: string): Promise<PreparedExam | NextResponse> {
  const jobRef = adminDb().collection("jobs").doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  const job = jobSnap.data()!;
  if (job.active === false) {
    return NextResponse.json({ error: "job_closed" }, { status: 409 });
  }

  // Sin skills la prueba no evalúa el puesto; sin dueño no hay empresa que reciba la candidatura.
  if (!Array.isArray(job.requiredSkills) || job.requiredSkills.length === 0 || !job.createdBy) {
    console.error(`[line/start] jobId=${jobId} incompleta (skills/createdBy). No evaluable.`);
    return NextResponse.json({ error: "job_incomplete" }, { status: 409 });
  }

  const level = normalizeLevel(job.level);
  const base = {
    override: job.examQuestionCount,
    timeOverride: job.examTimeLimitMinutes,
    level,
    poolKey: `job_${jobId}`,
    scope: attemptScope({ jobId }),
  };
  const keyRef = adminDb().collection("job_answer_keys").doc(jobId);
  const keyData = (await keyRef.get()).data();
  const pool = readPool(keyData);
  if (pool.length > 0) {
    return { ...base, pool, skillLevels: readCoveredLevels(keyData?.covered, level) };
  }

  // La vacante no tiene repertorio (se publicó antes de este cambio, o falló al publicarse):
  // se compone ahora desde el banco. Rápido y sin IA, así que cabe en la petición.
  const composed = await composeJobPoolFromBank(
    adminDb(),
    job.requiredSkills,
    typeof job.level === "string" ? job.level : "senior",
  );

  if (composed.questions.length < JOB_POOL_MIN_QUESTIONS) {
    console.error(
      `[line/start] jobId=${jobId} sin banco suficiente (${composed.questions.length}). ` +
        `Skills sin preguntas: ${composed.missing.join(", ") || "—"}`,
    );
    return NextResponse.json({ error: "job_without_bank", missingSkills: composed.missing }, { status: 409 });
  }

  // Transacción: dos candidatos que empiezan a la vez comparten el mismo repertorio.
  const shared = await adminDb().runTransaction(async (tx) => {
    const fresh = readPool((await tx.get(keyRef)).data());
    if (fresh.length > 0) return fresh;
    tx.set(keyRef, {
      jobId,
      questions: composed.questions,
      covered: composed.covered,
      missing: composed.missing,
      source: "bank",
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(jobRef, {
      assessmentReady: true,
      assessmentPoolSize: composed.questions.length,
      assessmentMissingSkills: composed.missing,
    });
    return composed.questions;
  });
  return { ...base, pool: shared, skillLevels: readCoveredLevels(composed.covered, level) };
}

/** Prueba combinada: tecnologías y nivel salen del perfil, no del body. */
async function prepareCombinedExam(
  uid: string,
  examSize: number,
  recency: (q: Question) => number | undefined,
): Promise<PreparedExam | NextResponse> {
  const userData = (await adminDb().collection("users").doc(uid).get()).data();
  const technologies = normalizeLineTechnologies(userData?.lineTechnologies).slice(0, MAX_LINE_TECHNOLOGIES);
  const level = lineLevelFromSelfLevel(userData?.candidateProfile?.selfLevel);

  if (!level) return NextResponse.json({ error: "profile_incomplete" }, { status: 409 });
  if (technologies.length === 0) return NextResponse.json({ error: "no_technologies" }, { status: 409 });

  const refs = combinedPoolDocIds(technologies, level).map((id) =>
    adminDb().collection("line_question_pools").doc(id),
  );
  const bank: Record<string, Question[]> = {};
  for (const snap of await adminDb().getAll(...refs)) {
    const questions = readPool(snap.data());
    if (questions.length > 0) bank[snap.id] = questions;
  }

  const exam = composeCombinedExam({ technologies, level, bank, examSize, recency });
  const uncovered = technologies.filter((t) => exam.coverage[t] === null);

  if (exam.questions.length === 0) {
    console.warn(`[line/start] prueba combinada sin banco: ${technologies.join(", ")} (${level})`);
    return NextResponse.json({ error: "pool_not_seeded", missing: uncovered, level }, { status: 503 });
  }
  return {
    pool: [],
    picked: exam.questions,
    level,
    poolKey: "combined",
    scope: attemptScope({ combined: true }),
    skillLevels: exam.skillLevels,
    combinedInfo: { uncoveredTechnologies: uncovered, theoryIncluded: exam.theoryLevel !== null },
  };
}

/**
 * Limpieza: sesiones vencidas o abandonadas de ESTE usuario (la TTL de Firestore requiere
 * facturación). Solo filtra por `userId` (índice simple, sin índice compuesto) y decide en
 * memoria. Nunca toca una sesión que todavía se podría enviar.
 */
async function deleteDisposableSessions(uid: string, now: number, batch: WriteBatch) {
  const ownSessions = await adminDb()
    .collection("line_sessions")
    .where("userId", "==", uid)
    .limit(SESSION_CLEANUP_SCAN_LIMIT)
    .get();
  for (const doc of ownSessions.docs) {
    const data = doc.data();
    const createdAtMs =
      typeof data.createdAt?.toMillis === "function" ? (data.createdAt.toMillis() as number) : null;
    if (isSessionDisposable({ expiresAt: data.expiresAt, createdAtMs }, now)) batch.delete(doc.ref);
  }
}

/** Consume el intento del día; devuelve la respuesta 429 si ya no quedan. */
async function consumeAttempt(scope: string, uid: string): Promise<NextResponse | null> {
  const rule = attemptRule();
  if (!rule) return null;
  const decision = await consumeRateLimit(adminDb(), scope, uid, rule);
  return decision.allowed ? null : rateLimitedResponse(decision);
}

/** Nivel por skill: lo que no trae nivel propio se pondera con el nivel de la prueba. */
function fillDefaultLevels(questions: Question[], skillLevels: Record<string, string>, level: string) {
  for (const q of questions) {
    const tag = String(q.tag || "general").toLowerCase();
    if (!skillLevels[tag]) skillLevels[tag] = level;
  }
}
