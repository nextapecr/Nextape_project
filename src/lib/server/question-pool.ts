import { generateQuestions } from "@/ai/flows/generate-assessment-flow";
import { dedupeQuestions } from "./assessment";
import { resolveSourcesForSkill } from "./sources";
import { topicsFor, topicsForCall } from "./technology-topics";
import type { Question, QuestionType } from "@/types/question.types";

/**
 * Construcción del **repertorio** de preguntas de una vacante (o de una especialidad).
 *
 * Idea: la IA se invoca UNA vez, al publicar la vacante, para producir un banco amplio y variado
 * que se guarda en Firestore. Cuando un candidato hace The LINE, se sortean X del banco — sin
 * llamar al modelo. Dos consecuencias buscadas:
 *   1. **Coste:** una vacante con 20 candidatos pasa de 20 generaciones a 1.
 *   2. **Superficie de abuso:** `POST /api/line/start` deja de ser un disparador de IA, así que
 *      no se puede usar para quemar la cuota de Groq a base de peticiones.
 *
 * SOLO servidor: el repertorio contiene las claves de respuesta.
 */

/** Preguntas que responde cada candidato (sorteadas del repertorio). */
export const QUESTIONS_PER_EXAM = 5;

/**
 * Tope de skills que se procesan. Cada skill son varias llamadas al modelo; sin tope, una vacante
 * con 40 skills en el formulario dispararía una avalancha de generaciones.
 */
export const MAX_SKILLS_PER_POOL = 5;

/** Cuántas preguntas se piden por llamada, según el tipo. */
export const QUESTIONS_PER_TYPE: Record<QuestionType, number> = {
  multiple_choice: 4,
  true_false: 3,
  multi_select: 2,
  ordering: 2,
  code_output: 2,
};

/**
 * Tipos "secundarios" que se reparten entre las skills.
 *
 * Por qué rotar y no generar los 5 tipos para cada skill: eso serían 5 llamadas por skill (25 en
 * una vacante de 5 skills). Rotando, cada skill recibe opción múltiple —el tipo más fiable, que
 * hace de columna vertebral— más dos tipos distintos, y el repertorio global acaba conteniendo
 * todos los tipos con un tercio de las llamadas.
 */
const SECONDARY_TYPES: QuestionType[] = [
  "true_false",
  "ordering",
  "multi_select",
  "code_output",
];

/** Tipos a generar para la skill que ocupa la posición `index` en el stack. */
export function typesForSkill(index: number): QuestionType[] {
  const a = SECONDARY_TYPES[(index * 2) % SECONDARY_TYPES.length];
  const b = SECONDARY_TYPES[(index * 2 + 1) % SECONDARY_TYPES.length];
  return ["multiple_choice", a, b];
}

/**
 * Cuántas preguntas se piden por tipo al construir el **banco de práctica** de una tecnología.
 *
 * Es más grande que el repertorio de una vacante: aquí el usuario practica repetidamente sobre la
 * misma tecnología, así que necesita variedad suficiente para no repetir preguntas enseguida.
 */
export const BANK_QUESTIONS_PER_TYPE: Record<QuestionType, number> = {
  multiple_choice: 8,
  true_false: 5,
  multi_select: 4,
  ordering: 4,
  code_output: 4,
};

/** Los cinco tipos, para el banco de práctica (una tecnología recibe todos). */
export const ALL_QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "multi_select",
  "ordering",
  "code_output",
];

export interface BuildTechnologyPoolInput {
  /** Id de la tecnología (clave del catálogo `src/lib/technologies.ts`). */
  technology: string;
  level: string;
  /** Tipos a generar. Por defecto los cinco. */
  types?: QuestionType[];
  /** Preguntas por tipo. Por defecto `BANK_QUESTIONS_PER_TYPE`. */
  perType?: Partial<Record<QuestionType, number>>;
  /**
   * Ronda de generación (`--top-up` llama varias veces). Desplaza los subtemas para que cada ronda
   * pida otros en vez de repetir los de la primera.
   */
  round?: number;
}

/**
 * Construye el banco de práctica de UNA tecnología y UN nivel, con **todos** los tipos.
 *
 * Se diferencia de `buildQuestionPool` (que rota tipos entre las skills de una vacante) porque
 * aquí solo hay una tecnología: rotar no aportaría variedad, se generan los cinco tipos.
 *
 * Pensado para el script de precarga, no para el camino de petición: genera bastante contenido y
 * tarda. Ver `scripts/seed-question-bank.ts`.
 */
export async function buildTechnologyPool({
  technology,
  level,
  types = ALL_QUESTION_TYPES,
  perType,
  round = 0,
}: BuildTechnologyPoolInput): Promise<Question[]> {
  const skill = technology.trim().toLowerCase();
  if (!skill) return [];

  const sources = resolveSourcesForSkill(skill);
  const allTopics = topicsFor(skill);
  const collected: Question[] = [];

  // En serie: el script puede recorrer cientos de combinaciones y disparar los cinco tipos a la
  // vez multiplicaría la presión sobre el límite de peticiones de Groq.
  for (const [typeIndex, type] of types.entries()) {
    const count = perType?.[type] ?? BANK_QUESTIONS_PER_TYPE[type];
    try {
      const result = await generateQuestions({
        stack: [skill],
        level,
        type,
        count,
        sources,
        // Cada tipo arranca en otro punto de la lista: entre los 5 tipos se cubren todos los subtemas.
        topics: topicsForCall(allTopics, typeIndex + round * types.length, count),
      });
      collected.push(...(result.questions as Question[]));
    } catch (err) {
      console.error(`[question-pool] fallo generando '${type}' de '${skill}' (${level}):`, err);
    }
  }

  return dedupeQuestions(collected).map((q, i) => ({ ...q, id: String(i) }));
}

export interface BuildPoolInput {
  /** Skills a cubrir (se normalizan a minúsculas). */
  stack: string[];
  /** Nivel objetivo: junior | mid | senior. */
  level: string;
}

/**
 * Genera el repertorio: por cada skill, una llamada al modelo **por tipo de pregunta**.
 *
 * Un tipo por llamada porque cada uno tiene una forma JSON distinta y pedirle varias a la vez
 * dispara los fallos de esquema. Las skills se procesan en serie y los tipos de cada skill en
 * paralelo: acota la concurrencia (evita los 429 de Groq) sin alargar demasiado la publicación.
 *
 * Es tolerante a fallos: si una combinación falla, se registra y el repertorio sigue con el resto.
 * Devuelve `[]` solo si fallan todas — el llamador decide qué hacer.
 */
export async function buildQuestionPool({ stack, level }: BuildPoolInput): Promise<Question[]> {
  const skills = [...new Set(stack.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    MAX_SKILLS_PER_POOL
  );

  if (skills.length === 0) return [];

  const collected: Question[] = [];

  for (const [index, skill] of skills.entries()) {
    const sources = resolveSourcesForSkill(skill);

    const batches = await Promise.all(
      typesForSkill(index).map(async (type, typeIndex) => {
        try {
          const result = await generateQuestions({
            stack: [skill],
            level,
            type,
            count: QUESTIONS_PER_TYPE[type],
            topics: topicsForCall(topicsFor(skill), typeIndex, QUESTIONS_PER_TYPE[type]),
            // Cada skill se ancla en sus fuentes de referencia (docs oficiales + material
            // transversal), para que los escenarios salgan de tecnología real y no genérica.
            sources,
          });
          return result.questions as Question[];
        } catch (err) {
          console.error(`[question-pool] fallo generando '${type}' de '${skill}':`, err);
          return [] as Question[];
        }
      })
    );

    collected.push(...batches.flat());
  }

  // Cada lote numera sus `id` desde "0", así que sin reasignar habría ids repetidos en el
  // repertorio (y `assessment_attempts.answers` se pisaría a sí mismo al guardar el intento).
  return dedupeQuestions(collected).map((q, i) => ({ ...q, id: String(i) }));
}
