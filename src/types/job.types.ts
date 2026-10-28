import { FirestoreTimestamp } from "./firebase.types";
import type { CandidateSummary } from "@/lib/candidate-profile";

// Los tipos de pregunta viven en `question.types.ts` (The LINE los usa también fuera del contexto
// de una vacante). Se reexportan aquí para no romper los imports existentes.
export type {
  Question,
  PublicQuestion,
  QuestionType,
  Answer,
} from "./question.types";

export interface JobOpportunity {
  id?: string;
  title: string;
  company: string;
  description: string;
  salary: string;
  location: string;
  type: string;
  level: string;
  requiredSkills: string[];
  /**
   * Si la vacante ya tiene su repertorio de preguntas generado (`job_answer_keys/{jobId}`).
   * El doc público **no** guarda las preguntas: `jobs` es de lectura pública, así que publicarlas
   * dejaría que un candidato se estudiara el banco entero antes de la prueba.
   */
  assessmentReady?: boolean;
  /** Tamaño del repertorio. Cada candidato responde un sorteo de este banco. */
  assessmentPoolSize?: number;
  /**
   * Skills de la vacante sin preguntas en el banco en ningún nivel: no se evalúan hasta que se
   * precarguen. Se muestran al reclutador para que sepa qué cubre de verdad su prueba.
   */
  assessmentMissingSkills?: string[];
  /**
   * Preguntas que responde cada candidato, fijadas por el reclutador (10–30). Si falta, el tamaño es
   * automático: 10 si el candidato tiene su GitHub analizado, 20 si no.
   */
  examQuestionCount?: number | null;
  /**
   * Minutos que tiene cada candidato para responder la prueba, fijados por el reclutador (5–480).
   * Si falta, 30 (lo mismo que una práctica de The LINE). Lo aplica el servidor.
   */
  examTimeLimitMinutes?: number | null;
  /**
   * Vacante abierta a candidaturas. `false` = archivada: deja de listarse para developers y no
   * admite nuevas pruebas, pero se conserva junto con sus candidatos.
   * Si falta, se considera activa (vacantes creadas antes de este campo).
   */
  active?: boolean;
  createdBy: string;
  postedAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  applicantsCount?: number;
}

/**
 * Registro de un candidato que completó la prueba (The LINE) de una vacante concreta.
 * Vive en `candidate_matches` (escritura SOLO servidor, Admin SDK). La regla de Firestore
 * permite leerlo al propio candidato (`userId`) o al reclutador dueño de la vacante (`recruiterId`).
 * doc id = `${userId}_${jobId}` (un registro por candidato y vacante; se conserva el mejor `score`).
 */
export interface CandidateMatch {
  /** uid del candidato. */
  userId: string;
  /** uid del reclutador dueño de la vacante (denormalizado para la regla de lectura). */
  recruiterId: string;
  jobId: string;
  /** Título de la vacante, denormalizado para el listado de candidatos. */
  jobTitle: string;
  /** Nombre del candidato, denormalizado para el listado. */
  candidateName: string;
  /**
   * Resumen del perfil profesional que declaró el candidato (experiencia, estudios, idiomas…), copiado
   * al postular. `null` si no completó el cuestionario. Ver `src/lib/candidate-profile.ts`.
   */
  candidate?: CandidateSummary | null;
  /** Resultado de The LINE para esta vacante (0–100). Se conserva el mejor. */
  score: number;
  /** Afinidad DNA ↔ `requiredSkills` de la vacante (0–100). */
  matchPercent: number;
  /** Snapshot de los scores del candidato en las skills que pide la vacante. */
  skills: Record<string, number>;
  completedAt: FirestoreTimestamp;
}
