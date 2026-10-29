#!/usr/bin/env tsx
/**
 * Script de validación: Mide uso real de tokens en generateGithubFeedback
 * con 5 análisis simulados de diferentes perfiles técnicos.
 * 
 * Ejecutar:
 *   npx tsx scripts/test-github-feedback-tokens.ts
 */

import './load-env';
import { generateGithubFeedback } from '@/ai/flows/generate-github-feedback-flow';
import { FEEDBACK_PROFILES } from './lib/github-feedback-profiles';

console.log('═'.repeat(80));
console.log('🧪 TEST DE TOKEN USAGE - GitHub Feedback con Groq GPT-OSS');
console.log('═'.repeat(80));
console.log('');

// Casos de prueba: diferentes perfiles técnicos (compartidos con los otros scripts de feedback).
const testCases = FEEDBACK_PROFILES;

interface TestResult {
  name: string;
  success: boolean;
  source?: 'ai' | 'deterministic';
  duration: number;
  error?: string;
}

/** Ejecuta un caso y devuelve su resultado (nunca lanza). */
async function runCase(testCase: (typeof testCases)[number], index: number): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`[${index + 1}/${testCases.length}] 🧪 ${testCase.name}`);
  console.log(`   Overall: ${testCase.input.overall}/100`);
  try {
    const result = await generateGithubFeedback(testCase.input);
    const duration = Date.now() - startTime;
    if (!result) {
      console.log(`   ❌ No se pudo generar feedback\n`);
      return { name: testCase.name, success: false, duration, error: 'No feedback returned' };
    }
    console.log(`   ✅ Feedback generado (source: ${result.source})`);
    console.log(`   📝 "${result.feedback.slice(0, 80)}..."`);
    console.log(`   ⏱️  Duración: ${duration}ms\n`);
    // El uso de tokens lo registra generateGithubFeedback en sus propios logs.
    return { name: testCase.name, success: true, source: result.source, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Error: ${message}`);
    console.log(`   ⏱️  Duración: ${duration}ms\n`);
    return { name: testCase.name, success: false, duration, error: message };
  }
}

function printSummary(results: TestResult[]) {
  const ok = results.filter((r) => r.success);
  console.log('═'.repeat(80));
  console.log('📊 RESUMEN DE RESULTADOS');
  console.log('═'.repeat(80));
  console.log('');
  console.log(`✅ Casos exitosos: ${ok.length}/${results.length}`);
  console.log(`❌ Casos fallidos: ${results.length - ok.length}/${results.length}`);
  console.log('');
  console.log(`🤖 Feedback generado por IA: ${ok.filter((r) => r.source === 'ai').length}`);
  console.log(`📐 Feedback determinístico: ${ok.filter((r) => r.source === 'deterministic').length}`);
  console.log('');
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`);
  console.log('');
  console.log('NOTA: Las métricas de tokens se muestran en los logs individuales arriba.');
  console.log('Busca líneas con "📊 Token usage:" para ver el detalle por llamada.');
  console.log('');
  console.log('═'.repeat(80));
  console.log(ok.length === results.length ? '✅ TODOS LOS TESTS PASARON' : `⚠️  ${results.length - ok.length} test(s) fallaron`);
  console.log('═'.repeat(80));
}

async function runTests() {
  console.log(`📊 Ejecutando ${testCases.length} casos de prueba...\n`);
  const results: TestResult[] = [];
  for (const [i, testCase] of testCases.entries()) {
    results.push(await runCase(testCase, i));
    // Pequeña pausa entre llamadas para no saturar la API
    if (i < testCases.length - 1) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  printSummary(results);
  return results;
}

runTests()
  .then((results) => {
    console.log('\n✅ Test completado');
    process.exit(results.every((r) => r.success) ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ Error en test:', error);
    process.exit(1);
  });
