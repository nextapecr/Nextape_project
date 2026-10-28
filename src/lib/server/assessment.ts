import { randomInt } from "node:crypto";
import { findTechnology } from "@/lib/technologies";
import type {
  Answer,
  Question,
  QuestionType,
  PublicQuestion,
} from "@/types/question.types";

/**
 * Utilidades de servidor para "The LINE". SOLO se importan desde route handlers.
 * Ningún campo de solución (`correctIndex`, `correctIndexes`, `correct`, `correctOrder`)
 * sale de aquí hacia el cliente.
 */

/** Stacks por especialidad para la simulación general. */
export const SPECIALTY_STACKS: Record<string, string[]> = {
  frontend: ["react", "nextjs", "typescript", "tailwind"],
  backend: ["node.js", "postgresql", "docker", "redis"],
  devops: ["kubernetes", "ci-cd", "aws", "terraform"],
};

/**
 * Niveles válidos de una simulación, de menor a mayor. Debe coincidir con el enum del flow de IA.
 *
 * `senior` es el techo. Se retiró `master` (2026-08-03): un cuarto escalón por encima de senior no
 * aportaba señal distinguible al evaluar y multiplicaba el coste de precarga del banco por 4/3.
 * Los repertorios `*_master` que quedaran en Firestore dejan de ser alcanzables; se pueden borrar.
 */
export const LEVELS = ["junior", "mid", "senior"] as const;

/**
 * Preguntas por examen cuando el candidato YA tiene su GitHub analizado: la evidencia de su código
 * real aporta señal, así que el examen puede ser más corto.
 */
export const EXAM_SIZE_WITH_GITHUB = 10;

/** Preguntas por examen sin evidencia de GitHub: se compensa con más preguntas. */
export const EXAM_SIZE_WITHOUT_GITHUB = 20;

/** Rango admitido cuando un reclutador fija el tamaño a mano. */
export const EXAM_SIZE_MIN = 10;
export const EXAM_SIZE_MAX = 30;

/**
 * Tamaño del examen de un candidato.
 *
 * Por defecto depende de si tiene GitHub analizado (10 con, 20 sin). Un reclutador puede fijarlo
 * para su vacante; el valor se acota a [10, 30] para que ninguna prueba vuelva a ser de 5.
 */
export function examSizeFor({
  hasGithubEvidence,
  override,
}: {
  hasGithubEvidence: boolean;
  override?: unknown;
}): number {
  if (typeof override === "number" && Number.isInteger(override)) {
    return Math.min(Math.max(override, EXAM_SIZE_MIN), EXAM_SIZE_MAX);
  }
  return hasGithubEvidence ? EXAM_SIZE_WITH_GITHUB : EXAM_SIZE_WITHOUT_GITHUB;
}

/**
 * Normaliza los parámetros de una simulación general (The LINE libre, sin vacante).
 *
 * `subject` puede ser una **tecnología** del catálogo (`react`, `postgresql`, …) o una de las tres
 * **especialidades** históricas (`frontend`, `backend`, `devops`). Se acota contra listas conocidas:
 * el repertorio se guarda en un doc por `sujeto_nivel`, así que aceptar valores libres permitiría
 * pedir combinaciones inventadas en bucle y ensuciar la colección.
 */
export function normalizeSimulationParams(
  subject: unknown,
  level: unknown
): { subject: string; kind: "technology" | "specialty"; level: string } {
  const raw = String(subject ?? "").trim().toLowerCase();
  const l = String(level ?? "").toLowerCase();
  const normalizedLevel = (LEVELS as readonly string[]).includes(l) ? l : "senior";

  if (raw in SPECIALTY_STACKS) {
    return { subject: raw, kind: "specialty", level: normalizedLevel };
  }
  if (findTechnology(raw)) {
    return { subject: raw, kind: "technology", level: normalizedLevel };
  }
  return { subject: "frontend", kind: "specialty", level: normalizedLevel };
}

/* ────────────────────────────── Compatibilidad ────────────────────────────── */

/**
 * Repara una pregunta leída de Firestore que se guardó antes de existir los tipos.
 *
 * Los repertorios ya creados no llevan `type` y son todos de opción múltiple. Sin esto, una
 * vacante publicada antes de este cambio dejaría de poder evaluarse.
 */
export function normalizeStoredQuestion(raw: Question): Question {
  if (raw?.type) return raw;
  return { ...(raw as object), type: "multiple_choice" } as Question;
}

export function normalizeStoredQuestions(questions: Question[]): Question[] {
  return (questions ?? []).map(normalizeStoredQuestion);
}

/* ────────────────────────── Frontera cliente/servidor ────────────────────── */

/**
 * Construye la versión pública de una pregunta con **lista blanca**: se enumeran los campos que
 * SÍ salen, en vez de borrar los que no. Si mañana se añade un tipo con una clave de solución
 * nueva, no se filtra por olvido. Es la invariante I1 del proyecto.
 */
function toPublicQuestion(q: Question): PublicQuestion {
  const base = {
    id: q.id,
    briefing: q.briefing,
    text: q.text,
    difficulty: q.difficulty,
    tag: q.tag,
  };

  switch (q.type) {
    case "multiple_choice":
      return { ...base, type: "multiple_choice", options: q.options };
    case "code_output":
      return { ...base, type: "code_output", code: q.code, language: q.language, options: q.options };
    case "multi_select":
      return { ...base, type: "multi_select", options: q.options };
    case "true_false":
      return { ...base, type: "true_false" };
    case "ordering":
      return { ...base, type: "ordering", items: q.items };
  }
}

/** Elimina toda clave de solución antes de enviar las preguntas al cliente. */
export function stripAnswerKey(questions: Question[]): PublicQuestion[] {
  return questions.map(toPublicQuestion);
}

/* ─────────────────────────────── Validación ──────────────────────────────── */

function isIndexIn(value: unknown, length: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}

/** ¿La respuesta tiene la forma que exige el tipo de la pregunta? */
export function isValidAnswerFor(question: Question, answer: Answer): boolean {
  switch (question.type) {
    case "multiple_choice":
    case "code_output":
      return isIndexIn(answer, question.options.length);

    case "true_false":
      return typeof answer === "boolean";

    case "multi_select": {
      if (!Array.isArray(answer)) return false;
      // Se admite la respuesta vacía (no marcar nada), pero no índices inválidos ni repetidos.
      if (!answer.every((a) => isIndexIn(a, question.options.length))) return false;
      return new Set(answer).size === answer.length;
    }

    case "ordering": {
      if (!Array.isArray(answer) || answer.length !== question.items.length) return false;
      if (!answer.every((a) => isIndexIn(a, question.items.length))) return false;
      // Debe ser una permutación completa: cada elemento colocado una sola vez.
      return new Set(answer).size === answer.length;
    }
  }
}

/**
 * Valida el set completo de respuestas contra el examen.
 *
 * Sin esto, un envío incompleto se corregía en silencio: las faltantes contaban como falladas y
 * el candidato recibía un score bajo sin saber por qué.
 *
 * Debe haber una entrada por pregunta. `null` es válido y significa **sin responder** (cuenta
 * como fallada): es lo que envía el cliente cuando se acaba el tiempo a mitad de la prueba.
 */
export function isValidAnswerSet(questions: Question[], answers: Answer[]): boolean {
  if (!Array.isArray(answers) || answers.length !== questions.length) return false;
  return questions.every((q, i) => answers[i] === null || isValidAnswerFor(q, answers[i]));
}

/* ──────────────────────────────── Grading ────────────────────────────────── */

/**
 * Puntúa una pregunta de 0 a 1. Determinista, sin IA.
 *
 * `multi_select` y `ordering` admiten **crédito parcial**: en una prueba de nivel senior, acertar
 * 3 de 4 mitigaciones de un incidente no es lo mismo que no acertar ninguna.
 */
export function gradeQuestion(question: Question, answer: Answer): number {
  switch (question.type) {
    case "multiple_choice":
    case "code_output":
      return answer === question.correctIndex ? 1 : 0;

    case "true_false":
      return answer === question.correct ? 1 : 0;

    case "multi_select": {
      if (!Array.isArray(answer)) return 0;
      const correct = new Set(question.correctIndexes);
      if (correct.size === 0) return 0;
      const hits = answer.filter((a) => correct.has(a)).length;
      const misses = answer.length - hits;
      // Restar los fallos evita que marcar todas las opciones garantice la puntuación máxima.
      return Math.max(0, (hits - misses) / correct.size);
    }

    case "ordering": {
      if (!Array.isArray(answer) || question.correctOrder.length === 0) return 0;
      const hits = question.correctOrder.filter((expected, k) => answer[k] === expected).length;
      return hits / question.correctOrder.length;
    }
  }
}

export interface GradeResult {
  /** Score por habilidad (tag) en 0–100. */
  skillScores: Record<string, number>;
  /** Score global de la simulación en 0–100. */
  overall: number;
}

/**
 * Corrige las respuestas contra la clave. `answers[i]` corresponde a `questions[i]`.
 * Score por tag = media de crédito obtenido en ese tag. Global = media del examen completo.
 */
export function gradeAnswers(questions: Question[], answers: Answer[]): GradeResult {
  const perTag: Record<string, { earned: number; total: number }> = {};
  let earnedTotal = 0;

  questions.forEach((q, i) => {
    const tag = String(q.tag || "general").toLowerCase();
    const credit = gradeQuestion(q, answers[i] ?? null);
    perTag[tag] = perTag[tag] || { earned: 0, total: 0 };
    perTag[tag].earned += credit;
    perTag[tag].total++;
    earnedTotal += credit;
  });

  const skillScores: Record<string, number> = {};
  for (const [tag, { earned, total }] of Object.entries(perTag)) {
    skillScores[tag] = Math.round((earned / total) * 100);
  }

  const overall = questions.length > 0 ? Math.round((earnedTotal / questions.length) * 100) : 0;

  return { skillScores, overall };
}

/* ───────────────────────────── Repertorio ────────────────────────────────── */

/** Baraja una copia del array (Fisher-Yates). No muta la entrada. */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    // CSPRNG: con Math.random un atacante que observe sorteos podría predecir los siguientes.
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Elimina preguntas repetidas de un repertorio, comparando el enunciado normalizado.
 * El modelo tiende a repetir escenarios entre llamadas; sin esto, un candidato podría
 * recibir la misma pregunta dos veces en el mismo examen.
 */
export function dedupeQuestions(questions: Question[]): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of questions) {
    const key = (q.text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/**
 * Elige `count` preguntas al azar del repertorio, estratificando por **skill y por tipo**.
 *
 * Por qué doblemente estratificado: si se sortea sin más, un candidato puede recibir 5 preguntas
 * de `react` de opción múltiple y otro 5 de `docker` de ordenar pasos para la misma vacante, y sus
 * scores dejan de ser comparables — que es justo lo que el reclutador usa para rankear. Repartiendo
 * por turnos, todos reciben el mismo *reparto* de skills y de tipos aunque las preguntas cambien.
 *
 * Devuelve menos de `count` solo si el repertorio no da para más.
 *
 * `recency` (opcional) da preferencia a lo que el usuario NO ha visto: dentro de cada grupo
 * salen primero las preguntas que nunca le tocaron y luego las que vio hace más tiempo. Valor
 * mayor = vista más recientemente; ausente = nunca vista. No rompe la estratificación: solo
 * decide QUÉ pregunta sale de cada grupo, no cuántas.
 */
export function pickRandomQuestions(
  pool: Question[],
  count: number,
  recency?: (q: Question) => number | undefined,
): Question[] {
  if (count <= 0 || pool.length === 0) return [];
  if (pool.length <= count) return shuffle(pool);

  // Grupo = combinación (tag, tipo). El reparto por turnos entre grupos equilibra ambas
  // dimensiones a la vez.
  const groups = new Map<string, Question[]>();
  for (const q of pool) {
    const key = `${String(q.tag || "general").toLowerCase()}::${q.type}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }

  // `pop()` toma del final: se ordena para que al final queden las menos vistas. El barajado
  // previo deshace los empates al azar (sort es estable).
  const byFreshness = (g: Question[]) =>
    recency
      ? shuffle(g).sort((a, b) => (recency(b) ?? -1) - (recency(a) ?? -1))
      : shuffle(g);

  const buckets = shuffle([...groups.values()]).map(byFreshness);
  const picked: Question[] = [];

  while (picked.length < count) {
    let tookAny = false;
    for (const bucket of buckets) {
      if (picked.length >= count) break;
      const q = bucket.pop();
      if (q) {
        picked.push(q);
        tookAny = true;
      }
    }
    if (!tookAny) break; // repertorio agotado
  }

  // Se rebaraja para que el orden no revele el reparto por grupo.
  return shuffle(picked);
}

/** Reparto de tipos presente en un conjunto de preguntas (para diagnóstico y UI). */
export function countByType(questions: Question[]): Record<QuestionType, number> {
  const counts = {
    multiple_choice: 0,
    code_output: 0,
    multi_select: 0,
    true_false: 0,
    ordering: 0,
  } as Record<QuestionType, number>;
  for (const q of questions) {
    if (q.type in counts) counts[q.type]++;
  }
  return counts;
}

/* ──────────────────────── Barajado de opciones ───────────────────────────── */

/**
 * Opciones cuyo sentido depende de su posición ("Todas las anteriores", "A y B"…). Si una
 * pregunta tiene alguna, NO se barajan sus opciones: moverlas cambiaría la respuesta correcta.
 */
const POSITIONAL_OPTION = /anterior|above|\bboth\b|\bambas\b|\bopci[oó]n(es)? [a-e]\b|\b[a-e] (y|and) [a-e]\b/i;

function hasPositionalOption(options: string[]): boolean {
  return options.some((o) => POSITIONAL_OPTION.test(String(o)));
}

/** Permutación aleatoria de 0..n-1. `perm[nueva] = vieja`. */
function randomPermutation(n: number): number[] {
  return shuffle(Array.from({ length: n }, (_, i) => i));
}

/**
 * Devuelve una copia de la pregunta con las opciones (o los elementos a ordenar) en otro orden,
 * y la clave reescrita para ese orden. Así, aunque una pregunta se repita entre intentos, "la
 * respuesta era la B" deja de servir.
 *
 * La copia barajada es la que se guarda en la sesión (server-only) y se corrige contra ella, así
 * que `gradeQuestion` no cambia.
 */
export function shuffleQuestionOptions(q: Question): Question {
  switch (q.type) {
    case "multiple_choice":
    case "code_output": {
      if (hasPositionalOption(q.options)) return q;
      const perm = randomPermutation(q.options.length);
      return {
        ...q,
        options: perm.map((old) => q.options[old]),
        correctIndex: perm.indexOf(q.correctIndex),
      };
    }
    case "multi_select": {
      if (hasPositionalOption(q.options)) return q;
      const perm = randomPermutation(q.options.length);
      return {
        ...q,
        options: perm.map((old) => q.options[old]),
        correctIndexes: q.correctIndexes.map((old) => perm.indexOf(old)).sort((a, b) => a - b),
      };
    }
    case "ordering": {
      // `correctOrder[k]` = índice en `items` del elemento que va en la posición k.
      const perm = randomPermutation(q.items.length);
      return {
        ...q,
        items: perm.map((old) => q.items[old]),
        correctOrder: q.correctOrder.map((old) => perm.indexOf(old)),
      };
    }
    case "true_false":
      return q;
  }
}
