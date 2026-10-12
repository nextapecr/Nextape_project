import { queryCollection, getDocById, updateDocById } from "@/lib/firebase/firestore";
import { JobOpportunity } from "@/types/job.types";
import { orderBy, limit, where, Timestamp } from "firebase/firestore";
import { calculateMatch } from "@/lib/match";

/** Milisegundos de un `postedAt` que podría no ser un Timestamp (docs antiguos o incompletos). */
function postedAtMillis(job: JobOpportunity): number {
  return job.postedAt instanceof Timestamp ? job.postedAt.toMillis() : 0;
}

export const JobService = {
  /**
   * Vacantes más recientes abiertas a candidaturas.
   *
   * Las archivadas se filtran en cliente (no en la query) porque `active` no existe en las
   * vacantes creadas antes de ese campo, y un `where("active","==",true)` las dejaría fuera.
   */
  getLatestJobs: async () => {
    const jobs = await queryCollection<JobOpportunity>(
      "jobs",
      orderBy("postedAt", "desc"),
      limit(20)
    );
    // Se descartan además las vacantes inservibles: sin `createdBy` no hay empresa a la que
    // entregar la candidatura, y sin `requiredSkills` el match siempre da 0 % y la prueba no
    // evalúa el puesto. Aparecían como ofertas reales con 0 % y sin datos — indistinguible de
    // un fallo. Son restos de seed antiguo con otro esquema.
    return jobs.filter(
      (job) =>
        job.active !== false &&
        Boolean(job.createdBy) &&
        Array.isArray(job.requiredSkills) &&
        job.requiredSkills.length > 0
    );
  },

  /**
   * Obtiene una vacante por ID.
   */
  getJob: (jobId: string) => getDocById<JobOpportunity>("jobs", jobId),

  /**
   * Vacantes creadas por un reclutador (para sus paneles de gestión y candidatos).
   *
   * Con el índice compuesto `(createdBy ASC, postedAt DESC)` habilitado, delegamos el ordenamiento
   * a Firestore. Limitamos a 100 vacantes (escenario extremadamente improbable para un reclutador
   * individual) y mantenemos el sort en memoria como red de seguridad ante docs corruptos.
   */
  getJobsByRecruiter: async (uid: string) => {
    const jobs = await queryCollection<JobOpportunity>(
      "jobs",
      where("createdBy", "==", uid),
      orderBy("postedAt", "desc"),
      limit(100)
    );

    // Warn si alcanzamos el límite (posible truncamiento)
    if (jobs.length === 100) {
      console.warn(
        `[getJobsByRecruiter] Recruiter ${uid.slice(0, 8)}... has >=100 jobs; oldest may be hidden. Consider pagination.`
      );
    }

    // Red de seguridad: re-ordenar en memoria por si Firestore devuelve docs corruptos
    return jobs.sort((a, b) => postedAtMillis(b) - postedAtMillis(a));
  },

  /**
   * Actualiza una vacante. Las reglas solo dejan escribir al reclutador dueño (`createdBy`) y no
   * permiten reasignar la propiedad; el repertorio de preguntas NO se toca desde aquí (vive en
   * `job_answer_keys`, server-only, y se regenera con `POST /api/jobs/assessment`).
   */
  updateJob: (jobId: string, data: Partial<JobOpportunity>) =>
    updateDocById<JobOpportunity>("jobs", jobId, data),

  /**
   * Calcula el match score basado en el DNA técnico del usuario (ver `src/lib/match.ts`).
   * Nota: la generación de la prueba técnica de una vacante ocurre en servidor
   * (POST /api/jobs/assessment), no aquí, para no exponer la clave de respuestas.
   */
  calculateMatch,
};
