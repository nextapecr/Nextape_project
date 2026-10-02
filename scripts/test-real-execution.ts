// Debe ir PRIMERO: carga .env.local antes de que se evalúen los imports que leen
// process.env al importarse (src/ai/genkit.ts construye el cliente de Groq ahí mismo).
import './load-env';

import { adminDb } from '../src/lib/firebase/admin';
import { GithubSignalsService } from '../src/services/github-signals.service';
import { analyzeRepositorySources } from '../src/services/github-engine';
import { generateGithubFeedback } from '../src/ai/flows/generate-github-feedback-flow';
import type { GithubEvidence } from '../src/types/github.types';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * DEPRECATED: This script requires OAuth token.
 * 
 * getUserRepos() has been removed as part of OAuth migration (Phase 1-4).
 * Use getCollaborativeRepos(token) with a valid OAuth token instead.
 * 
 * For manual testing, use the OAuth flow through the web interface.
 */
async function main() {
  const TEST_UID = 'test_user_real_execution';
  
  console.log('=== NOTE: This script is DEPRECATED ===');
  console.log('getUserRepos() has been removed. Use getCollaborativeRepos(token) instead.');
  console.log('This script requires OAuth token. Use the OAuth flow through the web interface.');
  return;
}

main();
