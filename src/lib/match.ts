import { canonicalSkillKey } from "./technologies";

/**
 * Cálculo del match candidato ↔ vacante. Función PURA (sin dependencias de Firebase),
 * por eso vive aquí y es testeable de forma aislada. La usa `JobService.calculateMatch`.
 *
 * Suma los scores del usuario para las skills requeridas presentes y divide entre el total
 * de skills requeridas (penaliza las faltantes). Devuelve 0–100.
 *
 * Cada skill se busca por su id canónico ("Next.js" → "nextjs") y, si no aparece, por su texto en
 * minúsculas. Sin lo primero, una vacante escrita con un alias nunca veía el score que el
 * candidato había ganado en The LINE bajo la clave canónica.
 */
export function calculateMatch(
  jobSkills: string[],
  userScores: { [key: string]: number }
): number {
  if (!jobSkills || !jobSkills.length) return 0;
  if (!userScores || Object.keys(userScores).length === 0) return 0;

  let totalScore = 0;
  let foundSkills = 0;

  for (const skill of jobSkills) {
    const canonical = canonicalSkillKey(skill);
    const lower = skill.trim().toLowerCase();
    // Sin noUncheckedIndexedAccess, TS tipa el índice como `number`; en runtime puede faltar.
    const score: number | undefined = userScores[canonical] ?? userScores[lower];
    if (typeof score === "number") {
      totalScore += score;
      foundSkills++;
    }
  }

  if (foundSkills === 0) return 0;
  return Math.round(totalScore / jobSkills.length);
}
