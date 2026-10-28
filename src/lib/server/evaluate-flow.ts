/**
 * Orquesta el orden de decisiones de `/api/github/evaluate`.
 * Extraído con inyección de dependencias para poder testearlo sin Firebase ni la API de GitHub.
 */

import { authorizeRepo } from "@/lib/server/github-authorization";
import type { RateLimitDecision } from "@/lib/server/rate-limit";

/** Lo que produce analizar un repo: el documento a guardar y la respuesta para el cliente. */
export interface RepoAnalysis<E, R> {
  evidence: E;
  response: R;
}

export interface EvaluateFlowDeps<E = unknown, R = unknown> {
  fetchRepoMetadata: (owner: string, repo: string) => Promise<{ full_name: string; private: boolean }>;
  getUserAllowlist: (uid: string) => Promise<string[]>;
  checkCache: (uid: string, repoFullName: string) => Promise<{ hit: boolean; data?: R }>;
  /** Devuelve la decisión completa para que la respuesta 429 lleve el `Retry-After` real. */
  consumeRateLimit: (uid: string) => Promise<Pick<RateLimitDecision, "allowed"> & Partial<RateLimitDecision>>;
  /** Recibe SOLO el documento de evidencia (no la respuesta al cliente). */
  writeEvidence: (uid: string, repoFullName: string, evidence: E) => Promise<void>;
  analyzeRepo: (owner: string, repo: string) => Promise<RepoAnalysis<E, R>>;
}

export type FlowResult<R = unknown> =
  | { type: "repo_not_found"; status: 404 }
  | { type: "not_authorized"; status: 403 }
  | { type: "cache_hit"; status: 200; data: R | undefined }
  | { type: "rate_limited"; status: 429; retryAfterMs: number }
  | { type: "success"; status: 200; data: R };

/**
 * Evalúa un repositorio de GitHub en este orden:
 * 1. Metadatos (llamada ligera)
 * 2. Autorización si es privado (lista de repos privados del usuario, sin distinguir mayúsculas)
 * 3. Caché
 * 4. Límite de peticiones
 * 5. Análisis + escritura de la evidencia
 */
export async function evaluateRepoFlow<E, R>(
  owner: string,
  repo: string,
  uid: string,
  deps: EvaluateFlowDeps<E, R>,
): Promise<FlowResult<R>> {
  // Paso 1: metadatos
  let metadata;
  try {
    metadata = await deps.fetchRepoMetadata(owner, repo);
  } catch (error) {
    // 404: el repo no existe o el token no tiene acceso
    if (error instanceof Error && "httpStatus" in error && (error as Error & { httpStatus: number }).httpStatus === 404) {
      return { type: "repo_not_found", status: 404 };
    }
    throw error;
  }

  // Mismo nombre que usaba la ruta antes de extraer este flujo: es la clave del documento de
  // evidencia y de la caché, así que no se cambia (evita duplicar documentos por mayúsculas).
  const fullName = `${owner}/${repo}`;

  // Paso 2: autorización (solo repos privados). Misma regla que `aggregate`.
  if (metadata.private) {
    const allowlist = await deps.getUserAllowlist(uid);
    if (!authorizeRepo(metadata, allowlist).allowed) {
      // CRÍTICO: 403 SIN consumir límite ni escribir en Firestore
      return { type: "not_authorized", status: 403 };
    }
  }

  // Paso 3: caché
  const cache = await deps.checkCache(uid, fullName);
  if (cache.hit) {
    return { type: "cache_hit", status: 200, data: cache.data };
  }

  // Paso 4: límite de peticiones
  const rateLimit = await deps.consumeRateLimit(uid);
  if (!rateLimit.allowed) {
    return { type: "rate_limited", status: 429, retryAfterMs: rateLimit.retryAfterMs ?? 0 };
  }

  // Paso 5: análisis + escritura. Se guarda la EVIDENCIA, no el par { evidence, response }:
  // `aggregate` y la caché leen campos de primer nivel (githubUsername, isPrivate, analyzedAt…).
  const analysis = await deps.analyzeRepo(owner, repo);
  await deps.writeEvidence(uid, fullName, analysis.evidence);

  return { type: "success", status: 200, data: analysis.response };
}
