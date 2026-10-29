import { THEORY_TECHNOLOGY_ID, resolveTechnologyId } from "@/lib/technologies";

/**
 * Tecnologías que The LINE le evalúa a un candidato (`users/{uid}.lineTechnologies`).
 *
 * Las elige el candidato en su perfil profesional y puede cambiarlas, pero SOLO a través de
 * `POST /api/profile/technologies`: la regla de Firestore impide escribir el campo desde el
 * navegador. Al quitar una que ya evaluó, el servidor borra su nota del DNA.
 *
 * No es server-only: la UI lo usa para validar antes de enviar.
 */

/**
 * Máximo a la vez. Con 14 preguntas de tecnología (examen de 20), más de 6 deja a cada una con
 * 1–2 preguntas y su nota sería 0, 50 o 100, que no mide nada.
 */
export const MAX_LINE_TECHNOLOGIES = 6;

/** Ids canónicos del catálogo, sin repetir, sin la teoría (va siempre), y con el tope. */
export function normalizeLineTechnologies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const id = typeof item === "string" ? resolveTechnologyId(item) : null;
    if (id && id !== THEORY_TECHNOLOGY_ID && !out.includes(id)) out.push(id);
    if (out.length >= MAX_LINE_TECHNOLOGIES) break;
  }
  return out;
}

/** Tecnologías que estaban antes y ya no están: sus puntos se restan del DNA. */
export function removedTechnologies(before: unknown, after: string[]): string[] {
  const next = new Set(after);
  return normalizeLineTechnologies(Array.isArray(before) ? before.slice(0, 50) : []).filter((t) => !next.has(t));
}
