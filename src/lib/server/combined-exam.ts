import { normalizeStoredQuestions, pickRandomQuestions, shuffle } from "./assessment";
import { levelFallbackOrder } from "./job-pool";
import { THEORY_TECHNOLOGY_ID } from "@/lib/technologies";
import type { Question } from "@/types/question.types";

/**
 * Prueba combinada de The LINE (2026-10). SOLO servidor, lógica PURA (testeable sin Firestore).
 *
 * El candidato ya no elige tecnología ni nivel en The LINE: cada prueba mezcla
 *  - ~70 % de preguntas de SUS tecnologías (las de su perfil, `users.lineTechnologies`), y
 *  - ~30 % de teoría de ingeniería de software (SOLID, patrones, arquitectura…),
 * al nivel que declaró en su perfil profesional.
 */

/** Parte de la prueba dedicada a teoría de ingeniería de software. */
export const THEORY_SHARE = 0.3;

export { MAX_LINE_TECHNOLOGIES } from "@/lib/line-technologies";

/** Nivel de las preguntas según el nivel que el candidato declaró en su perfil. */
export function lineLevelFromSelfLevel(selfLevel: unknown): "junior" | "mid" | "senior" | null {
  switch (selfLevel) {
    case "trainee":
    case "junior":
      return "junior";
    case "mid":
      return "mid";
    case "senior":
    case "lead":
      return "senior";
    default:
      return null;
  }
}

/** Reparto del examen: cuántas de teoría y cuántas de tecnologías. */
export function planCombinedExam(examSize: number): { theory: number; technologies: number } {
  const theory = Math.round(examSize * THEORY_SHARE);
  return { theory, technologies: examSize - theory };
}

/** Documentos de banco a leer: `{tecnología}_{nivel}` en el orden de respaldo de niveles. */
export function combinedPoolDocIds(technologies: string[], level: string): string[] {
  const ids: string[] = [];
  for (const tech of [...technologies, THEORY_TECHNOLOGY_ID]) {
    for (const lv of levelFallbackOrder(level)) ids.push(`${tech}_${lv}`);
  }
  return [...new Set(ids)];
}

export interface CombinedExam {
  questions: Question[];
  /** Nivel de las preguntas de cada skill (para ponderar el DNA). */
  skillLevels: Record<string, string>;
  /** Tecnología → nivel del banco usado, o `null` si no tiene ningún banco todavía. */
  coverage: Record<string, string | null>;
  /** Nivel del banco de teoría usado, o `null` si aún no está sembrado. */
  theoryLevel: string | null;
}

/** Primer nivel (según el orden de respaldo) con preguntas en el banco. */
function firstAvailable(bank: Record<string, Question[]>, key: string, level: string) {
  for (const lv of levelFallbackOrder(level)) {
    const pool = bank[`${key}_${lv}`];
    if (pool && pool.length > 0) return { level: lv, pool: normalizeStoredQuestions(pool) };
  }
  return null;
}

/**
 * Arma la prueba combinada.
 *
 * Reparto: la teoría se lleva `THEORY_SHARE`; el resto se reparte por turnos entre las tecnologías
 * con banco. Si una tecnología no da para su cuota, lo que sobra pasa a las demás; si falta la
 * teoría o alguna tecnología, sus preguntas también se reparten, para que el examen tenga siempre
 * el tamaño pedido mientras haya preguntas.
 *
 * Los `tag` se fijan al id de la tecnología (clave del DNA) y los `id` se renumeran: cada banco
 * numera desde "0" y en la misma prueba se pisarían.
 */
export function composeCombinedExam({
  technologies,
  level,
  bank,
  examSize,
  recency,
}: {
  technologies: string[];
  level: string;
  bank: Record<string, Question[]>;
  examSize: number;
  recency?: (q: Question) => number | undefined;
}): CombinedExam {
  const coverage: Record<string, string | null> = {};
  const sources: { key: string; level: string; pool: Question[] }[] = [];

  for (const tech of technologies) {
    const found = firstAvailable(bank, tech, level);
    coverage[tech] = found?.level ?? null;
    if (found) sources.push({ key: tech, ...found });
  }
  const theory = firstAvailable(bank, THEORY_TECHNOLOGY_ID, level);

  const plan = planCombinedExam(examSize);
  const quota = new Map<string, number>();
  const capacity = (key: string) =>
    key === THEORY_TECHNOLOGY_ID ? theory?.pool.length ?? 0 : sources.find((s) => s.key === key)?.pool.length ?? 0;

  // 1) Cuota inicial: teoría y reparto por turnos entre tecnologías con banco.
  if (theory) quota.set(THEORY_TECHNOLOGY_ID, Math.min(plan.theory, theory.pool.length));
  for (let i = 0; i < plan.technologies && sources.length > 0; i++) {
    const s = sources[i % sources.length];
    quota.set(s.key, (quota.get(s.key) ?? 0) + 1);
  }
  for (const s of sources) quota.set(s.key, Math.min(quota.get(s.key) ?? 0, s.pool.length));

  // 2) Lo que no entró (teoría ausente, bancos pequeños) se reparte entre quien tenga capacidad,
  //    primero entre tecnologías y por último a la teoría.
  const keys = [...sources.map((s) => s.key), ...(theory ? [THEORY_TECHNOLOGY_ID] : [])];
  let assigned = [...quota.values()].reduce((a, b) => a + b, 0);
  let progress = true;
  while (assigned < examSize && progress) {
    progress = false;
    for (const key of keys) {
      if (assigned >= examSize) break;
      if ((quota.get(key) ?? 0) < capacity(key)) {
        quota.set(key, (quota.get(key) ?? 0) + 1);
        assigned++;
        progress = true;
      }
    }
  }

  // 3) Sorteo estratificado dentro de cada banco, priorizando lo que el usuario no vio.
  const questions: Question[] = [];
  const skillLevels: Record<string, string> = {};
  for (const s of sources) {
    const n = quota.get(s.key) ?? 0;
    if (n === 0) continue;
    skillLevels[s.key] = s.level;
    questions.push(...pickRandomQuestions(s.pool, n, recency).map((q) => ({ ...q, tag: s.key })));
  }
  if (theory && (quota.get(THEORY_TECHNOLOGY_ID) ?? 0) > 0) {
    skillLevels[THEORY_TECHNOLOGY_ID] = theory.level;
    questions.push(
      ...pickRandomQuestions(theory.pool, quota.get(THEORY_TECHNOLOGY_ID)!, recency).map((q) => ({
        ...q,
        tag: THEORY_TECHNOLOGY_ID,
      })),
    );
  }

  // Orden aleatorio y ids únicos dentro de la prueba.
  const shuffled = shuffle(questions);
  return {
    questions: shuffled.map((q, i) => ({ ...q, id: `${q.tag}-${i}` })),
    skillLevels,
    coverage,
    theoryLevel: theory?.level ?? null,
  };
}
