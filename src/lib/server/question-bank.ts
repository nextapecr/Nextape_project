import type { BankQuestion, MultipleChoiceQuestion } from "@/types/question.types";
import { adminDb } from "@/lib/firebase/admin";
import { shuffle } from "./assessment";
import seedBank from "./question-bank.data.json";

/**
 * Techo de espera para la consulta al banco persistido. Pasado ese tiempo se usa el banco local:
 * es preferible un examen del respaldo curado a dejar al candidato mirando un spinner.
 */
const FIRESTORE_TIMEOUT_MS = 1500;

/**
 * Banco Inicial de Preguntas Pre-Aprobadas (Seed / Fallback Offline).
 * Los datos viven en `question-bank.data.json`: son contenido, no código (y como TS eran cientos de
 * objetos con la misma forma, que Sonar contaba como código duplicado).
 * Todos los escenarios miden criterio profesional real (arquitectura, rendimiento, seguridad, refactorización, depuración)
 * sin preguntas de memorización sintáctica.
 */
export const INITIAL_QUESTION_BANK: BankQuestion[] = seedBank as BankQuestion[];

/**
 * Convierte una pregunta del banco al tipo canónico `Question`, desordenando las opciones.
 *
 * Se barajan porque en el banco la respuesta correcta está casi siempre en la posición 0: sin esto,
 * un candidato que lo notara acertaría el examen entero marcando siempre la primera opción.
 *
 * Se permuta por ÍNDICE y no buscando el texto correcto con `indexOf`, para que dos opciones con
 * el mismo texto no hagan que `correctIndex` apunte a la equivocada.
 */
export function toQuestion(question: BankQuestion): MultipleChoiceQuestion {
  const n = question.options.length;
  const perm = shuffle([...Array(n).keys()]); // perm[posiciónNueva] = índiceOriginal

  return {
    id: question.id,
    type: "multiple_choice",
    briefing: question.briefing,
    text: question.text,
    options: perm.map((original) => question.options[original]),
    correctIndex: perm.indexOf(question.correctIndex),
    difficulty: question.level,
    tag: question.tag.toLowerCase(),
  };
}

/**
 * Obtiene un conjunto de preguntas del banco (Firestore o Fallback determinista).
 * 0% consumo de IA en runtime. Respuesta instantánea <40ms.
 */
/**
 * Preguntas del banco persistido en Firestore, con techo de tiempo. El `try/catch` por sí solo no
 * basta: sin credenciales o con la red degradada, el Admin SDK se queda esperando en vez de fallar,
 * y esta función —que debe responder en milisegundos— bloquea el arranque del examen. Con el
 * timeout, el respaldo local entra enseguida. `[]` si Firestore no responde.
 */
async function fetchStoredQuestions(skills: string[]): Promise<BankQuestion[]> {
  try {
    const query = adminDb().collection("questions").where("skill", "in", skills.slice(0, 10)).get();
    const snap = await Promise.race([
      query,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("firestore_timeout")), FIRESTORE_TIMEOUT_MS)
      ),
    ]);
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BankQuestion);
  } catch (err) {
    console.warn(
      "[sampleBankQuestions] Firestore no disponible, se usa el banco local:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Completa con el banco semilla: primero lo que casa con el stack pedido y, si aún faltan, el resto
 * (hasta `count * 2`) para no devolver un examen corto. `existingIds` se actualiza en cada inserción:
 * con una foto tomada al principio, la segunda pasada repetía lo de la primera y el candidato recibía
 * la misma pregunta dos veces en el mismo examen.
 */
function fillFromSeedBank(candidates: BankQuestion[], skills: string[], count: number) {
  const existingIds = new Set(candidates.map((q) => q.id));
  const add = (item: BankQuestion) => {
    if (existingIds.has(item.id)) return;
    existingIds.add(item.id);
    candidates.push(item);
  };
  const matchesStack = (item: BankQuestion) => {
    const skill = item.skill.toLowerCase();
    return skills.some((s) => skill.includes(s) || s.includes(skill));
  };

  INITIAL_QUESTION_BANK.filter(matchesStack).forEach(add);
  if (candidates.length >= count) return;
  for (const item of INITIAL_QUESTION_BANK) {
    if (candidates.length >= count * 2) break;
    add(item);
  }
}

export async function sampleBankQuestions(
  requestedSkills: string[],
  _level: string = "senior",
  count: number = 5
): Promise<MultipleChoiceQuestion[]> {
  const normalizedSkills = requestedSkills.map((s) => s.toLowerCase().trim());

  // 1) Banco persistido en Firestore.
  const bankCandidates = await fetchStoredQuestions(normalizedSkills);

  // 2) Si Firestore no tiene suficientes preguntas aún (modo inicial/fallback), banco semilla.
  if (bankCandidates.length < count) fillFromSeedBank(bankCandidates, normalizedSkills, count);

  // 3) Barajar candidatos y seleccionar `count`. Fisher-Yates: `sort(() => Math.random() - 0.5)`
  //    da un reparto sesgado y con comparador inconsistente.
  const selected = shuffle(bankCandidates).slice(0, count);

  // 4) Desordenar las opciones para cada sesión individual.
  return selected.map(toQuestion);
}
