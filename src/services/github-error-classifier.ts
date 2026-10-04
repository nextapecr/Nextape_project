/**
 * @fileOverview GitHub Error Classification and Logging
 * 
 * Preserves root cause of GitHub analysis failures instead of converting
 * everything to generic "server_error". Enables precise diagnosis.
 * 
 * Security:
 * - NO tokens or secrets in logs
 * - NO private file contents
 * - Only public GitHub usernames and repo names
 */

import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  GithubErrorCode,
  GithubAnalysisStage,
  GithubAnalysisError,
  GithubErrorResponse,
} from '@/types/github.types';
import { GITHUB_ENGINE_VERSION } from './github-engine/evidence-keys';

/**
 * Classify error by HTTP status and message patterns.
 * Preserves the root cause instead of generic "server_error".
 */
export function classifyGithubError(
  err: unknown,
  stage: GithubAnalysisStage = 'unknown'
): {
  errorCode: GithubErrorCode;
  message: string;
  httpStatus?: number;
  retryable: boolean;
  stage: GithubAnalysisStage;
} {
  if (!(err instanceof Error)) {
    return {
      errorCode: 'UNKNOWN_ERROR',
      message: String(err),
      retryable: true,
      stage,
    };
  }

  const message = err.message.toLowerCase();
  const errorName = err.name.toLowerCase();

  // HTTP 401: Unauthorized
  if (
    message.includes('401') ||
    message.includes('unauthorized') ||
    message.includes('token expired') ||
    message.includes('token invalid')
  ) {
    return {
      errorCode: 'GITHUB_UNAUTHORIZED',
      message: err.message,
      httpStatus: 401,
      retryable: true, // May be retryable if token refresh succeeds
      stage,
    };
  }

  // HTTP 403: Forbidden
  if (
    message.includes('403') ||
    message.includes('forbidden') ||
    message.includes('insufficient permissions') ||
    message.includes('permission denied')
  ) {
    return {
      errorCode: 'GITHUB_FORBIDDEN',
      message: err.message,
      httpStatus: 403,
      retryable: false, // Permanent: OAuth scope issue or private repo
      stage,
    };
  }

  // HTTP 404: Not Found
  if (
    message.includes('404') ||
    message.includes('not found') ||
    message.includes('no se pudo obtener información del repositorio')
  ) {
    return {
      errorCode: 'GITHUB_NOT_FOUND',
      message: err.message,
      httpStatus: 404,
      retryable: false, // Permanent: repo deleted/renamed
      stage,
    };
  }

  // HTTP 429: Rate Limited
  if (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('rate_limited')
  ) {
    return {
      errorCode: 'GITHUB_RATE_LIMITED',
      message: err.message,
      httpStatus: 429,
      retryable: true, // Transient: retry after backoff
      stage,
    };
  }

  // Timeout
  if (
    errorName === 'aborterror' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  ) {
    return {
      errorCode: 'GITHUB_TIMEOUT',
      message: err.message,
      httpStatus: 504,
      retryable: true, // Transient: retry with backoff
      stage,
    };
  }

  // HTTP 5xx: GitHub Server Error
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error')
  ) {
    return {
      errorCode: 'GITHUB_SERVER_ERROR',
      message: err.message,
      httpStatus: extractHttpStatus(message) || 500,
      retryable: true, // Transient: GitHub issue
      stage,
    };
  }

  // Firestore errors
  if (
    message.includes('firestore') ||
    message.includes('firebase') ||
    errorName.includes('firestore')
  ) {
    return {
      errorCode: 'FIRESTORE_ERROR',
      message: err.message,
      retryable: true,
      stage,
    };
  }

  // Parser/Analysis errors
  if (
    stage === 'parse_files' ||
    stage === 'calculate_metrics' ||
    message.includes('parse') ||
    message.includes('syntax')
  ) {
    return {
      errorCode: 'ANALYSIS_ERROR',
      message: err.message,
      retryable: false, // Code issue, not transient
      stage,
    };
  }

  // Unknown error
  return {
    errorCode: 'UNKNOWN_ERROR',
    message: err.message,
    retryable: true, // Assume retryable unless proven otherwise
    stage,
  };
}

/**
 * Extract HTTP status code from error message.
 * Used when status is embedded in message but not as property.
 */
function extractHttpStatus(message: string): number | undefined {
  const match = message.match(/\b(4\d{2}|5\d{2})\b/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Log error to Firestore `github_analysis_errors` collection.
 * 
 * Security:
 * - NO tokens or secrets
 * - NO private file contents
 * - Only public identifiers and error metadata
 * 
 * @param db - Firestore Admin instance
 * @param analysisId - Unique ID for this analysis run
 * @param uid - User ID
 * @param githubUsername - GitHub username being analyzed
 * @param repoFullName - Repository full name (owner/repo)
 * @param operation - Operation description (e.g., "fetch /repos/{owner}/{repo}")
 * @param err - Error object
 * @param stage - Stage where error occurred
 */
export async function logGithubError(
  db: Firestore,
  analysisId: string,
  uid: string,
  githubUsername: string,
  repoFullName: string,
  operation: string,
  err: unknown,
  stage: GithubAnalysisStage = 'unknown'
): Promise<void> {
  try {
    const classified = classifyGithubError(err, stage);

    const errorDoc: GithubAnalysisError = {
      analysisId,
      uid,
      githubUsername,
      repoFullName,
      stage: classified.stage,
      operation,
      errorCode: classified.errorCode,
      errorMessage: classified.message.slice(0, 500), // Limit length
      httpStatus: classified.httpStatus,
      retryable: classified.retryable,
      engineVersion: GITHUB_ENGINE_VERSION,
      timestamp: { _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 },
    };

    await db.collection('github_analysis_errors').add(errorDoc);

    console.log('[github-error-classifier] Logged error:', {
      analysisId,
      repoFullName,
      stage: classified.stage,
      errorCode: classified.errorCode,
      httpStatus: classified.httpStatus,
      retryable: classified.retryable,
    });
  } catch (logErr) {
    // Don't fail analysis if logging fails
    console.error('[github-error-classifier] Failed to log error:', logErr);
  }
}

/**
 * Create GithubErrorResponse for API endpoint.
 * Preserves classification and details for frontend diagnosis.
 */
export function createErrorResponse(
  err: unknown,
  stage: GithubAnalysisStage = 'unknown'
): { response: GithubErrorResponse; httpStatus: number } {
  const classified = classifyGithubError(err, stage);

  return {
    response: {
      error: classified.errorCode,
      message: classified.message.slice(0, 200), // Limit for API response
      httpStatus: classified.httpStatus,
      stage: classified.stage,
      retryable: classified.retryable,
    },
    httpStatus: classified.httpStatus || 500,
  };
}

/**
 * Generate unique analysis ID for correlating errors in same analysis run.
 * Format: uid_timestamp_random
 */
export function generateAnalysisId(uid: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${uid}_${timestamp}_${random}`;
}
