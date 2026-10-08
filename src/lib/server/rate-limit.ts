import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

/**
 * Límite de peticiones por usuario, en ventana fija, persistido en `api_rate_limits` (server-only).
 *
 * Existe por el análisis de GitHub: todas las peticiones usan el MISMO `GITHUB_TOKEN` del servidor
 * (5000 req/h para toda la plataforma) y `aggregate` llama a Groq GPT-OSS. Sin límite, un solo usuario
 * con un script agotaba la cuota horaria de todos. La memoria del proceso no sirve en Netlify
 * (cada invocación puede caer en una instancia distinta), por eso el contador vive en Firestore.
 *
 * Límite conocido: acota por cuenta, no por persona. Quien cree muchas cuentas puede sumar cuota;
 * cerrarlo exigiría un límite global o por IP.
 */

export const RATE_LIMIT_COLLECTION = "api_rate_limits";

const HOUR_MS = 60 * 60 * 1000;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitState {
  windowStart: number;
  count: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  state: RateLimitState;
  /** Milisegundos hasta que se abre la siguiente ventana (0 si se permite). */
  retryAfterMs: number;
}

/**
 * Presupuesto por usuario y hora. `evaluate` se llama una vez por repositorio, así que su límite
 * cubre un análisis completo (hasta `MAX_REPOS_PER_ANALYSIS`) con margen para reintentos. No más:
 * si raw.githubusercontent.com falla, cada análisis cae a la API de contenidos y cuesta ~17
 * peticiones, y 250/h de una sola cuenta rozaría el presupuesto de toda la plataforma.
 */
export const GITHUB_RATE_LIMITS = {
  repos: { limit: 12, windowMs: HOUR_MS },
  evaluate: { limit: 150, windowMs: HOUR_MS },
  aggregate: { limit: 20, windowMs: HOUR_MS },
} satisfies Record<string, RateLimitRule>;

/** PURA: decide si la petición cabe y devuelve el estado siguiente de la ventana. */
export function decideRateLimit(
  prev: RateLimitState | undefined,
  rule: RateLimitRule,
  now: number
): RateLimitDecision {
  const valid =
    prev &&
    Number.isFinite(prev.windowStart) &&
    Number.isFinite(prev.count) &&
    prev.windowStart <= now &&
    now - prev.windowStart < rule.windowMs;

  if (!valid) {
    return { allowed: true, state: { windowStart: now, count: 1 }, retryAfterMs: 0 };
  }
  if (prev.count >= rule.limit) {
    return { allowed: false, state: prev, retryAfterMs: prev.windowStart + rule.windowMs - now };
  }
  return { allowed: true, state: { windowStart: prev.windowStart, count: prev.count + 1 }, retryAfterMs: 0 };
}

/** Consume una unidad del presupuesto `scope` del usuario, en transacción. */
export async function consumeRateLimit(
  db: Firestore,
  scope: string,
  uid: string,
  rule: RateLimitRule,
  now = Date.now()
): Promise<RateLimitDecision> {
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(`${scope}:${uid}`);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const prev = data ? { windowStart: Number(data.windowStart), count: Number(data.count) } : undefined;
    const decision = decideRateLimit(prev, rule, now);
    if (decision.allowed) {
      tx.set(ref, { uid, scope, ...decision.state, updatedAt: FieldValue.serverTimestamp() });
    }
    return decision;
  });
}

/** Respuesta 429 estándar, con `Retry-After` en segundos. */
export function rateLimitedResponse(decision: RateLimitDecision) {
  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds: seconds },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}
