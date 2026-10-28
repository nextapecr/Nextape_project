import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
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

    let pool: Question[] = [];
    let override: unknown;
    let timeOverride: unknown;
    /** Clave del repertorio, para recordar qué preguntas ya vio el usuario. */
    let poolKey: string;
    /** Límite de intentos: por vacante o por tecnología. */
    let scope: string;
    /** Nivel de las preguntas por skill (para ponderar el DNA). */
    let skillLevels: Record<string, string> = {};
    let level: string;
    /** Prueba combinada ya compuesta (modo sin vacante). En vacante se sortea de `pool` más abajo. */
    let combinedQuestions: Question[] | null = null;
    /** Tecnologías del perfil sin banco todavía, para avisar en la UI. */
    let uncovered: string[] = [];
    let theoryIncluded = false;

    // Preguntas que el usuario ya vio, de la más antigua a la más reciente. En la prueba combinada
    // la memoria es una sola para todas sus tecnologías (las huellas son por enunciado).
    const seenKey = jobId ? `job_${jobId}` : "combined";
    const seenRef = adminDb().collection("line_seen").doc(`${uid}_${seenKey}`);
    const seen: string[] = (await seenRef.get()).data()?.fingerprints ?? [];
    const ranks = seenRanks(Array.isArray(seen) ? seen : []);
    const recency = (q: Question) => ranks.get(questionFingerprint(q));

    if (jobId) {
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

      override = job.examQuestionCount;
      timeOverride = job.examTimeLimitMinutes;
      level = normalizeLevel(job.level);
      poolKey = `job_${jobId}`;
      scope = attemptScope({ jobId });
      const keyRef = adminDb().collection("job_answer_keys").doc(jobId);
      const keyData = (await keyRef.get()).data();
      pool = readPool(keyData);
      skillLevels = readCoveredLevels(keyData?.covered, level);

      if (pool.length === 0) {
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
          return NextResponse.json(
            { error: "job_without_bank", missingSkills: composed.missing },
            { status: 409 },
          );
        }

        // Transacción: dos candidatos que empiezan a la vez comparten el mismo repertorio.
        pool = await adminDb().runTransaction(async (tx) => {
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
        skillLevels = readCoveredLevels(composed.covered, level);
      }
    } else {
      // Prueba combinada: tecnologías y nivel salen del perfil, no del body.
      const userData = (await adminDb().collection("users").doc(uid).get()).data();
      const technologies = normalizeLineTechnologies(userData?.lineTechnologies).slice(0, MAX_LINE_TECHNOLOGIES);
      const profileLevel = lineLevelFromSelfLevel(userData?.candidateProfile?.selfLevel);

      if (!profileLevel) {
        return NextResponse.json({ error: "profile_incomplete" }, { status: 409 });
      }
      if (technologies.length === 0) {
        return NextResponse.json({ error: "no_technologies" }, { status: 409 });
      }

      level = profileLevel;
      poolKey = "combined";
      scope = attemptScope({ combined: true });

      const refs = combinedPoolDocIds(technologies, level).map((id) =>
        adminDb().collection("line_question_pools").doc(id),
      );
      const snaps = await adminDb().getAll(...refs);
      const bank: Record<string, Question[]> = {};
      snaps.forEach((snap) => {
        const questions = readPool(snap.data());
        if (questions.length > 0) bank[snap.id] = questions;
      });

      const exam = composeCombinedExam({
        technologies,
        level,
        bank,
        examSize: examSizeFor({ hasGithubEvidence: withGithub }),
        recency,
      });
      uncovered = technologies.filter((t) => exam.coverage[t] === null);
      theoryIncluded = exam.theoryLevel !== null;

      if (exam.questions.length === 0) {
        console.warn(`[line/start] prueba combinada sin banco: ${technologies.join(", ")} (${level})`);
        return NextResponse.json({ error: "pool_not_seeded", missing: uncovered, level }, { status: 503 });
      }
      combinedQuestions = exam.questions;
      skillLevels = exam.skillLevels;
    }

    if (!combinedQuestions && pool.length === 0) {
      return NextResponse.json({ error: "no_questions" }, { status: 502 });
    }

    const overrideSet = typeof override === "number" && Number.isInteger(override);
    const examSize = examSizeFor({ hasGithubEvidence: withGithub, override });

    // Límite de intentos. Se consume AQUÍ, con el repertorio ya validado: un 503/409 anterior no
    // gasta el intento, pero abandonar una prueba empezada sí (si no, bastaría con abrirla para
    // ver las preguntas y salir).
    const rule = attemptRule();
    if (rule) {
      const decision = await consumeRateLimit(adminDb(), scope, uid, rule);
      if (!decision.allowed) return rateLimitedResponse(decision);
    }

    // Sorteo estratificado por skill y por tipo, priorizando lo no visto; y opciones barajadas.
    // (La prueba combinada ya viene sorteada de composeCombinedExam.)
    const picked = combinedQuestions ?? pickRandomQuestions(pool, examSize, recency);
    const questions = picked.map(shuffleQuestionOptions);

    // Nivel por skill: en práctica, todas las preguntas son del nivel elegido.
    for (const q of questions) {
      const tag = String(q.tag || "general").toLowerCase();
      if (!skillLevels[tag]) skillLevels[tag] = level;
    }

    const timeLimitMinutes = timeLimitMinutesFor(jobId ? timeOverride : undefined);
    const now = Date.now();
    const expiresAt = now + timeLimitMinutes * 60 * 1000;

    // Limpieza: sesiones vencidas o abandonadas de ESTE usuario (la TTL de Firestore requiere
    // facturación). Solo filtra por `userId` (índice simple, sin índice compuesto) y decide en
    // memoria. Nunca toca una sesión que todavía se podría enviar.
    const ownSessions = await adminDb()
      .collection("line_sessions")
      .where("userId", "==", uid)
      .limit(SESSION_CLEANUP_SCAN_LIMIT)
      .get();

    const sessionRef = adminDb().collection("line_sessions").doc();
    const batch = adminDb().batch();
    ownSessions.forEach((doc) => {
      const data = doc.data();
      const createdAtMs =
        typeof data.createdAt?.toMillis === "function" ? (data.createdAt.toMillis() as number) : null;
      if (isSessionDisposable({ expiresAt: data.expiresAt, createdAtMs }, now)) batch.delete(doc.ref);
    });
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
      ...(jobId ? {} : { uncoveredTechnologies: uncovered, theoryIncluded }),
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
