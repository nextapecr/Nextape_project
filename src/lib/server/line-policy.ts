import { createHash } from "crypto";
import type { RateLimitRule } from "@/lib/server/rate-limit";
import type { Question } from "@/types/question.types";

/**
 * Política de intentos, tiempo y puntuación de "The LINE". SOLO servidor.
 *
 * Existe por el hallazgo H1 de la auditoría (2026-10-12): el DNA se podía inflar repitiendo la
 * prueba. Se juntaban cuatro cosas: intentos ilimitados, DNA = MEJOR nota, el mismo banco de 25
 * preguntas casi siempre y ningún límite de tiempo. Además una nota en `junior` valía lo mismo
 * que en `senior`. Todo lo que sigue es lógica PURA (sin red) para poder testearla.
 */

const HOUR_MS = 60 * 60 * 1000;

/* ──────────────────────────────── Intentos ───────────────────────────────── */

/**
 * Horas entre intentos de la MISMA tecnología (o de la misma vacante). 24 por defecto.
 *
 * Se puede cambiar con `LINE_ATTEMPT_COOLDOWN_HOURS` (p. ej. `0` en local para probar sin
 * esperar). En producción no se define y queda en 24.
 */
export function attemptCooldownHours(env: Record<string, string | undefined> = process.env): number {
  const raw = env.LINE_ATTEMPT_COOLDOWN_HOURS;
  if (raw === undefined || raw.trim() === "") return 24;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 24;
}

/** Regla de `consumeRateLimit`: 1 intento por ventana. `null` = sin límite (cooldown 0). */
export function attemptRule(hours = attemptCooldownHours()): RateLimitRule | null {
  if (hours <= 0) return null;
  return { limit: 1, windowMs: hours * HOUR_MS };
}

/** Prefijo de los contadores de práctica en `api_rate_limits` (lo lee `/api/line/catalog`). */
export const PRACTICE_SCOPE_PREFIX = "line_practice_";

/**
 * Ámbito del límite. Práctica: por tecnología/especialidad, **sin importar el nivel** (si no,
 * bastaría con cambiar de nivel para repetir). Vacante: por vacante.
 */
export function attemptScope({ jobId, subject }: { jobId?: string; subject?: string }): string {
  if (jobId) return `line_job_${jobId}`;
  return `${PRACTICE_SCOPE_PREFIX}${subject ?? "unknown"}`;
}

/* ───────────────────────────────── Tiempo ────────────────────────────────── */

/** Tiempo de una práctica general de The LINE. */
export const PRACTICE_TIME_LIMIT_MINUTES = 30;

/** Rango que puede fijar un reclutador para su vacante. */
export const JOB_TIME_LIMIT_MIN_MINUTES = 5;
export const JOB_TIME_LIMIT_MAX_MINUTES = 480;

/**
 * Margen tras el fin del tiempo para aceptar el envío. El cliente envía solo al llegar a 0; esto
 * cubre la latencia de red y el arranque en frío de la función, no regala tiempo para responder.
 */
export const SUBMIT_GRACE_MS = 90 * 1000;

/**
 * Minutos de la prueba. Sin vacante: 30. Con vacante: lo que fije el reclutador
 * (`job.examTimeLimitMinutes`), acotado a [5, 480]; si no fijó nada, 30.
 */
export function timeLimitMinutesFor(jobOverride?: unknown): number {
  if (typeof jobOverride === "number" && Number.isFinite(jobOverride) && jobOverride > 0) {
    return Math.min(
      Math.max(Math.round(jobOverride), JOB_TIME_LIMIT_MIN_MINUTES),
      JOB_TIME_LIMIT_MAX_MINUTES,
    );
  }
  return PRACTICE_TIME_LIMIT_MINUTES;
}

/**
 * ¿Llegó el envío tarde? Las sesiones creadas antes de este cambio no tienen `expiresAt` y se
 * aceptan como antes.
 */
export function isSubmissionLate(expiresAt: unknown, now: number): boolean {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return false;
  return now > expiresAt + SUBMIT_GRACE_MS;
}

/* ────────────────────────────── Puntuación ───────────────────────────────── */

/**
 * Peso de cada nivel en el DNA. La nota de la prueba se sigue mostrando tal cual (en %); lo que
 * cambia es cuánto aporta al DNA: un 100 % en junior suma 60, en mid 80 y en senior 100.
 */
export const LEVEL_WEIGHTS: Record<string, number> = {
  junior: 0.6,
  mid: 0.8,
  senior: 1,
};

/**
 * Peso de un nivel. Un nivel desconocido pesa 1: solo pasa con sesiones creadas antes de este
 * cambio, y no se debe castigar a quien ya estaba haciendo la prueba durante el despliegue.
 */
export function levelWeight(level: unknown): number {
  return LEVEL_WEIGHTS[String(level ?? "").toLowerCase()] ?? 1;
}

/** Nota que aporta al DNA: la nota de la prueba (0–100) por el peso de su nivel. */
export function weightedScore(raw: number, level: unknown): number {
  return Math.round(Math.min(Math.max(raw, 0), 100) * levelWeight(level));
}

/** Intentos que se promedian por skill. */
export const DNA_HISTORY_SIZE = 3;

export interface DnaHistoryEntry {
  /** Aporte al DNA (nota × peso del nivel). */
  score: number;
  /** Nota de la prueba en esa skill, en %. */
  raw: number;
  level: string;
  /** Epoch ms. */
  at: number;
  /** `true` = valor heredado del DNA anterior a este cambio (no tiene nivel conocido). */
  legacy?: boolean;
}

export interface DnaState {
  scores: Record<string, number>;
  history: Record<string, DnaHistoryEntry[]>;
}

/**
 * Aplica un intento al DNA: por cada skill evaluada, añade su nota ponderada al historial,
 * conserva los últimos `DNA_HISTORY_SIZE` intentos y el DNA pasa a ser su **promedio**.
 *
 * Antes el DNA guardaba la MEJOR nota, así que repetir no costaba nada. Con el promedio, un
 * intento malo también cuenta.
 *
 * Migración: si una skill tiene score pero no historial (DNA de antes de este cambio), ese score
 * entra como un intento más (`legacy`). Así nadie pierde su DNA de golpe y, a los 3 intentos
 * nuevos, el valor heredado deja de contar.
 */
export function applyAttemptToDna(
  prev: { scores?: Record<string, unknown>; history?: Record<string, unknown> } | undefined,
  skillScores: Record<string, number>,
  skillLevels: Record<string, string>,
  fallbackLevel: string | undefined,
  now: number,
): DnaState {
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(prev?.scores ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) scores[k] = v;
  }

  const history: Record<string, DnaHistoryEntry[]> = {};
  for (const [k, v] of Object.entries(prev?.history ?? {})) {
    if (Array.isArray(v)) history[k] = v.filter(isHistoryEntry);
  }

  for (const [skill, raw] of Object.entries(skillScores)) {
    const level = skillLevels[skill] ?? fallbackLevel ?? "";
    const entries = [...(history[skill] ?? [])];

    if (entries.length === 0 && typeof scores[skill] === "number") {
      entries.push({ score: scores[skill], raw: scores[skill], level: "unknown", at: 0, legacy: true });
    }

    entries.push({ score: weightedScore(raw, level), raw, level: level || "unknown", at: now });
    const kept = entries.slice(-DNA_HISTORY_SIZE);

    history[skill] = kept;
    scores[skill] = Math.round(kept.reduce((sum, e) => sum + e.score, 0) / kept.length);
  }

  return { scores, history };
}

function isHistoryEntry(e: unknown): e is DnaHistoryEntry {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as DnaHistoryEntry).score === "number" &&
    Number.isFinite((e as DnaHistoryEntry).score)
  );
}

/* ───────────────────────── Variedad de preguntas ─────────────────────────── */

/** Cuántas huellas de preguntas vistas se recuerdan por usuario y repertorio. */
export const SEEN_MEMORY = 150;

/**
 * Huella estable de una pregunta, por su enunciado. No se usa el `id` porque en el banco es la
 * posición ("0", "1"…) y cambia al ampliar o regenerar el repertorio.
 */
export function questionFingerprint(q: Pick<Question, "text" | "id">): string {
  const text = String(q.text ?? q.id ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

/**
 * Lista de vistas actualizada: las nuevas al final (más recientes), sin duplicados, recortada a
 * `SEEN_MEMORY`.
 */
export function updateSeenList(prev: unknown, served: string[]): string[] {
  const old = Array.isArray(prev) ? prev.filter((x): x is string => typeof x === "string") : [];
  const servedSet = new Set(served);
  return [...old.filter((x) => !servedSet.has(x)), ...served].slice(-SEEN_MEMORY);
}

/**
 * Prioridad de cada pregunta según lo vista que esté: no vistas primero, después las vistas hace
 * más tiempo. Mayor número = más reciente = menos prioridad. `-1` = nunca vista.
 */
export function seenRanks(seen: string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  seen.forEach((fp, i) => ranks.set(fp, i));
  return ranks;
}
