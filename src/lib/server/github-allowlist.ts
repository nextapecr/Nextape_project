import type { Firestore } from "firebase-admin/firestore";

/**
 * Lista de repos privados que el usuario autorizó para el análisis ("owner/repo").
 *
 * Fuente ÚNICA: `github_tokens/{uid}.privateReposAllowlist`, que es donde la escribe
 * `POST /api/github/repos/allowlist` (y de donde la lee `/api/github/repos`). `evaluate` y
 * `aggregate` la leían de `users/{uid}`, donde nadie la escribe: todos los repos privados salían
 * rechazados aunque el usuario los hubiera autorizado.
 */
export async function readPrivateReposAllowlist(db: Firestore, uid: string): Promise<string[]> {
  const data = (await db.collection("github_tokens").doc(uid).get()).data();
  const list = data?.privateReposAllowlist;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}
