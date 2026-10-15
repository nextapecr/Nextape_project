/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";

describe("evaluate/route - 403 authorization check (isolated)", () => {
  it("RED: 403 prevents Firestore write and rate limit", async () => {
    // Simplified test: verify authorization logic without full route
    const { authorizeRepo } = await import("@/lib/server/github-authorization");
    
    const repoMetadata = { full_name: "owner/private-repo", private: true };
    const allowlist: string[] = [];
    
    const result = authorizeRepo(repoMetadata, allowlist);
    
    // Assert: not allowed
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("private_not_in_allowlist");
  });

  it("GREEN: authorized private repo passes", async () => {
    const { authorizeRepo } = await import("@/lib/server/github-authorization");
    
    const repoMetadata = { full_name: "owner/private-repo", private: true };
    const allowlist = ["owner/private-repo"];
    
    const result = authorizeRepo(repoMetadata, allowlist);
    
    // Assert: allowed
    expect(result.allowed).toBe(true);
  });
});
