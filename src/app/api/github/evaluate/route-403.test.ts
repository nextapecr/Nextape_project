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
    const analyzeRepo = vi.fn().mockResolvedValue({ analyzed: true });
    
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
    const analyzeRepo = vi.fn().mockResolvedValue({ analyzed: true });
    
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
    const error = new Error("Not found");
    (error as any).httpStatus = 404;
    
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
});
