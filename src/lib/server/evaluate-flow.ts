/**
 * Orchestrates the evaluation flow decision order.
 * Extracted for testability with dependency injection.
 */

export interface EvaluateFlowDeps {
  fetchRepoMetadata: (owner: string, repo: string) => Promise<{ full_name: string; private: boolean }>;
  getUserAllowlist: (uid: string) => Promise<string[]>;
  checkCache: (uid: string, repoFullName: string) => Promise<{ hit: boolean; data?: unknown }>;
  consumeRateLimit: (uid: string) => Promise<{ allowed: boolean }>;
  writeEvidence: (uid: string, repoFullName: string, data: unknown) => Promise<void>;
  analyzeRepo: (owner: string, repo: string) => Promise<unknown>;
}

export type FlowResult =
  | { type: 'repo_not_found'; status: 404 }
  | { type: 'not_authorized'; status: 403 }
  | { type: 'cache_hit'; status: 200; data: unknown }
  | { type: 'rate_limited'; status: 429 }
  | { type: 'success'; status: 200; data: unknown };

/**
 * Evaluates a GitHub repository following the correct order:
 * 1. Fetch metadata (lightweight)
 * 2. Check authorization (if private)
 * 3. Check cache
 * 4. Consume rate limit
 * 5. Analyze + write
 */
export async function evaluateRepoFlow(
  owner: string,
  repo: string,
  uid: string,
  deps: EvaluateFlowDeps
): Promise<FlowResult> {
  const fullName = `${owner}/${repo}`;

  // Step 1: Fetch metadata (lightweight check)
  let metadata;
  try {
    metadata = await deps.fetchRepoMetadata(owner, repo);
  } catch (error) {
    // 404: repo doesn't exist or no access
    if (error instanceof Error && 'httpStatus' in error && (error as Error & { httpStatus: number }).httpStatus === 404) {
      return { type: 'repo_not_found', status: 404 };
    }
    throw error;
  }

  // Step 2: Check authorization (if private)
  if (metadata.private) {
    const allowlist = await deps.getUserAllowlist(uid);
    const authorized = allowlist.includes(metadata.full_name);
    
    if (!authorized) {
      // CRITICAL: Return 403 WITHOUT calling consumeRateLimit or writeEvidence
      return { type: 'not_authorized', status: 403 };
    }
  }

  // Step 3: Check cache
  const cache = await deps.checkCache(uid, fullName);
  if (cache.hit) {
    // Cache hit: return without consuming rate limit or analyzing
    return { type: 'cache_hit', status: 200, data: cache.data };
  }

  // Step 4: Consume rate limit
  const rateLimit = await deps.consumeRateLimit(uid);
  if (!rateLimit.allowed) {
    return { type: 'rate_limited', status: 429 };
  }

  // Step 5: Analyze + write
  const analysis = await deps.analyzeRepo(owner, repo);
  await deps.writeEvidence(uid, fullName, analysis);

  return { type: 'success', status: 200, data: analysis };
}
