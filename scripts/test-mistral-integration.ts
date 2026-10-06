#!/usr/bin/env tsx
/**
 * Test script para diagnosticar profundamente la integración con Mistral AI.
 * 
 * Objetivo: Determinar con evidencia exacta dónde falla el flujo de generación de feedback.
 * 
 * Ejecutar:
 *   npx tsx scripts/test-mistral-integration.ts
 */

// Cargar variables de entorno desde .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { generateGithubFeedback } from '../src/ai/flows/generate-github-feedback-flow';
import type { GenerateGithubFeedbackInput } from '../src/ai/flows/generate-github-feedback-flow';

console.log('═'.repeat(80));
console.log('🔬 DEEP MISTRAL AI INTEGRATION AUDIT');
console.log('═'.repeat(80));

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1: VERIFICAR CONFIGURACIÓN Y API KEY
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 FASE 1: CONFIGURACIÓN');
console.log('─'.repeat(80));

const apiKey = process.env.MISTRAL_API_KEY;
const model = process.env.MISTRAL_MODEL;

console.log('MISTRAL_API_KEY:', apiKey ? `PRESENT (${apiKey.length} chars)` : 'MISSING ❌');
console.log('MISTRAL_MODEL:', model || 'mistral-small-latest (default)');

if (!apiKey) {
  console.error('\n❌ FALLA DETECTADA: MISTRAL_API_KEY no está definida.');
  console.error('   Solución: Definir en .env.local o variables de entorno.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2: PREPARAR INPUT REALISTA
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📦 FASE 2: PREPARACIÓN DE INPUT');
console.log('─'.repeat(80));

const testInput: GenerateGithubFeedbackInput = {
  architecture: 75,
  testing: 62,
  security: 68,
  maintainability: 71,
  documentation: 45,
  overall: 67,
  topWeaknesses: [
    'Cobertura de tests limitada en archivos core',
    'Falta documentación inline en funciones complejas',
    'Acoplamiento alto en algunos módulos',
  ],
};

console.log('Input preparado:');
console.log(JSON.stringify(testInput, null, 2));

// ─────────────────────────────────────────────────────────────────────────────
// FASE 3: MEDIR TAMAÑO DEL PROMPT
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📏 FASE 3: ANÁLISIS DEL PROMPT');
console.log('─'.repeat(80));

const promptTemplate = `Eres un Senior Tech Lead evaluador en NEXTAPE.
Interpreta las siguientes métricas técnicas numéricas ya evaluadas para un desarrollador (NO recibes ni analizas código fuente).

PUNTUACIONES TÉCNICAS (0 a 100):
- Arquitectura: ${testInput.architecture !== null ? `${testInput.architecture}/100` : 'No analizable (lenguaje no soportado por el parser actual)'}
- Testing y CI: ${testInput.testing}/100
- Seguridad / Patrones: ${testInput.security !== null ? `${testInput.security}/100` : 'No analizable'}
- Mantenibilidad: ${testInput.maintainability !== null ? `${testInput.maintainability}/100` : 'No analizable'}
- Documentación: ${testInput.documentation}/100
- Puntuación Global: ${testInput.overall}/100

PRINCIPALES DEBILIDADES DETECTADAS:
${testInput.topWeaknesses.map((w) => `- ${w}`).join('\n')}

INSTRUCCIONES DE RESPUESTA:
Genera un análisis técnico breve y constructivo en idioma español.
Responde ÚNICAMENTE con un objeto JSON válido con este formato exacto:

{
  "feedback": "2 a 3 líneas de resumen constructivo del perfil técnico basándote exclusivamente en estas métricas.",
  "strengths": ["Punto fuerte 1", "Punto fuerte 2"],
  "improvements": ["Área clave de mejora 1", "Área clave de mejora 2"]
}

REGLAS STRICTAS:
- Máximo 300 palabras (menos de 1000 tokens).
- Sé conciso, profesional y basado únicamente en los datos provistos.
- Sin fences de markdown extra si es posible, responde solo con el JSON.`;

const promptChars = promptTemplate.length;
const promptTokensEstimate = Math.ceil(promptChars / 4); // Estimación conservadora

console.log(`Prompt length: ${promptChars} caracteres`);
console.log(`Estimated tokens: ~${promptTokensEstimate} tokens`);
console.log(`Expected output: ~200-300 tokens (max 1000 requested)`);
console.log(`Total estimated: ~${promptTokensEstimate + 300} tokens`);

if (promptTokensEstimate > 4000) {
  console.warn('⚠️  ADVERTENCIA: Prompt excesivamente largo (>4000 tokens)');
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 4: LLAMAR A MISTRAL Y CAPTURAR TODA LA EVIDENCIA
// ─────────────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log('\n🚀 FASE 4: EJECUCIÓN DE MISTRAL');
  console.log('─'.repeat(80));

  let success = false;
  let errorDetected = false;
  let responseReceived = false;
  let parsedSuccessfully = false;
  let validationPassed = false;

  console.log('Llamando a generateGithubFeedback()...\n');

  const startTime = Date.now();

  try {
    const result = await generateGithubFeedback(testInput);
    const endTime = Date.now();
    const duration = endTime - startTime;

    responseReceived = true;

    console.log(`✅ Llamada completada en ${duration}ms`);
    console.log('\n📤 RESPUESTA RECIBIDA:');
    console.log('─'.repeat(80));

    if (result === null) {
      console.error('❌ FALLA DETECTADA: generateGithubFeedback() devolvió null');
      console.error('   Esto indica que:');
      console.error('   a) Mistral lanzó un error (revisar logs de consola arriba)');
      console.error('   b) La respuesta no contenía JSON válido');
      console.error('   c) La validación de schema falló');
      errorDetected = true;
    } else {
      parsedSuccessfully = true;
      console.log('✅ Respuesta parseada exitosamente:');
      console.log(JSON.stringify(result, null, 2));

      // Verificar estructura
      const hasAllFields = 
        typeof result.feedback === 'string' &&
        Array.isArray(result.strengths) &&
        Array.isArray(result.improvements);

      if (!hasAllFields) {
        console.error('\n❌ FALLA DETECTADA: Schema incompleto');
        console.error('   feedback:', typeof result.feedback);
        console.error('   strengths:', Array.isArray(result.strengths) ? 'array' : typeof result.strengths);
        console.error('   improvements:', Array.isArray(result.improvements) ? 'array' : typeof result.improvements);
        errorDetected = true;
      } else {
        validationPassed = true;
        success = true;

        console.log('\n✅ VALIDACIÓN DE SCHEMA: OK');
        console.log(`   - feedback: ${result.feedback.length} caracteres`);
        console.log(`   - strengths: ${result.strengths.length} items`);
        console.log(`   - improvements: ${result.improvements.length} items`);
      }
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    errorDetected = true;
    console.error(`\n❌ ERROR CAPTURADO después de ${duration}ms:`);
    console.error('─'.repeat(80));

    if (error instanceof Error) {
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('Unknown error type:', typeof error);
      console.error('Error value:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FASE 5: DIAGNÓSTICO Y CONCLUSIONES
  // ─────────────────────────────────────────────────────────────────────────────

  console.log('\n\n═'.repeat(80));
  console.log('📊 DIAGNÓSTICO FINAL');
  console.log('═'.repeat(80));

  console.log('\n🔍 PUNTO EXACTO DE FALLA:');

  if (success) {
    console.log('✅ ¡NO HAY FALLA! El flujo completo funciona correctamente.');
    console.log('   → A. Mistral fue llamado ✅');
    console.log('   → B. Request fue exitosa ✅');
    console.log('   → C. Respuesta HTTP OK ✅');
    console.log('   → D. Contenido JSON válido ✅');
    console.log('   → E. Parser extrajo JSON ✅');
    console.log('   → F. Validación de schema OK ✅');
    console.log('   → G. Persistence (no probado en este script)');
    console.log('   → H. Frontend (no probado en este script)');
  } else {
    if (!responseReceived) {
      console.log('❌ SITUACIÓN B: Mistral fue llamado pero la request falló');
      console.log('   Causas posibles:');
      console.log('   - API key inválida o expirada');
      console.log('   - Rate limit excedido (429)');
      console.log('   - Timeout de red (60s configurado)');
      console.log('   - Modelo inexistente o deprecado');
      console.log('   - Error en la configuración de Genkit');
    } else if (!parsedSuccessfully) {
      console.log('❌ SITUACIÓN E: Mistral respondió pero el parser falló');
      console.log('   Causas posibles:');
      console.log('   - Respuesta sin JSON válido');
      console.log('   - JSON con markdown fences que no se limpiaron');
      console.log('   - Respuesta vacía o texto plano');
    } else if (!validationPassed) {
      console.log('❌ SITUACIÓN F: Parser OK pero validación falló');
      console.log('   Causas posibles:');
      console.log('   - Schema incompleto (campos faltantes)');
      console.log('   - Tipos incorrectos');
      console.log('   - Zod rechazó la estructura');
    }
  }

  console.log('\n🎯 EVIDENCIA CAPTURADA:');
  console.log(`   - API Key: ${apiKey ? 'PRESENT' : 'MISSING'}`);
  console.log(`   - Modelo: ${model || 'default'}`);
  console.log(`   - Prompt: ${promptChars} chars (~${promptTokensEstimate} tokens)`);
  console.log(`   - Respuesta recibida: ${responseReceived ? 'YES' : 'NO'}`);
  console.log(`   - Parsing exitoso: ${parsedSuccessfully ? 'YES' : 'NO'}`);
  console.log(`   - Validación OK: ${validationPassed ? 'YES' : 'NO'}`);

  console.log('\n');
  console.log('═'.repeat(80));

  process.exit(success ? 0 : 1);
}

runTest().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
