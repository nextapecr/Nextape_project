import { dedupeQuestions } from "@/lib/server/assessment";
import type { Question } from "@/types/question.types";

/**
 * Añade rondas de generación (deduplicadas) hasta llegar a `goal` o agotar `rounds`; para antes si
 * una ronda no aporta nada nuevo. Ids consecutivos: cada lote generado numera desde 0. PURA salvo
 * por `generate`.
 */
export async function growPool({
  start,
  goal,
  rounds,
  generate,
}: {
  start: Question[];
  goal: number;
  rounds: number;
  generate: (round: number) => Promise<Question[]>;
}): Promise<Question[]> {
  let questions = start;
  for (let round = 0; round < rounds && questions.length < goal; round++) {
    const before = questions.length;
    questions = dedupeQuestions([...questions, ...(await generate(round))]);
    if (questions.length === before) break; // el proveedor no aporta nada nuevo
  }
  return questions.map((q, idx) => ({ ...q, id: String(idx) }));
}

