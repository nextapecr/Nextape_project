/**
 * Script to diagnose GitHub analysis errors from Firestore.
 * 
 * Usage:
 *   npx tsx scripts/diagnose-github-errors.ts [uid]
 * 
 * If uid is not provided, shows errors from all users.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env.local
dotenv.config({ path: '.env.local' });

// Initialize Firebase Admin
let serviceAccount: any;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Try to load from firebase-admin-key.json
  const keyPath = join(process.cwd(), 'firebase-admin-key.json');
  if (existsSync(keyPath)) {
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
  } else {
    console.error('❌ Firebase credentials not found.');
    console.error('Set FIREBASE_SERVICE_ACCOUNT env var or create firebase-admin-key.json');
    process.exit(1);
  }
}

try {
  initializeApp({
    credential: cert(serviceAccount),
  });
} catch (err: any) {
  if (!err.message?.includes('already exists')) {
    throw err;
  }
}

const db = getFirestore();

interface GithubAnalysisError {
  analysisId: string;
  uid: string;
  githubUsername: string;
  repoFullName: string;
  stage: string;
  operation: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
  retryable: boolean;
  engineVersion: string;
  timestamp: { _seconds: number; _nanoseconds: number };
}

async function diagnoseErrors(uid?: string) {
  console.log('🔍 Querying github_analysis_errors collection...\n');
  
  let query = db.collection('github_analysis_errors').orderBy('timestamp', 'desc');
  
  if (uid) {
    console.log(`Filtering by uid: ${uid}\n`);
    query = query.where('uid', '==', uid) as any;
  }
  
  const snapshot = await query.limit(50).get();
  
  if (snapshot.empty) {
    console.log('✅ No errors found in github_analysis_errors collection.');
    console.log('\nThis means either:');
    console.log('  1. No GitHub analyses have failed yet');
    console.log('  2. All analyses completed successfully');
    console.log('  3. The error instrumentation has not been deployed yet\n');
    return;
  }
  
  console.log(`Found ${snapshot.size} error(s):\n`);
  console.log('═'.repeat(80));
  
  const errorsByRepo = new Map<string, GithubAnalysisError[]>();
  
  snapshot.forEach(doc => {
    const error = doc.data() as GithubAnalysisError;
    const errors = errorsByRepo.get(error.repoFullName) || [];
    errors.push(error);
    errorsByRepo.set(error.repoFullName, errors);
  });
  
  // Group by repository
  let repoIndex = 1;
  for (const [repoFullName, errors] of errorsByRepo.entries()) {
    const latestError = errors[0]; // Most recent
    const timestamp = new Date(latestError.timestamp._seconds * 1000);
    
    console.log(`\n📦 REPO #${repoIndex}: ${repoFullName}`);
    console.log('─'.repeat(80));
    console.log(`User:         ${latestError.githubUsername}`);
    console.log(`Error Code:   ${latestError.errorCode}`);
    console.log(`HTTP Status:  ${latestError.httpStatus || 'N/A'}`);
    console.log(`Stage:        ${latestError.stage}`);
    console.log(`Retryable:    ${latestError.retryable ? '✅ YES' : '❌ NO'}`);
    console.log(`Timestamp:    ${timestamp.toLocaleString()}`);
    console.log(`Message:      ${latestError.errorMessage}`);
    
    if (errors.length > 1) {
      console.log(`\n⚠️  This repo has failed ${errors.length} times`);
    }
    
    repoIndex++;
  }
  
  console.log('\n' + '═'.repeat(80));
  
  // Summary table
  console.log('\n📊 DIAGNOSTIC TABLE:\n');
  console.log('| Repo | Stage | Error Code | HTTP | Retryable | Root Cause |');
  console.log('|------|-------|-----------|------|-----------|------------|');
  
  for (const [repoFullName, errors] of errorsByRepo.entries()) {
    const error = errors[0];
    const rootCause = inferRootCause(error);
    const httpStatus = error.httpStatus || '-';
    const retryable = error.retryable ? 'YES' : 'NO';
    
    console.log(
      `| ${repoFullName} | ${error.stage} | ${error.errorCode} | ${httpStatus} | ${retryable} | ${rootCause} |`
    );
  }
  
  console.log('\n');
}

function inferRootCause(error: GithubAnalysisError): string {
  switch (error.errorCode) {
    case 'GITHUB_FORBIDDEN':
      return 'OAuth scope insufficient';
    case 'GITHUB_NOT_FOUND':
      return 'Repo deleted/renamed';
    case 'GITHUB_UNAUTHORIZED':
      return 'Token expired/invalid';
    case 'GITHUB_RATE_LIMITED':
      return 'GitHub API rate limit';
    case 'GITHUB_TIMEOUT':
      return 'Network/function timeout';
    case 'GITHUB_SERVER_ERROR':
      return 'GitHub internal error';
    case 'ANALYSIS_ERROR':
      return 'Parser/engine error';
    case 'FIRESTORE_ERROR':
      return 'Database save failure';
    default:
      return 'Unknown';
  }
}

// Main
const uid = process.argv[2];
diagnoseErrors(uid)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
