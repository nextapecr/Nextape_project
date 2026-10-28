import { resolveTechnologyId } from "@/lib/technologies";

/**
 * Quita del DNA las tecnologías que el candidato sacó de su perfil. PURA.
 *
 * Regla de producto (2026-10): el candidato puede cambiar sus tecnologías como un ajuste, pero si
 * quita una que ya evaluó en The LINE, pierde esos puntos. Así no puede quedarse con la nota de
 * algo que ya no declara (ni "esconder" una mala nota sin perderla).
 */
export function removeTechnologiesFromDna(
  dna: { scores?: Record<string, unknown>; history?: Record<string, unknown> } | undefined,
  removed: string[],
): { scores: Record<string, unknown>; history: Record<string, unknown>; lost: Record<string, number> } {
  const scores = { ...(dna?.scores ?? {}) };
  const history = { ...(dna?.history ?? {}) };
  const lost: Record<string, number> = {};
  // Se compara por id canónico: el DNA antiguo puede tener claves con alias ("React.js").
  const gone = new Set(removed.map((t) => resolveTechnologyId(t) ?? t));
  const isGone = (key: string) => gone.has(resolveTechnologyId(key) ?? key);
  for (const key of Object.keys(scores)) {
    if (!isGone(key)) continue;
    const value = scores[key];
    const canonical = resolveTechnologyId(key) ?? key;
    if (typeof value === "number") lost[canonical] = Math.max(lost[canonical] ?? 0, value);
    delete scores[key];
  }
  for (const key of Object.keys(history)) if (isGone(key)) delete history[key];
  return { scores, history, lost };
}
