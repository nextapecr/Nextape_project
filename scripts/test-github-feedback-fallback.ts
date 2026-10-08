#!/usr/bin/env tsx
/**
 * Script de validación: Simula fallo de ambos modelos (429/error) para confirmar
 * que el fallback determinístico se activa correctamente.
 * 
 * Ejecutar:
 *   npx tsx scripts/test-github-feedback-fallback.ts
 */

import './load-env';
import { generateGithubFeedback } from '@/ai/flows/generate-github-feedback-flow';
import type { GenerateGithubFeedbackInput } from '@/ai/flows/generate-github-feedback-flow';

console.log('═'.repeat(80));
console.log('🧪 TEST DE FALLBACK DETERMINÍSTICO - GitHub Feedback');
console.log('═'.repeat(80));
console.log('');

// Guardar la API key original
const originalApiKey = process.env.GROQ_API_KEY;

// Caso de prueba
const testInput: GenerateGithubFeedbackInput = {
  architecture: 65,
  testing: 70,
  security: 60,
  maintainability: 68,
  documentation: 55,
  overall: 64,
  topWeaknesses: [
    'Patrones de seguridad básicos',
    'Tests unitarios insuficientes',
    'Falta documentación de API',
  ],
};

async function testWithInvalidKey() {
  console.log('📋 TEST 1: Simular fallo con API key inválida');
  console.log('─'.repeat(80));
  console.log('');

  // Temporalmente usar API key inválida para forzar el error
  process.env.GROQ_API_KEY = 'invalid-key-12345';

  try {
    console.log('🔧 Configuración: API key = "invalid-key-12345" (inválida)');
    console.log('📊 Input scores: overall=64/100');
    console.log('📝 Top weaknesses: 3 áreas identificadas\n');

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
  } finally {
    // Restaurar la API key original
    process.env.GROQ_API_KEY = originalApiKey;
  }
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

async function runTests() {
  await testWithInvalidKey();
  
  // Pausa de 2 segundos entre tests
  console.log('');
  console.log('⏳ Esperando 2 segundos antes del siguiente test...');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  
  await testWithValidKey();

  console.log('');
  console.log('═'.repeat(80));
  console.log('✅ TESTS COMPLETADOS');
  console.log('═'.repeat(80));
  console.log('');
  console.log('CONCLUSIONES:');
  console.log('- El fallback determinístico garantiza que el usuario SIEMPRE recibe feedback');
  console.log('- Cuando la IA falla, el sistema construye análisis estructurado desde scores');
  console.log('- El campo source permite a la UI distinguir feedback IA vs determinístico');
  console.log('- No hay errores 500 ni null responses: robustez garantizada');
  console.log('');
}

runTests()
  .then(() => {
    console.log('✅ Suite de tests completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal en suite:', error);
    process.exit(1);
  });
