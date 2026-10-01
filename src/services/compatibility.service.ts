import { queryCollection } from "@/lib/firebase/firestore";
import { where, orderBy, limit } from "firebase/firestore";
import { CandidateMatch } from "@/types/job.types";

export const CompatibilityService = {
  /**
   * Candidatos que completaron la prueba (The LINE) de las vacantes de un reclutador.
   * La regla de `candidate_matches` permite esta lectura (`recruiterId == uid`).
   * 
   * Ordenado por `completedAt DESC` (más recientes primero) con límite configurable.
   * Usa el índice compuesto `recruiterId + completedAt` definido en firestore.indexes.json.
   * 
   * @param recruiterId - UID del reclutador
   * @param maxResults - Número máximo de candidatos a retornar (default: 20)
   */
  getMatchesForRecruiter: (recruiterId: string, maxResults = 20) =>
    queryCollection<CandidateMatch>(
      "candidate_matches",
      where("recruiterId", "==", recruiterId),
      orderBy("completedAt", "desc"),
      limit(maxResults)
    ),
};
