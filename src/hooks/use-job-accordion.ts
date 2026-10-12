import { useState, useCallback, useRef } from "react";
import { CompatibilityService } from "@/services/compatibility.service";
import type { CandidateMatch } from "@/types/job.types";

export interface JobAccordionState {
  matches: CandidateMatch[];
  nextCursor?: string;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  loaded: boolean; // false hasta que se abre por primera vez
}

export function useJobAccordion(recruiterId: string) {
  const [jobStates, setJobStates] = useState<Record<string, JobAccordionState>>({});
  
  // Tracking de requests en vuelo para cancelar obsoletas
  const activeRequests = useRef<Record<string, number>>({});
  
  // Refs para bloqueo sincrón de loadingMore
  const loadingMoreRefs = useRef<Record<string, boolean>>({});

  const loadMatches = useCallback(
    async (jobId: string, cursor?: string) => {
      // Check sincrón: si ya está loadingMore (con cursor), cancelar
      if (cursor && loadingMoreRefs.current[jobId]) {
        return;
      }

      // Marcar como loadingMore en el ref (sincrónico)
      loadingMoreRefs.current[jobId] = true;

      // Incrementar contador de request para este job
      const requestId = (activeRequests.current[jobId] || 0) + 1;
      activeRequests.current[jobId] = requestId;

      setJobStates((prevStates) => {
        return {
          ...prevStates,
          [jobId]: {
            ...(prevStates[jobId] || {
              matches: [],
              hasMore: false,
              loaded: false,
              error: null,
            }),
            loadingMore: true,
            error: null,
          },
        };
      });

      try {
        const result = await CompatibilityService.getMatchesForJob(
          recruiterId,
          jobId,
          { pageSize: 20, cursor }
        );

        // Descartar si hay una request más reciente
        if (activeRequests.current[jobId] !== undefined && 
            activeRequests.current[jobId] > (activeRequests.current[jobId] || 0)) {
          return;
        }

        setJobStates((prev) => {
          const prevState = prev[jobId] || { matches: [], hasMore: false, loaded: false, error: null };
          return {
            ...prev,
            [jobId]: {
              matches: cursor ? [...prevState.matches, ...result.matches] : result.matches,
              nextCursor: result.nextCursor,
              hasMore: result.hasMore,
              loadingMore: false,
              error: null,
              loaded: true,
            },
          };
        });
        
        // Limpiar ref de loadingMore
        loadingMoreRefs.current[jobId] = false;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Error al cargar candidatos";
        setJobStates((prev) => ({
          ...prev,
          [jobId]: {
            ...(prev[jobId] || {
              matches: [],
              hasMore: false,
              loaded: false,
            }),
            loadingMore: false,
            error: errorMessage,
          },
        }));
        
        // Limpiar ref de loadingMore
        loadingMoreRefs.current[jobId] = false;
      }
    },
    [recruiterId]
  );

  const handleOpenJob = useCallback(
    (jobId: string) => {
      // Solo cargar si no se ha cargado antes
      if (!jobStates[jobId]?.loaded) {
        loadMatches(jobId);
      }
    },
    [jobStates, loadMatches]
  );

  const handleLoadMore = useCallback(
    (jobId: string) => {
      const state = jobStates[jobId];
      if (state?.nextCursor && !state.loadingMore) {
        loadMatches(jobId, state.nextCursor);
      }
    },
    [jobStates, loadMatches]
  );

  const handleRetry = useCallback(
    (jobId: string) => {
      loadMatches(jobId);
    },
    [loadMatches]
  );

  return {
    jobStates,
    handleOpenJob,
    handleLoadMore,
    handleRetry,
  };
}
