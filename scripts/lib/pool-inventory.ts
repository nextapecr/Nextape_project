import { TECHNOLOGIES } from "@/lib/technologies";
import { LEVELS } from "@/lib/server/assessment";

/**
 * Lógica PURA del inventario del banco de preguntas (`scripts/inventory-question-pools.ts`):
 * resume cada documento y calcula la cobertura respecto al catálogo. Sin Firestore, testeable.
 */

export interface Pool {
  docId: string;
  subject: string;
  level: string;
  count: number;
  byType: Record<string, number>;
  generator?: string;
}

/** Resume un documento de `line_question_pools` (solo metadatos: nunca enunciados ni claves). */
export function toPool(docId: string, data: Record<string, unknown>): Pool {
  const questions: Array<Record<string, unknown>> = Array.isArray(data.questions) ? data.questions : [];
  const level = String(data.level ?? docId.split("_").pop() ?? "");
  const subject = String(data.key ?? docId.replace(new RegExp(`_${level}$`), ""));
  return {
    docId,
    subject,
    level,
    count: Number(data.count ?? questions.length),
    byType: countBy(questions.map((q) => String(q?.type ?? "desconocido"))),
    generator: data.generator ? String(data.generator) : undefined,
  };
}

function countBy(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export interface Inventory {
  pools: Pool[];
  expected: number;
  totalQuestions: number;
  globalByType: Record<string, number>;
  /** Combinaciones del catálogo sin preguntas (`tech_nivel`). */
  missing: string[];
  /** Tecnologías sin ningún nivel sembrado. */
  emptyTech: string[];
  /** Repertorios en la DB que no están en el catálogo. */
  orphans: Pool[];
  /** Nº de preguntas por `tech_nivel`. */
  countOf: (techId: string, level: string) => number;
}

export function analyzeInventory(pools: Pool[]): Inventory {
  const byKey = new Map(pools.map((p) => [`${p.subject}_${p.level}`, p.count]));
  const countOf = (techId: string, level: string) => byKey.get(`${techId}_${level}`) ?? 0;
  const catalogIds = new Set(TECHNOLOGIES.map((t) => t.id));

  const missing = TECHNOLOGIES.flatMap((t) => LEVELS.filter((l) => countOf(t.id, l) <= 0).map((l) => `${t.id}_${l}`));
  const emptyTech = TECHNOLOGIES.filter((t) => LEVELS.every((l) => countOf(t.id, l) <= 0)).map((t) => t.id);

  const globalByType: Record<string, number> = {};
  for (const p of pools) {
    for (const [type, n] of Object.entries(p.byType)) globalByType[type] = (globalByType[type] ?? 0) + n;
  }

  return {
    pools,
    expected: TECHNOLOGIES.length * LEVELS.length,
    totalQuestions: pools.reduce((n, p) => n + p.count, 0),
    globalByType,
    missing,
    emptyTech,
    orphans: pools.filter((p) => !catalogIds.has(p.subject)),
    countOf,
  };
}
