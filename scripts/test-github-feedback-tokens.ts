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
  model?: string;
  source?: 'ai' | 'deterministic';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  cacheHitRate?: string;
  duration: number;
  error?: string;
}

async function runTests() {
  const results: TestResult[] = [];
  let successCount = 0;

  console.log(`📊 Ejecutando ${testCases.length} casos de prueba...\n`);

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const startTime = Date.now();

    try {
      console.log(`[${i + 1}/${testCases.length}] 🧪 ${testCase.name}`);
      console.log(`   Overall: ${testCase.input.overall}/100`);

      const result = await generateGithubFeedback(testCase.input);
      const duration = Date.now() - startTime;

      if (result) {
        console.log(`   ✅ Feedback generado (source: ${result.source})`);
        console.log(`   📝 "${result.feedback.slice(0, 80)}..."`);
        console.log(`   ⏱️  Duración: ${duration}ms\n`);

        // Note: token usage is logged by generateGithubFeedback itself
        results.push({
          name: testCase.name,
          success: true,
          source: result.source,
          duration,
        });

        successCount++;
      } else {
        console.log(`   ❌ No se pudo generar feedback\n`);
        results.push({
          name: testCase.name,
          success: false,
          duration,
          error: 'No feedback returned',
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
      console.log(`   ⏱️  Duración: ${duration}ms\n`);

      results.push({
        name: testCase.name,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Pequeña pausa entre llamadas para no saturar la API
    if (i < testCases.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Resumen
  console.log('═'.repeat(80));
  console.log('📊 RESUMEN DE RESULTADOS');
  console.log('═'.repeat(80));
  console.log('');

  console.log(`✅ Casos exitosos: ${successCount}/${testCases.length}`);
  console.log(`❌ Casos fallidos: ${testCases.length - successCount}/${testCases.length}`);
  console.log('');

  const aiSources = results.filter((r) => r.success && r.source === 'ai').length;
  const deterministicSources = results.filter((r) => r.success && r.source === 'deterministic').length;

  console.log(`🤖 Feedback generado por IA: ${aiSources}`);
  console.log(`📐 Feedback determinístico: ${deterministicSources}`);
  console.log('');

  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`);
  console.log('');

  console.log('NOTA: Las métricas de tokens se muestran en los logs individuales arriba.');
  console.log('Busca líneas con "📊 Token usage:" para ver el detalle por llamada.');
  console.log('');

  console.log('═'.repeat(80));

  if (successCount === testCases.length) {
    console.log('✅ TODOS LOS TESTS PASARON');
  } else {
    console.log(`⚠️  ${testCases.length - successCount} test(s) fallaron`);
  }

  console.log('═'.repeat(80));
}

runTests()
  .then(() => {
    console.log('\n✅ Test completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en test:', error);
    process.exit(1);
  });
