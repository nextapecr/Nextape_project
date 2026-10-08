/**
 * Test de integración end-to-end para el GitHub Evaluation Engine.
 * Ejecutar con: npx tsx scripts/test-github-engine.ts
 */

import './load-env';
import { typescriptParser } from '../src/services/github-engine/parsers/typescript-parser';
import { typescriptToIR } from '../src/services/github-engine/ir/typescript-to-ir';
import { analyzeRepositorySources } from '../src/services/github-engine';
import { generateGithubFeedback } from '../src/ai/flows/generate-github-feedback-flow';

console.log('=== Test 1: Parser y AST -> IR ===');

const sampleCode = `
import { getDocById, setDocById } from '@/lib/firebase/firestore';
import type { UserProfile } from '@/types/user.types';

export async function fetchUser(uid: string): Promise<UserProfile | null> {
  if (!uid) {
    throw new Error('UID es requerido');
  }
  return getDocById<UserProfile>('users', uid);
}

export class UserService {
  async save(uid: string, data: Partial<UserProfile>): Promise<void> {
    if (!uid || !data) return;
    await setDocById('users', uid, data);
  }
}

describe('UserService Test', () => {
  it('should fetch user', async () => {
    expect(true).toBe(true);
  });
});
`;

const parsedAST = typescriptParser.parse(sampleCode, 'users.service.ts');
console.log('Parser language:', parsedAST.language);
console.log('Has parse errors:', parsedAST.hasParseErrors);

const fileIR = typescriptToIR(parsedAST.root, 'users.service.ts', parsedAST.language, parsedAST.hasParseErrors);
console.log('Functions found:', fileIR.functions.length);
console.log('Classes found:', fileIR.classes.length);
console.log('Imports found:', fileIR.imports.length);
console.log('Exports found:', fileIR.exports.length);
console.log('Test count:', fileIR.testCount);

console.log('\n=== Test 2: Engine Orchestrator & Analyzers ===');

const mockSignals = {
  owner: 'nextape',
  repo: 'Nextape_project',
  lastCommitSHA: 'a1b2c3d4e5f6',
  commitFrequency90d: 42,
  languages: { TypeScript: 120000, HTML: 5000 },
  hasTests: true,
  hasCI: true,
  hasReadme: true,
  readmeLength: 1500,
  sizeKB: 450,
  stargazersCount: 12,
};

const result = analyzeRepositorySources(
  [{ filename: 'src/services/users.service.ts', content: sampleCode }],
  mockSignals,
);

console.log('Overall Score:', result.skillScores.overall);
console.log('Architecture:', result.skillScores.architecture);
console.log('Testing:', result.skillScores.testing);
console.log('Security:', result.skillScores.security);
console.log('Maintainability:', result.skillScores.maintainability);
console.log('Documentation:', result.skillScores.documentation);
console.log('Top Weaknesses:', result.skillScores.topWeaknesses);

console.log('\n=== Test 3: Flow de Interpretación IA (Groq GPT-OSS Fallback) ===');

async function testAIFlow() {
  const feedback = await generateGithubFeedback({
    architecture: result.skillScores.architecture,
    testing: result.skillScores.testing,
    security: result.skillScores.security,
    maintainability: result.skillScores.maintainability,
    documentation: result.skillScores.documentation,
    overall: result.skillScores.overall,
    topWeaknesses: result.skillScores.topWeaknesses,
  });

  console.log('Feedback generado:');
  console.log(JSON.stringify(feedback, null, 2));
}

testAIFlow().then(() => {
  console.log('\n✅ Todos los tests del GitHub Engine completados con éxito.');
});
