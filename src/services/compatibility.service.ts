import { queryCollection } from "@/lib/firebase/firestore";
import { where, orderBy, limit, startAfter, query, getDocs, collection, doc, getDoc } from "firebase/firestore";
import { CandidateMatch } from "@/types/job.types";
import { db } from "@/lib/firebase/client";

/**
 * Opciones de paginación para getMatchesForJob.
 */
export interface PaginationOptions {
  /** Tamaño de página (máx 50). */
  pageSize?: number;
  /** Cursor opaco codificado en base64. */
  cursor?: string;
}

/**
 * Resultado paginado de matches.
 */
export interface PaginatedMatches {
  /** Matches en esta página. */
  matches: CandidateMatch[];
  /** Cursor opaco para la siguiente página (undefined si no hay más). */
  nextCursor?: string;
  /** Indica si hay más resultados. */
  hasMore: boolean;
}

/**
 * Estructura interna del cursor.
 */
interface CursorData {
  completedAt: number; // timestamp en ms
  docId: string;
}

export const CompatibilityService = {
  /**
   * @deprecated Use getMatchesForJob con paginación por vacante.
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

  /**
   * Obtiene matches de candidatos para una vacante específica con paginación cursor-based.
   * 
   * Usa índice compuesto: recruiterId ASC, jobId ASC, completedAt DESC.
   * Cursor compuesto: (completedAt, docId) para evitar colisiones en timestamps idénticos.
   * 
   * @param recruiterId - UID del reclutador autenticado
   * @param jobId - ID de la vacante
   * @param options - Opciones de paginación (pageSize max 50, cursor opaco)
   * @returns Resultado paginado con matches, nextCursor y hasMore
   * @throws Error si el cursor es inválido
   */
  getMatchesForJob: async (
    recruiterId: string,
    jobId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedMatches> => {
    const pageSize = Math.min(options.pageSize || 20, 50);
    
    // Decodificar cursor si existe
    let cursorData: CursorData | null = null;
    if (options.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded);
        if (!parsed.completedAt || !parsed.docId) {
          throw new Error("Invalid cursor structure");
        }
        cursorData = parsed as CursorData;
      } catch (err) {
        throw new Error("Invalid cursor format");
      }
    }

    // Construir query base
    const collectionRef = collection(db, "candidate_matches");
    let q = query(
      collectionRef,
      where("recruiterId", "==", recruiterId),
      where("jobId", "==", jobId),
      orderBy("completedAt", "desc"),
      limit(pageSize + 1) // +1 para detectar hasMore
    );

    // Aplicar cursor si existe
    if (cursorData) {
      // Fetch el documento del cursor para obtener el DocumentSnapshot
      const cursorDocRef = doc(collectionRef, cursorData.docId);
      const cursorDocSnap = await getDoc(cursorDocRef);
      
      if (!cursorDocSnap.exists()) {
        throw new Error("Cursor document not found");
      }
      
      q = query(
        collectionRef,
        where("recruiterId", "==", recruiterId),
        where("jobId", "==", jobId),
        orderBy("completedAt", "desc"),
        startAfter(cursorDocSnap),
        limit(pageSize + 1)
      );
    }

    // Ejecutar query
    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    // Determinar si hay más resultados
    const hasMore = docs.length > pageSize;
    const matchDocs = docs.slice(0, pageSize);
    const matches: CandidateMatch[] = matchDocs.map(doc => {
      const data = doc.data() as CandidateMatch;
      return {
        ...data,
        id: doc.id,
      } as CandidateMatch;
    });

    // Generar nextCursor si hay más resultados
    let nextCursor: string | undefined;
    if (hasMore) {
      const lastDoc = docs[pageSize - 1];
      const lastData = lastDoc.data() as CandidateMatch;
      const cursorObj: CursorData = {
        completedAt: lastData.completedAt.toMillis(),
        docId: lastDoc.id,
      };
      nextCursor = Buffer.from(JSON.stringify(cursorObj)).toString("base64");
    }

    return {
      matches,
      nextCursor,
      hasMore,
    };
  },
};
