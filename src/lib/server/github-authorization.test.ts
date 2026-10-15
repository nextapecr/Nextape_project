/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { validateRepoRef, authorizeRepo, filterEvidenceForAggregate } from "./github-authorization";

describe("validateRepoRef", () => {
  it("accepts valid owner/repo pairs", () => {
    expect(validateRepoRef("owner", "repo").valid).toBe(true);
    expect(validateRepoRef("my-org", "my-project").valid).toBe(true);
    expect(validateRepoRef("user123", "repo_name").valid).toBe(true);
    expect(validateRepoRef("Company", "Product.API").valid).toBe(true);
  });

  it("rejects invalid owner names", () => {
    expect(validateRepoRef("", "repo").valid).toBe(false);
    expect(validateRepoRef("-invalid", "repo").valid).toBe(false); // Can't start with hyphen
    expect(validateRepoRef("invalid-", "repo").valid).toBe(false); // Can't end with hyphen
    expect(validateRepoRef("owner/extra", "repo").valid).toBe(false); // No slashes in owner
  });

  it("rejects empty or missing segments", () => {
    expect(validateRepoRef("", "").valid).toBe(false);
    expect(validateRepoRef("owner", "").valid).toBe(false);
    expect(validateRepoRef("", "repo").valid).toBe(false);
  });
});

describe("authorizeRepo", () => {
  it("allows public repo without checking allowlist", () => {
    const result = authorizeRepo(
      { private: false, full_name: "owner/public-repo" },
      []
    );
    
    expect(result.allowed).toBe(true);
    expect(result.canonicalFullName).toBe("owner/public-repo");
    expect(result.reason).toBe("public");
  });

  it("allows private repo if in allowlist", () => {
    const result = authorizeRepo(
      { private: true, full_name: "owner/private-repo" },
      ["owner/private-repo", "owner/other-repo"]
    );
    
    expect(result.allowed).toBe(true);
    expect(result.canonicalFullName).toBe("owner/private-repo");
    expect(result.reason).toBe("private_in_allowlist");
  });

  it("rejects private repo not in allowlist", () => {
    const result = authorizeRepo(
      { private: true, full_name: "owner/unauthorized-repo" },
      ["owner/other-repo"]
    );
    
    expect(result.allowed).toBe(false);
    expect(result.canonicalFullName).toBe("owner/unauthorized-repo");
    expect(result.reason).toBe("private_not_in_allowlist");
  });

  it("rejects private repo when allowlist is empty", () => {
    const result = authorizeRepo(
      { private: true, full_name: "owner/private-repo" },
      []
    );
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("private_not_in_allowlist");
  });

  it("matches allowlist case-insensitively", () => {
    const result = authorizeRepo(
      { private: true, full_name: "Owner/Private-Repo" }, // Mixed case from GitHub
      ["owner/private-repo"] // Lowercase in allowlist
    );
    
    expect(result.allowed).toBe(true);
    expect(result.canonicalFullName).toBe("Owner/Private-Repo");
    expect(result.reason).toBe("private_in_allowlist");
  });

  it("uses canonical full_name from GitHub", () => {
    const result = authorizeRepo(
      { private: false, full_name: "CanonicalOwner/CanonicalRepo" },
      []
    );
    
    expect(result.canonicalFullName).toBe("CanonicalOwner/CanonicalRepo");
  });
});

describe("filterEvidenceForAggregate", () => {
  it("includes public repos", () => {
    const repos = [
      { fullName: "owner/public1", isPrivate: false },
      { fullName: "owner/public2", isPrivate: false },
    ];
    
    const result = filterEvidenceForAggregate(repos, []);
    
    expect(result).toHaveLength(2);
    expect(result).toEqual(repos);
  });

  it("includes private repos in allowlist", () => {
    const repos = [
      { fullName: "owner/private1", isPrivate: true },
      { fullName: "owner/private2", isPrivate: true },
    ];
    
    const result = filterEvidenceForAggregate(repos, [
      "owner/private1",
      "owner/private2",
    ]);
    
    expect(result).toHaveLength(2);
  });

  it("excludes private repos not in allowlist", () => {
    const repos = [
      { fullName: "owner/public", isPrivate: false },
      { fullName: "owner/private-allowed", isPrivate: true },
      { fullName: "owner/private-not-allowed", isPrivate: true },
    ];
    
    const result = filterEvidenceForAggregate(repos, ["owner/private-allowed"]);
    
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.fullName)).toEqual([
      "owner/public",
      "owner/private-allowed",
    ]);
  });

  it("excludes repos without isPrivate field (legacy data)", () => {
    const repos = [
      { fullName: "owner/public", isPrivate: false },
      { fullName: "owner/legacy", isPrivate: undefined },
      { fullName: "owner/legacy2" }, // missing field
    ];
    
    const result = filterEvidenceForAggregate(repos, []);
    
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe("owner/public");
  });

  it("matches allowlist case-insensitively", () => {
    const repos = [
      { fullName: "Owner/Private-Repo", isPrivate: true }, // Mixed case
    ];
    
    const result = filterEvidenceForAggregate(repos, ["owner/private-repo"]); // Lowercase
    
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe("Owner/Private-Repo");
  });

  it("handles empty allowlist", () => {
    const repos = [
      { fullName: "owner/public", isPrivate: false },
      { fullName: "owner/private", isPrivate: true },
    ];
    
    const result = filterEvidenceForAggregate(repos, []);
    
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe("owner/public");
  });

  it("handles empty repos array", () => {
    const result = filterEvidenceForAggregate([], ["owner/repo"]);
    
    expect(result).toHaveLength(0);
  });
});
