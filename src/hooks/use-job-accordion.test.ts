import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useJobAccordion } from "./use-job-accordion";
import { CompatibilityService } from "@/services/compatibility.service";
import type { CandidateMatch } from "@/types/job.types";
import { Timestamp } from "firebase/firestore";

vi.mock("@/services/compatibility.service");

describe("useJobAccordion", () => {
  const mockRecruiterId = "recruiter123";
  const mockJobId = "job1";

  const mockMatch: CandidateMatch = {
    userId: "user1",
    recruiterId: mockRecruiterId,
    jobId: mockJobId,
    jobTitle: "React Dev",
    candidateName: "Alice",
    score: 85,
    matchPercent: 90,
    skills: { react: 85 },
    completedAt: Timestamp.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("estado inicial: loaded false, matches vacío, hasMore false", () => {
    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    expect(result.current.jobStates).toEqual({});
  });

  it("primera carga exitosa: llama a getMatchesForJob con pageSize 20 y actualiza estado", async () => {
    const mockGetMatches = vi
      .spyOn(CompatibilityService, "getMatchesForJob")
      .mockResolvedValue({
        matches: [mockMatch],
        nextCursor: "cursor123",
        hasMore: true,
      });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    expect(mockGetMatches).toHaveBeenCalledWith(mockRecruiterId, mockJobId, {
      pageSize: 20,
      cursor: undefined,
    });
    expect(mockGetMatches).toHaveBeenCalledTimes(1);

    const state = result.current.jobStates[mockJobId];
    expect(state).toBeDefined();
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0].userId).toBe("user1");
    expect(state.nextCursor).toBe("cursor123");
    expect(state.hasMore).toBe(true);
    expect(state.loadingMore).toBe(false);
    expect(state.error).toBeNull();
    expect(state.loaded).toBe(true);
  });

  it("primera carga vacía: matches vacío, hasMore false, loaded true", async () => {
    vi.spyOn(CompatibilityService, "getMatchesForJob").mockResolvedValue({
      matches: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    const state = result.current.jobStates[mockJobId];
    expect(state.matches).toHaveLength(0);
    expect(state.hasMore).toBe(false);
    expect(state.loaded).toBe(true);
  });

  it("load more exitoso: usa el cursor correcto y concatena matches", async () => {
    const mockMatch2: CandidateMatch = {
      ...mockMatch,
      userId: "user2",
      candidateName: "Bob",
    };

    const mockGetMatches = vi
      .spyOn(CompatibilityService, "getMatchesForJob")
      .mockResolvedValueOnce({
        matches: [mockMatch],
        nextCursor: "cursor123",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        matches: [mockMatch2],
        nextCursor: undefined,
        hasMore: false,
      });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    // Primera carga
    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    expect(result.current.jobStates[mockJobId].matches).toHaveLength(1);

    // Load more
    act(() => {
      result.current.handleLoadMore(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId].matches).toHaveLength(2);
    });

    expect(mockGetMatches).toHaveBeenCalledTimes(2);
    expect(mockGetMatches).toHaveBeenNthCalledWith(2, mockRecruiterId, mockJobId, {
      pageSize: 20,
      cursor: "cursor123",
    });

    const state = result.current.jobStates[mockJobId];
    expect(state.matches).toHaveLength(2);
    expect(state.matches[0].userId).toBe("user1");
    expect(state.matches[1].userId).toBe("user2");
    expect(state.hasMore).toBe(false);
  });

  it("load more hasta el final: cuando hasMore false, no hay cursor", async () => {
    vi.spyOn(CompatibilityService, "getMatchesForJob").mockResolvedValue({
      matches: [mockMatch],
      nextCursor: undefined,
      hasMore: false,
    });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    const state = result.current.jobStates[mockJobId];
    expect(state.hasMore).toBe(false);
    expect(state.nextCursor).toBeUndefined();
  });

  it("error de red: captura el error y permite reintento", async () => {
    const mockError = new Error("Network error");
    const mockGetMatches = vi
      .spyOn(CompatibilityService, "getMatchesForJob")
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce({
        matches: [mockMatch],
        nextCursor: undefined,
        hasMore: false,
      });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    // Primera carga (error)
    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.error).toBe("Network error");
    });

    expect(result.current.jobStates[mockJobId].loadingMore).toBe(false);
    expect(result.current.jobStates[mockJobId].matches).toHaveLength(0);

    // Reintento
    act(() => {
      result.current.handleRetry(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    expect(mockGetMatches).toHaveBeenCalledTimes(2);
    expect(result.current.jobStates[mockJobId].error).toBeNull();
    expect(result.current.jobStates[mockJobId].matches).toHaveLength(1);
  });

  it("error de acceso: muestra mensaje de error específico", async () => {
    const mockError = new Error("Job not found or access denied");
    vi.spyOn(CompatibilityService, "getMatchesForJob").mockRejectedValue(mockError);

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.error).toBe(
        "Job not found or access denied"
      );
    });
  });

  it("dos vacantes con estado independiente", async () => {
    const mockJob2Id = "job2";
    const mockMatch1: CandidateMatch = { ...mockMatch, jobId: mockJobId };
    const mockMatch2: CandidateMatch = {
      ...mockMatch,
      jobId: mockJob2Id,
      userId: "user2",
    };

    vi.spyOn(CompatibilityService, "getMatchesForJob")
      .mockResolvedValueOnce({
        matches: [mockMatch1],
        nextCursor: undefined,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        matches: [mockMatch2],
        nextCursor: "cursor456",
        hasMore: true,
      });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    // Abrir job1
    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    // Abrir job2
    act(() => {
      result.current.handleOpenJob(mockJob2Id);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJob2Id]?.loaded).toBe(true);
    });

    // Verificar que ambos tienen estados independientes
    expect(result.current.jobStates[mockJobId].matches).toHaveLength(1);
    expect(result.current.jobStates[mockJobId].hasMore).toBe(false);
    expect(result.current.jobStates[mockJob2Id].matches).toHaveLength(1);
    expect(result.current.jobStates[mockJob2Id].hasMore).toBe(true);
    expect(result.current.jobStates[mockJob2Id].nextCursor).toBe("cursor456");
  });

  it("abrir una vacante dispara una sola carga", async () => {
    const mockGetMatches = vi
      .spyOn(CompatibilityService, "getMatchesForJob")
      .mockResolvedValue({
        matches: [mockMatch],
        nextCursor: undefined,
        hasMore: false,
      });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    // Abrir por primera vez
    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    expect(mockGetMatches).toHaveBeenCalledTimes(1);

    // Abrir de nuevo (debería usar cache)
    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    // No debería haber llamada adicional
    expect(mockGetMatches).toHaveBeenCalledTimes(1);
  });

  it("bloqueo por loadingMore: doble clic en Ver más no hace doble request", async () => {
    const mockGetMatches = vi
      .spyOn(CompatibilityService, "getMatchesForJob")
      .mockResolvedValue({
        matches: [mockMatch],
        nextCursor: "cursor123",
        hasMore: true,
      });

    const { result } = renderHook(() => useJobAccordion(mockRecruiterId));

    // Primera carga
    act(() => {
      result.current.handleOpenJob(mockJobId);
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId]?.loaded).toBe(true);
    });

    // Doble clic en "Ver más"
    act(() => {
      result.current.handleLoadMore(mockJobId);
      result.current.handleLoadMore(mockJobId); // Segunda llamada inmediata
    });

    await waitFor(() => {
      expect(result.current.jobStates[mockJobId].loadingMore).toBe(false);
    });

    // Solo debería haber 2 llamadas: inicial + una sola load more
    expect(mockGetMatches).toHaveBeenCalledTimes(2);
  });
});
