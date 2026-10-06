'use server';
/**
 * @fileOverview Generador de preguntas para The LINE (proveedor: Groq / Llama).
 *
 * Genera preguntas de UN tipo por llamada: cada tipo tiene una forma JSON distinta y pedirle al
 * modelo varias formas a la vez dispara los fallos de esquema. `buildQuestionPool` orquesta las
 * llamadas por (skill, tipo) para armar el repertorio de una vacante.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { generateJsonWithFallback } from '@/ai/generate';
import { shuffle } from '@/lib/server/assessment';
import { QUESTION_TYPES } from '@/types/question.types';
import type { Question, QuestionType } from '@/types/question.types';

// `senior` es el nivel máximo. Debe coincidir con `LEVELS` en `src/lib/server/assessment.ts`.
const DIFFICULTIES = ['junior', 'mid', 'senior'] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

const GenerateQuestionsInputSchema = z.object({
  stack: z.array(z.string()),
  level: z.string(),
  count: z.number().default(5),
  /** Tipo de pregunta a generar. Por defecto, opción múltiple. */
  type: z.enum(QUESTION_TYPES).default('multiple_choice'),
  /** Fuentes de referencia con las que anclar los escenarios. */
  sources: z.array(z.string()).optional(),
});

const BaseFields = {
  id: z.string(),
  briefing: z.string(),
  text: z.string(),
  // `string` y no un enum: el tipo canónico `QuestionBase.difficulty` es `string`, y el valor ya
  // viene acotado en runtime por `normalizeDifficulty`.
  difficulty: z.string(),
  tag: z.string(),
  source: z.string().optional(),
};

/** Esquema ESTRICTO de salida: la unión discriminada que consume el resto del sistema. */
const StrictQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    ...BaseFields,
    type: z.literal('multiple_choice'),
    options: z.array(z.string()).min(2),
    correctIndex: z.number().int().min(0),
  }),
  z.object({
    ...BaseFields,
    type: z.literal('code_output'),
    code: z.string(),
    language: z.string(),
    options: z.array(z.string()).min(2),
    correctIndex: z.number().int().min(0),
  }),
  z.object({
    ...BaseFields,
    type: z.literal('multi_select'),
    options: z.array(z.string()).min(3),
    correctIndexes: z.array(z.number().int().min(0)).min(1),
  }),
  z.object({ ...BaseFields, type: z.literal('true_false'), correct: z.boolean() }),
  z.object({
    ...BaseFields,
    type: z.literal('ordering'),
    items: z.array(z.string()).min(3),
    correctOrder: z.array(z.number().int().min(0)).min(3),
  }),
]);

const GenerateQuestionsOutputSchema = z.object({
  questions: z.array(StrictQuestionSchema),
});

export type GenerateQuestionsInput = z.infer<typeof GenerateQuestionsInputSchema>;
export type GenerateQuestionsOutput = z.infer<typeof GenerateQuestionsOutputSchema>;

export async function generateQuestions(
  input: GenerateQuestionsInput
): Promise<GenerateQuestionsOutput> {
  return generateQuestionsFlow(input);
}

/* ─────────────────── Esquemas TOLERANTES (lo que devuelve el modelo) ─────────────────── */

const LenientBase = {
  briefing: z.string(),
  text: z.string(),
  difficulty: z.string().optional(),
  tag: z.string().optional(),
  source: z.string().optional(),
};

const LENIENT_BY_TYPE = {
  multiple_choice: z.object({
    ...LenientBase,
    options: z.array(z.string()).min(2),
    correctIndex: z.coerce.number().int().min(0),
  }),
  code_output: z.object({
    ...LenientBase,
    code: z.string(),
    language: z.string().optional(),
    options: z.array(z.string()).min(2),
    correctIndex: z.coerce.number().int().min(0),
  }),
  multi_select: z.object({
    ...LenientBase,
    options: z.array(z.string()).min(3),
    correctIndexes: z.array(z.coerce.number().int().min(0)).min(1),
  }),
  true_false: z.object({
    ...LenientBase,
    correct: z.coerce.boolean(),
  }),
  ordering: z.object({
    ...LenientBase,
    // El modelo devuelve los pasos YA EN ORDEN CORRECTO; se desordenan en servidor.
    items: z.array(z.string()).min(3),
  }),
} as const;

function normalizeDifficulty(value: string | undefined, fallback: string): Difficulty {
  const v = (value ?? fallback).toLowerCase();
  return (DIFFICULTIES as readonly string[]).includes(v) ? (v as Difficulty) : 'senior';
}

/**
 * Normaliza el `tag` que devuelve la IA al vocabulario exacto del `stack`, para que el score
 * se persista bajo una clave que el matching (`calculateMatch` vs `requiredSkills`) pueda casar.
 * Sin esto, un tag como "react hooks" no coincidiría con "react" y el usuario no recibiría crédito.
 */
function normalizeTag(tag: string | undefined, stack: string[]): string {
  const t = (tag ?? '').toLowerCase().trim();
  const lowerStack = stack.map((s) => s.toLowerCase());
  if (lowerStack.includes(t)) return t;
  const match = lowerStack.find((s) => t.includes(s) || s.includes(t));
  return match ?? lowerStack[0] ?? t;
}

/* ──────────────────────────────── Prompts por tipo ──────────────────────────────── */

/** Forma JSON y reglas específicas de cada tipo. */
function typeSpec(type: QuestionType, level: string): { shape: string; rules: string } {
  switch (type) {
    case 'multiple_choice':
      return {
        shape: `"options": ["solución 1", "solución 2", "solución 3", "solución 4"],
      "correctIndex": 0`,
        rules: `- "options": EXACTAMENTE 4 soluciones de ingeniería. Todas deben sonar profesionales; solo UNA es la óptima.
- "correctIndex": índice (0 a 3) de la opción correcta dentro de "options".`,
      };

    case 'code_output':
      return {
        shape: `"code": "fragmento de código de 5 a 15 líneas",
      "language": "typescript",
      "options": ["resultado 1", "resultado 2", "resultado 3", "resultado 4"],
      "correctIndex": 0`,
        rules: `- "code": un fragmento REAL de 5 a 15 líneas con un comportamiento sutil (concurrencia, mutación,
  coerción de tipos, cierre de recursos, orden de evaluación). Usa \\n para los saltos de línea.
- "text": pregunta qué imprime, qué devuelve o cómo se comporta ese código.
- "options": EXACTAMENTE 4 resultados posibles; solo UNO es correcto.
- "correctIndex": índice (0 a 3) del resultado correcto.`,
      };

    case 'multi_select':
      return {
        shape: `"options": ["afirmación 1", "afirmación 2", "afirmación 3", "afirmación 4", "afirmación 5"],
      "correctIndexes": [0, 2]`,
        rules: `- "options": EXACTAMENTE 5 afirmaciones técnicas plausibles.
- "correctIndexes": array con los índices de las que son CORRECTAS. Debe haber entre 2 y 3.
- Las incorrectas deben ser errores creíbles, no absurdos.`,
      };

    case 'true_false':
      return {
        shape: `"correct": true`,
        rules: `- "text": una afirmación técnica precisa y verificable sobre la tecnología (no una pregunta).
- "correct": true si la afirmación es cierta, false si es falsa.
- Alterna entre afirmaciones verdaderas y falsas. Las falsas deben ser errores que un
  desarrollador con experiencia realmente cometería, no disparates.`,
      };

    case 'ordering':
      return {
        shape: `"items": ["primer paso", "segundo paso", "tercer paso", "cuarto paso"]`,
        rules: `- "text": pide ordenar correctamente un procedimiento real (desplegar sin downtime, mitigar un
  incidente en producción, depurar una fuga de memoria, hacer una migración de datos).
- "items": EXACTAMENTE 4 pasos, escritos YA EN EL ORDEN CORRECTO. El sistema los desordenará.
- El orden debe importar de verdad: invertir dos pasos tiene que ser un error real.`,
      };
  }
}

/* ──────────────────────────────────── Flow ──────────────────────────────────────── */

const generateQuestionsFlow = ai.defineFlow(
  {
    name: 'generateQuestionsFlow',
    inputSchema: GenerateQuestionsInputSchema,
    outputSchema: GenerateQuestionsOutputSchema,
  },
  async (input) => {
    const count = input.count ?? 5;
    const type = input.type ?? 'multiple_choice';
    const stack = input.stack.join(', ');
    const sources = input.sources ?? [];
    const spec = typeSpec(type, input.level);

    // Bloque de anclaje: dirige al modelo hacia el comportamiento realmente documentado de estas
    // tecnologías en vez de escenarios genéricos, y le pide declarar la fuente asociada.
    const sourcesBlock = sources.length
      ? `
FUENTES DE REFERENCIA (documentación oficial y material de ingeniería reconocido):
${sources.map((s) => `- ${s}`).join('\n')}

Los escenarios deben reflejar el comportamiento y las buenas prácticas REALES que documentan estas
fuentes (APIs, límites, modos de fallo conocidos), no situaciones inventadas o genéricas.
Añade a cada pregunta un campo "source" con la URL de la lista que mejor respalde ese escenario.
`
      : '';

    const prompt = `Eres un Arquitecto de Software Senior en NEXTAPE que evalúa a candidatos de élite.

Responde ÚNICAMENTE con un objeto JSON válido. Sin markdown, sin texto adicional, solo JSON.

Genera EXACTAMENTE ${count} desafíos técnicos de nivel ${input.level} centrados en: ${stack}.
${sourcesBlock}
Estructura EXACTA del JSON:
{
  "questions": [
    {
      "briefing": "contexto corto de un sistema en producción",
      "text": "enunciado del problema técnico específico",
      ${spec.shape},
      "difficulty": "${input.level}",
      "tag": "una de las habilidades del stack, en minúsculas"${
        sources.length ? ',\n      "source": "una URL EXACTA de la lista de fuentes"' : ''
      }
    }
  ]
}

REGLAS:
${spec.rules}
- "difficulty": uno de junior, mid o senior (el más cercano al nivel "${input.level}").
- "tag": DEBE ser EXACTAMENTE una de estas habilidades (en minúsculas): ${stack}. No inventes otras.${
      sources.length
        ? '\n- "source": DEBE ser una de las URLs listadas arriba, copiada tal cual. No inventes URLs.'
        : ''
    }
- NO preguntes sintaxis trivial. Plantea problemas reales: fugas de memoria, cuellos de botella,
  condiciones de carrera, seguridad, deuda técnica.
- Genera EXACTAMENTE ${count} preguntas en el array "questions".

Responde solo con el JSON.`;

    const LenientOutput = z.object({ questions: z.array(LENIENT_BY_TYPE[type]) });
    console.log(`   ⏳ Generando tipo '${type}' (${count} preguntas)...`);
    const { data: parsed, model } = await generateJsonWithFallback(prompt, LenientOutput);
    console.log(
      `   ✅ Completado tipo '${type}': ${parsed.questions.length} preguntas (modelo: Groq ${model.toUpperCase()})`
    );

    // Solo se conserva `source` si es una URL que estaba en la lista: el modelo a veces inventa
    // enlaces plausibles, y una fuente inventada es peor que ninguna.
    const allowedSources = new Set(sources);

    const questions = parsed.questions.map((raw, i) => {
      const base = {
        id: String(i),
        briefing: raw.briefing,
        text: raw.text,
        difficulty: normalizeDifficulty(raw.difficulty, input.level),
        tag: normalizeTag(raw.tag, input.stack),
        ...(raw.source && allowedSources.has(raw.source.trim())
          ? { source: raw.source.trim() }
          : {}),
      };

      switch (type) {
        case 'multiple_choice': {
          const q = raw as z.infer<(typeof LENIENT_BY_TYPE)['multiple_choice']>;
          return {
            ...base,
            type: 'multiple_choice' as const,
            options: q.options,
            correctIndex: Math.min(q.correctIndex, q.options.length - 1),
          };
        }
        case 'code_output': {
          const q = raw as z.infer<(typeof LENIENT_BY_TYPE)['code_output']>;
          return {
            ...base,
            type: 'code_output' as const,
            code: q.code,
            language: q.language ?? 'typescript',
            options: q.options,
            correctIndex: Math.min(q.correctIndex, q.options.length - 1),
          };
        }
        case 'multi_select': {
          const q = raw as z.infer<(typeof LENIENT_BY_TYPE)['multi_select']>;
          const valid = [...new Set(q.correctIndexes)].filter((idx) => idx < q.options.length);
          return {
            ...base,
            type: 'multi_select' as const,
            options: q.options,
            correctIndexes: valid.length > 0 ? valid : [0],
          };
        }
        case 'true_false': {
          const q = raw as z.infer<(typeof LENIENT_BY_TYPE)['true_false']>;
          return { ...base, type: 'true_false' as const, correct: q.correct };
        }
        case 'ordering': {
          const q = raw as z.infer<(typeof LENIENT_BY_TYPE)['ordering']>;
          // El modelo entrega los pasos en orden correcto. Se desordenan aquí para que el
          // candidato no reciba la solución servida, y se guarda la permutación como clave.
          // Se permuta por índice (no por texto) para tolerar pasos repetidos.
          const n = q.items.length;
          const perm = shuffle([...Array(n).keys()]); // perm[posiciónNueva] = índiceOriginal
          return {
            ...base,
            type: 'ordering' as const,
            items: perm.map((original) => q.items[original]),
            correctOrder: [...Array(n).keys()].map((k) => perm.indexOf(k)),
          };
        }
      }
    });

    return { questions: questions as Question[] };
  }
);
