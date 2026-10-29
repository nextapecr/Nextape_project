import { NextRequest, NextResponse } from "next/server";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { examSizeFor } from "@/lib/server/assessment";
import { hasGithubEvidence } from "@/lib/server/github-evidence";
import {
  attemptCooldownHours,
  COMBINED_SCOPE,
  PRACTICE_SCOPE_PREFIX,
  PRACTICE_TIME_LIMIT_MINUTES,
} from "@/lib/server/line-policy";
import { lineLevelFromSelfLevel, planCombinedExam } from "@/lib/server/combined-exam";
import { normalizeLineTechnologies } from "@/lib/line-technologies";
import { THEORY_TECHNOLOGY_ID } from "@/lib/technologies";
import { RATE_LIMIT_COLLECTION } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/line/catalog
 * Devuelve qué combinaciones (tecnología/especialidad × nivel) tienen repertorio precargado.
 *
 * Existe porque el selector de The LINE mostraba las 55 tecnologías del catálogo, pero solo las
 * precargadas funcionan: elegir cualquier otra devolvía 503 y el usuario lo vivía como "The LINE
 * está roto". Ofrecer una opción que no funciona es peor que no ofrecerla.
 *
 * Solo lee metadatos (clave, nivel, número de preguntas). **Nunca** devuelve preguntas: el
 * repertorio contiene las claves de respuesta y es server-only.
 *
 * También devuelve `cooldowns` (tecnología → epoch ms en que se puede volver a intentar) para que
 * la UI avise ANTES de empezar en vez de devolver un 429 al pulsar el botón.
 */
export async function GET(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const cooldownHours = attemptCooldownHours();
    const [snap, githubSnap, limitsSnap, userSnap] = await Promise.all([
      adminDb().collection("line_question_pools").get(),
      adminDb().collection("github_evidence").doc(uid).get(),
      adminDb().collection(RATE_LIMIT_COLLECTION).where("uid", "==", uid).get(),
      adminDb().collection("users").doc(uid).get(),
    ]);

    /** subject → momento (epoch ms) en que vuelve a estar disponible. */
    const cooldowns: Record<string, number> = {};
    const now = Date.now();
    const windowMs = cooldownHours * 60 * 60 * 1000;
    let combinedRetryAt: number | null = null;
    limitsSnap.forEach((doc) => {
      const data = doc.data();
      const scope = String(data.scope ?? "");
      if (scope === COMBINED_SCOPE && windowMs > 0) {
        const retryAt = Number(data.windowStart) + windowMs;
        if (Number(data.count) >= 1 && retryAt > now) combinedRetryAt = retryAt;
        return;
      }
      if (!scope.startsWith(PRACTICE_SCOPE_PREFIX) || windowMs <= 0) return;
      const retryAt = Number(data.windowStart) + windowMs;
      if (Number(data.count) >= 1 && retryAt > now) {
        cooldowns[scope.slice(PRACTICE_SCOPE_PREFIX.length)] = retryAt;
      }
    });
    // La UI explica el tamaño del examen ANTES de empezar: 10 con GitHub analizado, 20 sin él.
    const hasGithub = hasGithubEvidence(githubSnap.data());

    /** subject → niveles disponibles */
    const available: Record<string, string[]> = {};
    snap.forEach((doc) => {
      const data = doc.data();
      const count = data.count ?? (Array.isArray(data.questions) ? data.questions.length : 0);
      if (count <= 0) return; // un repertorio vacío no sirve para examinar

      const level = String(data.level ?? doc.id.split("_").pop() ?? "");
      const subject = String(data.key ?? doc.id.replace(new RegExp(`_${level}$`), ""));
      if (!subject || !level) return;

      available[subject] = [...(available[subject] ?? []), level];
    });

    // Prueba combinada de ESTE usuario: qué tecnologías entran, a qué nivel y cuáles aún no tienen
    // preguntas (para avisarle antes de empezar).
    const user = userSnap.data();
    const technologies = normalizeLineTechnologies(user?.lineTechnologies);
    const examSize = examSizeFor({ hasGithubEvidence: hasGithub });
    const combined = {
      technologies,
      level: lineLevelFromSelfLevel(user?.candidateProfile?.selfLevel),
      covered: technologies.filter((t) => (available[t] ?? []).length > 0),
      uncovered: technologies.filter((t) => !(available[t] ?? []).length),
      theoryAvailable: (available[THEORY_TECHNOLOGY_ID] ?? []).length > 0,
      plan: planCombinedExam(examSize),
      retryAt: combinedRetryAt,
    };

    return NextResponse.json({
      available,
      combined,
      hasGithub,
      examSize,
      timeLimitMinutes: PRACTICE_TIME_LIMIT_MINUTES,
      cooldownHours,
      cooldowns,
    });
  } catch (err) {
    console.error("[line/catalog] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
