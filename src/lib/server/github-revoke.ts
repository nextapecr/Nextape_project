/**
 * Revocación del token OAuth de GitHub — decisión PURA (sin red) para poder testearla.
 * La usa `POST /api/github/oauth/revoke`.
 *
 * GitHub responde en dos pasos:
 *  1. `POST /applications/{client_id}/token` (check): 200 = el token es de nuestra app; 404 = de otra app
 *     o ya revocado (no se puede confirmar, así que se conserva el dato cifrado).
 *  2. `DELETE /applications/{client_id}/token`: 204 = revocado.
 * Solo un 204 confirmado permite borrar el token cifrado de Firestore.
 */

export type RevokeReason = "other_app" | "temporary" | null;

export interface RevokeOutcome {
  githubRevoked: boolean;
  reason: RevokeReason;
}

/**
 * @param checkStatus  estado HTTP del check, o `"network_error"` si la petición no llegó.
 * @param deleteStatus estado HTTP del DELETE (solo si el check fue 2xx), o `"network_error"`.
 */
export function classifyRevocation(
  checkStatus: number | "network_error",
  deleteStatus?: number | "network_error",
): RevokeOutcome {
  if (checkStatus === "network_error") return { githubRevoked: false, reason: "temporary" };
  if (checkStatus === 404) return { githubRevoked: false, reason: "other_app" };
  if (checkStatus < 200 || checkStatus >= 300) return { githubRevoked: false, reason: "temporary" };
  if (deleteStatus === 204) return { githubRevoked: true, reason: null };
  return { githubRevoked: false, reason: "temporary" };
}

/** El dato cifrado solo se borra si GitHub confirmó la revocación. */
export function shouldDeleteEncryptedToken(outcome: RevokeOutcome): boolean {
  return outcome.githubRevoked;
}
