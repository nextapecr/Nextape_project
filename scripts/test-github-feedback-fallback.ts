#!/usr/bin/env tsx
/**
 * Script de validación: Simula fallo de ambos modelos (429/error) para confirmar
 * que el fallback determinístico se activa correctamente.
 * 
 * Ejecutar:
 *   npx tsx scripts/test-github-feedback-fallback.ts
 *
 * El TEST 1 corre en un proceso hijo que ARRANCA con una API key inválida. Antes el script cambiaba
 * `process.env.GROQ_API_KEY` en caliente, pero el cliente de Groq se construye al importar
 * `src/ai/genkit.ts` (ver `scripts/load-env.ts`), así que seguía usando la key buena y el test no
 * probaba el fallo que decía probar.
 */

import './load-env';
import { spawnSync } from 'node:child_process';
import { MID_LEVEL_NAME, feedbackProfile } from './lib/github-feedback-profiles';
import { generateGithubFeedback } from '@/ai/flows/generate-github-feedback-flow';
import type { GenerateGithubFeedbackInput } from '@/ai/flows/generate-github-feedback-flow';

console.log('═'.repeat(80));
console.log('🧪 TEST DE FALLBACK DETERMINÍSTICO - GitHub Feedback');
console.log('═'.repeat(80));
console.log('');

const INVALID_KEY = 'invalid-key-12345';
/** Este proceso es el hijo del TEST 1 (arrancado con la key inválida). */
const IS_INVALID_KEY_CHILD = process.argv.includes('--invalid-key-child');

// Caso de prueba: el perfil mid-level compartido.
const testInput: GenerateGithubFeedbackInput = feedbackProfile(MID_LEVEL_NAME);

/** Llama al flow, mide cuánto tarda e imprime la cabecera del resultado. `null` si no hubo feedback. */
async function timedFeedback() {
  const startTime = Date.now();
  const result = await generateGithubFeedback(testInput);
  const duration = Date.now() - startTime;

  console.log('');
  console.log('─'.repeat(80));
  console.log('📊 RESULTADO:');
  console.log('─'.repeat(80));
  if (result) {
    console.log(`✅ Feedback generado exitosamente`);
    console.log(`📍 Source: ${result.source}`);
    console.log(`⏱️  Duración: ${duration}ms`);
    console.log('');
  }
  return result;
}

async function runInvalidKeyCase(): Promise<boolean> {
  console.log('📋 TEST 1: Simular fallo con API key inválida');
  console.log('─'.repeat(80));
  console.log('');

  if (process.env.GROQ_API_KEY !== INVALID_KEY) {
    console.log('❌ El proceso no arrancó con la key inválida; el test no sería válido.');
    return false;
  }

  try {
    console.log('🔧 Configuración: API key = "invalid-key-12345" (inválida)');
    console.log('📊 Input scores: overall=64/100');
    console.log('📝 Top weaknesses: 3 áreas identificadas\n');

    const result = await timedFeedback();

    if (result) {
      console.log('📝 Feedback:');
      console.log(`   "${result.feedback}"`);
      console.log('');
      console.log('💪 Strengths:');
      result.strengths.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
      console.log('');
      console.log('🎯 Improvements:');
      result.improvements.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
      console.log('');

      if (result.source === 'deterministic') {
        console.log('✅ ÉXITO: Fallback determinístico activado correctamente');
        console.log('   - IA falló (como se esperaba con API key inválida)');
        console.log('   - Sistema construyó feedback estructurado desde scores');
        console.log('   - Usuario recibe análisis válido sin errores');
        return true;
      } else {
        console.log('❌ FALLO: Se esperaba source="deterministic" pero se obtuvo source="ai"');
        console.log('   Esto sugiere que la API key inválida no provocó el error esperado');
      }
    } else {
      console.log('❌ FALLO: No se generó feedback (se esperaba fallback determinístico)');
    }
  } catch (error) {
    console.log('');
    console.log('❌ ERROR INESPERADO: El sistema lanzó excepción en lugar de usar fallback');
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    console.log('');
    console.log('   Esto indica que el try-catch en generateGithubFeedback() no está');
    console.log('   capturando todos los errores correctamente.');
  }
  return false;
}

/** Lanza el TEST 1 en un proceso hijo con la key inválida desde el arranque. */
function testWithInvalidKey(): boolean {
  // El mismo ejecutable y los mismos flags (el loader de tsx) que este proceso: sin buscar `npx` en el PATH.
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], '--invalid-key-child'], {
    env: { ...process.env, GROQ_API_KEY: INVALID_KEY },
    stdio: 'inherit',
  });
  return child.status === 0;
}

async function testWithValidKey() {
  console.log('');
  console.log('═'.repeat(80));
  console.log('📋 TEST 2: Confirmar funcionamiento normal con API key válida');
  console.log('─'.repeat(80));
  console.log('');

  try {
    console.log('🔧 Configuración: API key restaurada (válida)');
    console.log('📊 Input scores: mismo perfil (overall=64/100)\n');

    const result = await timedFeedback();

    if (result) {
      console.log('📝 Feedback (primeras 150 chars):');
      console.log(`   "${result.feedback.slice(0, 150)}..."`);
      console.log('');

      if (result.source === 'ai') {
        console.log('✅ ÉXITO: IA funcionando correctamente con API key válida');
      } else {
        console.log('⚠️  ADVERTENCIA: Se usó fallback determinístico con API key válida');
        console.log('   Esto puede indicar rate limit o problema temporal con Groq');
      }
    } else {
      console.log('❌ FALLO: No se generó feedback con API key válida');
    }
  } catch (error) {
    console.log('');
    console.log('❌ ERROR: Fallo con API key válida');
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
  }
}

async function runTests(): Promise<boolean> {
  const fallbackOk = testWithInvalidKey();

  // Pausa de 2 segundos entre tests
  console.log('');
  console.log('⏳ Esperando 2 segundos antes del siguiente test...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await testWithValidKey();

  console.log('');
  console.log('═'.repeat(80));
  console.log(fallbackOk ? '✅ El fallback determinístico se activó con la key inválida' : '❌ El fallback NO se comprobó');
  console.log('═'.repeat(80));
  console.log('');
  return fallbackOk;
}

if (IS_INVALID_KEY_CHILD) {
  runInvalidKeyCase()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => {
      console.error('❌ Error fatal en el TEST 1:', error);
      process.exit(1);
    });
} else {
  runTests()
    .then((ok) => {
      console.log(ok ? '✅ Suite de tests completada' : '❌ Suite con fallos');
      process.exit(ok ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Error fatal en suite:', error);
      process.exit(1);
    });
}
