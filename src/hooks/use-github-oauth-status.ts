/**
 * @fileOverview Hook to check if user has GitHub OAuth token stored.
 * Used to gate GitHub analysis feature (Phase 2).
 */

import { useEffect, useState } from 'react';
import { apiPost } from '@/lib/api';

interface OAuthStatus {
  hasToken: boolean;
  githubUsername: string | null;
  scopes: string[];
}

/**
 * Check if user has active GitHub OAuth token.
 * Returns null while loading, { hasToken: false } if no token, or status if token exists.
 */
export function useGithubOAuthStatus(uid: string | null): OAuthStatus | null {
  const [status, setStatus] = useState<OAuthStatus | null>(null);

  useEffect(() => {
    if (!uid) {
      setStatus(null);
      return;
    }

    let cancelled = false;

    apiPost<OAuthStatus>('/api/github/oauth/status', {})
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        console.error('[use-github-oauth-status] Error checking OAuth status:', err);
        if (!cancelled) setStatus({ hasToken: false, githubUsername: null, scopes: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return status;
}
