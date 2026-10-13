/**
 * Pure functions for GitHub private repo authorization validation.
 * 
 * Extracted for testability without complex Firebase/API mocks.
 */

/**
 * Validates GitHub repo reference format (owner/repo).
 * 
 * Rules:
 * - Owner and repo must match GitHub naming pattern
 * - No more than one slash
 * - No empty segments
 * 
 * @returns true if valid, false otherwise
 */
export function validateRepoRef(owner: string, repo: string): boolean {
  if (!owner || !repo) return false;
  
  // GitHub username/org pattern: alphanumeric, hyphens, max 39 chars
  const OWNER_PATTERN = /^[a-z0-9]([a-z0-9]|-(?=[a-z0-9])){0,38}$/i;
  
  // GitHub repo name pattern: alphanumeric, hyphens, underscores, dots
  const REPO_PATTERN = /^[a-z0-9._-]+$/i;
  
  return OWNER_PATTERN.test(owner) && REPO_PATTERN.test(repo);
}

/**
 * Determines if a repo is authorized for analysis.
 * 
 * Rules:
 * - Public repos: always authorized
 * - Private repos: only authorized if in allowlist (case-insensitive match)
 * 
 * @param repoData - GitHub API repo response with { private, full_name }
 * @param allowlist - Array of authorized private repo full names
 * @returns Authorization result with canonical name and reason
 */
export function authorizeRepo(
  repoData: { private: boolean; full_name: string },
  allowlist: string[]
): {
  allowed: boolean;
  canonicalFullName: string;
  reason: "public" | "private_in_allowlist" | "private_not_in_allowlist";
} {
  const canonicalFullName = repoData.full_name;
  const isPrivate = Boolean(repoData.private);
  
  if (!isPrivate) {
    return {
      allowed: true,
      canonicalFullName,
      reason: "public",
    };
  }
  
  // Private repo: check allowlist (case-insensitive)
  const allowlistNormalized = allowlist.map((name) => name.toLowerCase());
  const inAllowlist = allowlistNormalized.includes(canonicalFullName.toLowerCase());
  
  return {
    allowed: inAllowlist,
    canonicalFullName,
    reason: inAllowlist ? "private_in_allowlist" : "private_not_in_allowlist",
  };
}

/**
 * Filters repo evidence for aggregation based on authorization rules.
 * 
 * Rules:
 * - Repos without isPrivate field: excluded (legacy data, treated as unauthorized)
 * - Public repos (isPrivate=false): included
 * - Private repos (isPrivate=true): only included if in allowlist (case-insensitive)
 * 
 * @param repos - Array of GithubRepoEvidence documents
 * @param allowlist - Array of authorized private repo full names
 * @returns Filtered array with only authorized repos
 */
export function filterEvidenceForAggregate<T extends { fullName: string; isPrivate?: boolean }>(
  repos: T[],
  allowlist: string[]
): T[] {
  const allowlistNormalized = new Set(allowlist.map((name) => name.toLowerCase()));
  
  return repos.filter((repo) => {
    // Exclude repos without isPrivate (legacy data, treat as unauthorized)
    if (repo.isPrivate === undefined) return false;
    
    // Include public repos
    if (!repo.isPrivate) return true;
    
    // Private repos: only if in allowlist
    return allowlistNormalized.has(repo.fullName.toLowerCase());
  });
}
