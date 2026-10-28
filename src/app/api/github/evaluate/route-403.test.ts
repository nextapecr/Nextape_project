/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";
import { evaluateRepoFlow, type EvaluateFlowDeps } from "@/lib/server/evaluate-flow";

describe("evaluate flow - 403 prevents rate limit and Firestore write", () => {
  it("RED: private repo NOT in allowlist → 403 WITHOUT consumeRateLimit or writeEvidence", async () => {
    // Arrange: mock dependencies
    const fetchRepoMetadata = vi.fn().mockResolvedValue({
      full_name: "owner/private-repo",
      private: true,
    });
    
    const getUserAllowlist = vi.fn().mockResolvedValue([]); // Empty allowlist
    
    const checkCache = vi.fn();
    const consumeRateLimit = vi.fn();
    const writeEvidence = vi.fn();
    const analyzeRepo = vi.fn();
    
    const deps: EvaluateFlowDeps = {
      fetchRepoMetadata,
      getUserAllowlist,
      checkCache,
      consumeRateLimit,
      writeEvidence,
      analyzeRepo,
    };

    // Act
    const result = await evaluateRepoFlow("owner", "private-repo", "test-uid", deps);

    // Assert: 403 returned
    expect(result.type).toBe("not_authorized");
    expect(result.status).toBe(403);

    // Assert: metadata and allowlist were checked
    expect(fetchRepoMetadata).toHaveBeenCalledTimes(1);
    expect(getUserAllowlist).toHaveBeenCalledTimes(1);

    // Assert: NO rate limit consumed
    expect(consumeRateLimit).not.toHaveBeenCalled();

    // Assert: NO Firestore write
    expect(writeEvidence).not.toHaveBeenCalled();

    // Assert: NO analysis performed
    expect(analyzeRepo).not.toHaveBeenCalled();
    
    // Assert: cache not even checked (returns before that step)
    expect(checkCache).not.toHaveBeenCalled();
  });

  it("GREEN: private repo IN allowlist → proceeds to cache/rate limit/analysis", async () => {
    // Arrange
    const fetchRepoMetadata = vi.fn().mockResolvedValue({
      full_name: "owner/private-repo",
      private: true,
    });
    
    const getUserAllowlist = vi.fn().mockResolvedValue(["owner/private-repo"]); // Authorized
    
    const checkCache = vi.fn().mockResolvedValue({ hit: false }); // Cache miss
    const consumeRateLimit = vi.fn().mockResolvedValue({ allowed: true });
    const writeEvidence = vi.fn().mockResolvedValue(undefined);
    const analyzeRepo = vi.fn().mockResolvedValue({ evidence: { fullName: "x" }, response: { cached: false } });
    
    const deps: EvaluateFlowDeps = {
      fetchRepoMetadata,
      getUserAllowlist,
      checkCache,
      consumeRateLimit,
      writeEvidence,
      analyzeRepo,
    };

    // Act
    const result = await evaluateRepoFlow("owner", "private-repo", "test-uid", deps);

    // Assert: success
    expect(result.type).toBe("success");
    expect(result.status).toBe(200);

    // Assert: all steps were called
    expect(fetchRepoMetadata).toHaveBeenCalledTimes(1);
    expect(getUserAllowlist).toHaveBeenCalledTimes(1);
    expect(checkCache).toHaveBeenCalledTimes(1);
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(analyzeRepo).toHaveBeenCalledTimes(1);
    expect(writeEvidence).toHaveBeenCalledTimes(1);
  });

  it("GREEN: public repo → proceeds without authorization check", async () => {
    // Arrange
    const fetchRepoMetadata = vi.fn().mockResolvedValue({
      full_name: "owner/public-repo",
      private: false, // Public
    });
    
    const getUserAllowlist = vi.fn(); // Should not be called for public repos
    const checkCache = vi.fn().mockResolvedValue({ hit: false });
    const consumeRateLimit = vi.fn().mockResolvedValue({ allowed: true });
    const writeEvidence = vi.fn().mockResolvedValue(undefined);
    const analyzeRepo = vi.fn().mockResolvedValue({ evidence: { fullName: "x" }, response: { cached: false } });
    
    const deps: EvaluateFlowDeps = {
      fetchRepoMetadata,
      getUserAllowlist,
      checkCache,
      consumeRateLimit,
      writeEvidence,
      analyzeRepo,
    };

    // Act
    const result = await evaluateRepoFlow("owner", "public-repo", "test-uid", deps);

    // Assert: success
    expect(result.type).toBe("success");

    // Assert: allowlist NOT checked for public repos
    expect(getUserAllowlist).not.toHaveBeenCalled();

    // Assert: rate limit and write WERE called
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(writeEvidence).toHaveBeenCalledTimes(1);
  });

  it("RED: 404 from metadata → repo_not_found WITHOUT write", async () => {
    // Arrange
    const error = new Error("Not found") as Error & { httpStatus: number };
    error.httpStatus = 404;
    
    const fetchRepoMetadata = vi.fn().mockRejectedValue(error);
    
    const getUserAllowlist = vi.fn();
    const checkCache = vi.fn();
    const consumeRateLimit = vi.fn();
    const writeEvidence = vi.fn();
    const analyzeRepo = vi.fn();
    
    const deps: EvaluateFlowDeps = {
      fetchRepoMetadata,
      getUserAllowlist,
      checkCache,
      consumeRateLimit,
      writeEvidence,
      analyzeRepo,
    };

    // Act
    const result = await evaluateRepoFlow("owner", "nonexistent", "test-uid", deps);

    // Assert: 404 returned
    expect(result.type).toBe("repo_not_found");
    expect(result.status).toBe(404);

    // Assert: NO write performed
    expect(writeEvidence).not.toHaveBeenCalled();
    expect(analyzeRepo).not.toHaveBeenCalled();
  });

  // ── Regresiones de la revisión del 2026-10-28 ──

  const baseDeps = (over: Partial<EvaluateFlowDeps<Record<string, unknown>, Record<string, unknown>>> = {}) => ({
    fetchRepoMetadata: vi.fn().mockResolvedValue({ full_name: "owner/repo", private: false }),
    getUserAllowlist: vi.fn().mockResolvedValue([]),
    checkCache: vi.fn().mockResolvedValue({ hit: false }),
    consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    writeEvidence: vi.fn().mockResolvedValue(undefined),
    analyzeRepo: vi.fn().mockResolvedValue({
      evidence: { fullName: "owner/repo", githubUsername: "owner", isPrivate: false },
      response: { cached: false, fullName: "owner/repo" },
    }),
    ...over,
  });

  it("guarda SOLO la evidencia (campos de primer nivel), no el par { evidence, response }", async () => {
    const deps = baseDeps();
    const result = await evaluateRepoFlow("owner", "repo", "uid", deps);

    expect(deps.writeEvidence).toHaveBeenCalledWith("uid", "owner/repo", {
      fullName: "owner/repo",
      githubUsername: "owner",
      isPrivate: false,
    });
    // Y al cliente le llega la respuesta, no la evidencia.
    expect(result).toEqual({ type: "success", status: 200, data: { cached: false, fullName: "owner/repo" } });
  });

  it("la lista de repos privados no distingue mayúsculas (igual que aggregate)", async () => {
    const deps = baseDeps({
      fetchRepoMetadata: vi.fn().mockResolvedValue({ full_name: "Owner/Repo", private: true }),
      getUserAllowlist: vi.fn().mockResolvedValue(["owner/repo"]),
    });
    const result = await evaluateRepoFlow("Owner", "Repo", "uid", deps);
    expect(result.type).toBe("success");
  });

  it("429 lleva el tiempo de espera real y no vuelve a consumir el límite", async () => {
    const deps = baseDeps({
      consumeRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterMs: 120_000 }),
    });
    const result = await evaluateRepoFlow("owner", "repo", "uid", deps);
    expect(result).toEqual({ type: "rate_limited", status: 429, retryAfterMs: 120_000 });
    expect(deps.consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(deps.analyzeRepo).not.toHaveBeenCalled();
    expect(deps.writeEvidence).not.toHaveBeenCalled();
  });
});
