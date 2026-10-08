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
import type { GenerateGithubFeedbackInput } from '@/ai/flows/generate-github-feedback-flow';

console.log('═'.repeat(80));
console.log('🧪 TEST DE TOKEN USAGE - GitHub Feedback con Groq GPT-OSS');
console.log('═'.repeat(80));
console.log('');

// Casos de prueba: diferentes perfiles técnicos
const testCases: Array<{ name: string; input: GenerateGithubFeedbackInput }> = [
  {
    name: 'Perfil Senior - Alto rendimiento',
    input: {
      architecture: 85,
      testing: 90,
      security: 88,
      maintainability: 82,
      documentation: 75,
      overall: 85,
      topWeaknesses: ['Documentación técnica podría ampliarse', 'Cobertura de tests de integración'],
    },
  },
  {
    name: 'Perfil Mid-level - Balance',
    input: {
      architecture: 65,
      testing: 70,
      security: 60,
      maintainability: 68,
      documentation: 55,
      overall: 64,
      topWeaknesses: ['Patrones de seguridad básicos', 'Tests unitarios insuficientes', 'Falta documentación de API'],
    },
  },
  {
    name: 'Perfil Junior - En desarrollo',
    input: {
      architecture: 45,
      testing: 35,
      security: 40,
      maintainability: 50,
      documentation: 30,
      overall: 40,
      topWeaknesses: ['Sin tests automatizados', 'Arquitectura monolítica sin separación', 'Código sin documentar'],
    },
  },
  {
    name: 'Perfil Frontend - Especializado',
    input: {
      architecture: null, // Lenguaje no soportado por parser
      testing: 80,
      security: null,
      maintainability: null,
      documentation: 85,
      overall: 83,
      topWeaknesses: ['Análisis estático limitado por lenguaje'],
    },
  },
  {
    name: 'Perfil Backend - Seguridad fuerte',
    input: {
      architecture: 75,
      testing: 65,
      security: 95,
      maintainability: 70,
      documentation: 60,
      overall: 73,
      topWeaknesses: ['Cobertura de tests podría mejorar', 'Documentación de APIs incompleta'],
    },
  },
];

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
  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
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
