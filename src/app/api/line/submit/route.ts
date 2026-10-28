import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import {
  gradeAnswers,
  isValidAnswerSet,
  normalizeStoredQuestions,
} from "@/lib/server/assessment";
import { applyAttemptToDna, isSubmissionLate, levelWeight } from "@/lib/server/line-policy";
import { calculateMatch } from "@/lib/match";
import { summarizeCandidate } from "@/lib/candidate-profile";
import { canonicalSkillKey } from "@/lib/technologies";
import type { Answer, Question } from "@/types/question.types";

export const runtime = "nodejs";

/**
 * POST /api/line/submit
 * Recibe las respuestas de una sesión, corrige EN SERVIDOR contra la clave guardada, y persiste
 * el DNA (`user_skill_scores`) y el intento (`assessment_attempts`) con el Admin SDK. El cliente
 * nunca ve `correctIndex` ni puede escribir su propio DNA.
 *
 * DNA (H1 de la auditoría): cada skill guarda sus últimos 3 intentos ponderados por nivel
 * (junior ×0.6, mid ×0.8, senior ×1) y su valor es el PROMEDIO. Antes era la mejor nota.
 *
 * Tiempo: si la sesión tiene `expiresAt` y el envío llega después (más un margen de red), se
 * rechaza con 410. Las respuestas `null` cuentan como sin responder (se acabó el tiempo).
 *
 * Body: { sessionId: string, answers: Answer[] }
 * Auth: header `Authorization: Bearer <Firebase ID token>`.
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = body?.sessionId;
  // La forma de cada respuesta depende del tipo de su pregunta (índice, booleano o array);
  // `isValidAnswerSet` la comprueba contra el examen antes de corregir.
  const answers: Answer[] = Array.isArray(body?.answers) ? body.answers : [];

  if (!sessionId) {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }

  try {
    const sessionRef = adminDb().collection("line_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }
    const session = sessionSnap.data()!;
    if (session.userId !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const now = Date.now();
    if (isSubmissionLate(session.expiresAt, now)) {
      // La prueba venció sin enviarse a tiempo. No se corrige: quien la abrió y la dejó correr
      // no puede volver horas después con las respuestas buscadas. El intento ya se consumió.
      await adminDb().collection("assessment_attempts").doc(`${uid}_${sessionId}`).set({
        assessmentId: sessionId,
        userId: uid,
        jobId: session.jobId ?? null,
        status: "expired",
        score: 0,
        level: session.level ?? null,
        startedAt: session.createdAt ?? FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
      });
      await sessionRef.delete();
      return NextResponse.json({ error: "session_expired" }, { status: 410 });
    }

    const questions = normalizeStoredQuestions(session.questions as Question[]);

    // El set de respuestas debe corresponder 1:1 con el examen y tener la forma que exige cada
    // tipo. Antes, un `answers` incompleto se corregía en silencio (las faltantes contaban como
    // falladas).
    if (!isValidAnswerSet(questions, answers)) {
      return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
    }

    const { skillScores, overall } = gradeAnswers(questions, answers);

    // Mapa de respuestas del usuario para el historial del intento. Se serializa a JSON porque
    // según el tipo puede ser un índice, un booleano o un array.
    const answersMap: Record<string, string> = {};
    questions.forEach((q, i) => {
      answersMap[q.id] = JSON.stringify(answers[i] ?? null);
    });

    // DNA: promedio de los últimos intentos, ponderados por nivel (ver line-policy.ts).
    // Va en TRANSACCIÓN: era un read-modify-write y dos simulaciones concurrentes del mismo
    // usuario (p.ej. dos pestañas) podían perder una de las dos actualizaciones.
    const sessionLevel: string | undefined = typeof session.level === "string" ? session.level : undefined;
    const skillLevels: Record<string, string> =
      session.skillLevels && typeof session.skillLevels === "object" ? session.skillLevels : {};
    const scoresRef = adminDb().collection("user_skill_scores").doc(uid);
    const merged = await adminDb().runTransaction(async (tx) => {
      const currentSnap = await tx.get(scoresRef);
      const next = applyAttemptToDna(currentSnap.data(), skillScores, skillLevels, sessionLevel, now);
      tx.set(
        scoresRef,
        { uid, scores: next.scores, history: next.history, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return next.scores;
    });

    // Registro del intento (historial + métrica de "Simulaciones").
    const attemptId = `${uid}_${sessionId}`;
    await adminDb().collection("assessment_attempts").doc(attemptId).set({
      assessmentId: sessionId,
      userId: uid,
      jobId: session.jobId ?? null,
      status: "completed",
      answers: answersMap,
      score: overall,
      level: sessionLevel ?? null,
      skillLevels,
      unanswered: answers.filter((a) => a === null).length,
      startedAt: session.createdAt ?? FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });

    // Si la simulación era la prueba de una vacante concreta, registramos el candidato para el
    // reclutador dueño (loop developer→recruiter). Cierra el ciclo: la vacante ve aplicantes reales
    // y `/candidates` puede rankear por DNA. Tomar la prueba de una vacante = postular = consentir
    // compartir el resultado con ese reclutador. Es best-effort: un fallo aquí no invalida el intento.
    const jobId: string | null = session.jobId ?? null;
    if (jobId) {
      try {
        const jobSnap = await adminDb().collection("jobs").doc(jobId).get();
        const job = jobSnap.data();
        if (!job) {
          console.error(`[line/submit] la sesión apunta a jobId=${jobId} que ya no existe.`);
        } else if (!job.createdBy) {
          // Antes esto se saltaba en silencio: el candidato completaba la prueba, veía su score,
          // y el reclutador NUNCA recibía la candidatura. Una vacante sin dueño no puede
          // notificar a nadie, así que al menos queda constancia en el log.
          console.error(
            `[line/submit] jobId=${jobId} no tiene createdBy: la candidatura de ${uid} no se ` +
              "puede entregar a ninguna empresa. Vacante huérfana; debe retirarse del listado.",
          );
        } else {
          const requiredSkills: string[] = Array.isArray(job.requiredSkills) ? job.requiredSkills : [];
          const userSnap = await adminDb().collection("users").doc(uid).get();
          const candidateName: string = userSnap.data()?.displayName || "Candidato";
          // Resumen del perfil profesional (experiencia, estudios…) para la empresa. Postular es
          // consentir compartirlo, igual que el resultado. Sin email ni teléfono. Se actualiza en
          // cada intento, así la empresa ve el perfil vigente.
          const candidate = summarizeCandidate(userSnap.data()?.candidateProfile);

          // Snapshot de los scores del candidato en las skills que pide la vacante.
          const skillsSnapshot: Record<string, number> = {};
          for (const skill of requiredSkills) {
            // Clave canónica ("Next.js" → "nextjs"): es bajo la que se acredita el DNA. Con el texto
            // tal cual, el reclutador veía 0 en una skill que el candidato sí había demostrado.
            const key = canonicalSkillKey(skill);
            skillsSnapshot[key] = merged[key] ?? merged[skill.trim().toLowerCase()] ?? 0;
          }
          const matchPercent = calculateMatch(requiredSkills, merged);

          const matchId = `${uid}_${jobId}`;
          const matchRef = adminDb().collection("candidate_matches").doc(matchId);
          const jobRef = adminDb().collection("jobs").doc(jobId);

          // Mismo patrón read-modify-write que el DNA: en transacción para no perder el mejor
          // score entre intentos concurrentes y para que `applicantsCount` no se desincronice
          // del número real de candidatos (el contador solo sube al crear el match).
          await adminDb().runTransaction(async (tx) => {
            const matchSnap = await tx.get(matchRef);
            const isNewApplicant = !matchSnap.exists;
            const bestScore = Math.max(matchSnap.data()?.score ?? 0, overall);

            tx.set(
              matchRef,
              {
                userId: uid,
                recruiterId: job.createdBy,
                jobId,
                jobTitle: job.title ?? "",
                candidateName,
                candidate,
                score: bestScore,
                matchPercent,
                skills: skillsSnapshot,
                completedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            // Solo la primera vez que este candidato aplica a esta vacante cuenta como aplicante nuevo.
            if (isNewApplicant) {
              tx.update(jobRef, { applicantsCount: FieldValue.increment(1) });
            }
          });
        }
      } catch (matchErr) {
        console.error("[line/submit] candidate_match error:", matchErr);
      }
    }

    // La sesión es de un solo uso.
    await sessionRef.delete();

    // `overall` y `skillScores` son la nota de ESTA prueba en %; `dnaScores` es cómo quedó el DNA
    // de cada skill evaluada (promedio ponderado). La UI muestra ambas.
    const dnaScores: Record<string, number> = {};
    for (const skill of Object.keys(skillScores)) dnaScores[skill] = merged[skill];

    return NextResponse.json({
      overall,
      skillScores,
      dnaScores,
      level: sessionLevel ?? null,
      levelWeight: levelWeight(sessionLevel),
    });
  } catch (err) {
    console.error("[line/submit] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
