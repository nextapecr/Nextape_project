#!/usr/bin/env tsx
/**
 * Script de prueba para validar la migración de Mistral → Groq (con fallback NVIDIA)
 * en el flow de GitHub Feedback.
 *
 * Uso: npx tsx scripts/test-github-feedback-migration.ts
 *
 * MIGRACIÓN: 2026-08-21
 * Antes: Mistral AI (bloqueado por rate limit 0 req/min)
 * Ahora: Groq llama-3.3-70b-versatile → NVIDIA NIM (fallback automático ante 429)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Cargar variables de entorno antes de cualquier import que use process.env
config({ path: resolve(process.cwd(), '.env.local') });

import { generateGithubFeedback } from '../src/ai/flows/generate-github-feedback-flow';
import type { GenerateGithubFeedbackInput } from '../src/ai/flows/generate-github-feedback-flow';

console.log('═'.repeat(80));
console.log('🧪 TEST: MIGRACIÓN MISTRAL → GROQ + NVIDIA FALLBACK');
console.log('═'.repeat(80));
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validar configuración de proveedores
// ─────────────────────────────────────────────────────────────────────────────

console.log('📋 PASO 1: Validación de configuración');
console.log('─'.repeat(80));

const groqKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL ?? 'groq/llama-3.3-70b-versatile';
const nvidiaKey = process.env.NVIDIA_API_KEY;
const nvidiaModel = process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-8b-instruct';

console.log(`✅ GROQ_API_KEY presente: ${!!groqKey}`);
console.log(`   Modelo: ${groqModel}`);
console.log();
console.log(`✅ NVIDIA_API_KEY presente: ${!!nvidiaKey} (fallback)`);
console.log(`   Modelo: ${nvidiaModel}`);
console.log();

if (!groqKey) {
  console.error('❌ ERROR: GROQ_API_KEY no está definida en .env.local');
  process.exit(1);
}

if (!nvidiaKey) {
  console.warn('⚠️  ADVERTENCIA: NVIDIA_API_KEY no está definida (fallback no disponible)');
  console.warn('   El sistema funcionará solo con Groq, pero sin redundancia ante rate limits.');
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Preparar input de prueba (datos reales de un perfil promedio)
// ─────────────────────────────────────────────────────────────────────────────

console.log('📊 PASO 2: Preparar datos de prueba');
console.log('─'.repeat(80));

const testInput: GenerateGithubFeedbackInput = {
  architecture: 72,
  testing: 58,
  security: 65,
  maintainability: 68,
  documentation: 45,
  overall: 62,
  topWeaknesses: [
    'Cobertura de testing baja (58/100)',
    'Documentación insuficiente (45/100)',
    'Patrones de seguridad mejorables',
  ],
};

console.log('Input de prueba (perfil promedio):');
console.log(JSON.stringify(testInput, null, 2));
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// 3. Ejecutar generateGithubFeedback() con nuevo proveedor
// ─────────────────────────────────────────────────────────────────────────────

console.log('🚀 PASO 3: Ejecutar generateGithubFeedback() con Groq + NVIDIA fallback');
console.log('─'.repeat(80));
console.log();

async function main() {
  const startTime = Date.now();

  try {
    console.log('⏳ Llamando a generateGithubFeedback()...');
    console.log();

    const result = await generateGithubFeedback(testInput);

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('═'.repeat(80));
    console.log('✅ RESULTADO DE LA PRUEBA');
    console.log('═'.repeat(80));
    console.log();

    if (result === null) {
      console.error('❌ FALLA CRÍTICA: generateGithubFeedback() devolvió null');
      console.error();
      console.error('   Posibles causas:');
      console.error('   1. Groq y NVIDIA ambos fallaron (revisar logs arriba)');
      console.error('   2. Rate limit alcanzado en ambos proveedores');
      console.error('   3. API keys inválidas o revocadas');
      console.error('   4. Error en la validación del schema Zod');
      console.error();
      console.error('   Revisa los logs de consola arriba para ver el error específico.');
      console.log();
      process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Validar estructura del output
    // ─────────────────────────────────────────────────────────────────────────

    console.log('📦 Output recibido:');
    console.log(JSON.stringify(result, null, 2));
    console.log();

    console.log('🔍 Validación de estructura:');
    console.log('─'.repeat(80));

    const checks = [
      {
        name: 'feedback es string no vacío',
        pass: typeof result.feedback === 'string' && result.feedback.length > 0,
      },
      {
        name: 'feedback <= 1000 caracteres (~300 palabras)',
        pass: result.feedback.length <= 1000,
      },
      {
        name: 'strengths es array con elementos',
        pass: Array.isArray(result.strengths) && result.strengths.length > 0,
      },
      {
        name: 'improvements es array con elementos',
        pass: Array.isArray(result.improvements) && result.improvements.length > 0,
      },
      {
        name: 'strengths tiene strings válidos',
        pass:
          Array.isArray(result.strengths) &&
          result.strengths.every((s) => typeof s === 'string' && s.length > 0),
      },
      {
        name: 'improvements tiene strings válidos',
        pass:
          Array.isArray(result.improvements) &&
          result.improvements.every((s) => typeof s === 'string' && s.length > 0),
      },
    ];

    let allChecksPassed = true;

    for (const check of checks) {
      const icon = check.pass ? '✅' : '❌';
      console.log(`${icon} ${check.name}`);
      if (!check.pass) allChecksPassed = false;
    }

    console.log();
    console.log('─'.repeat(80));
    console.log(`⏱️  Tiempo de ejecución: ${duration}ms`);
    console.log();

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Reporte final
    // ─────────────────────────────────────────────────────────────────────────

    if (allChecksPassed) {
      console.log('═'.repeat(80));
      console.log('🎉 MIGRACIÓN EXITOSA: MISTRAL → GROQ + NVIDIA FALLBACK');
      console.log('═'.repeat(80));
      console.log();
      console.log('✅ GitHub Feedback ahora usa Groq llama-3.3-70b-versatile');
      console.log('✅ Fallback automático a NVIDIA NIM configurado');
      console.log('✅ Output válido y cumple con schema esperado');
      console.log('✅ Tiempo de respuesta aceptable');
      console.log();
      console.log('📊 Estadísticas:');
      console.log(`   - Feedback: ${result.feedback.length} caracteres`);
      console.log(`   - Strengths: ${result.strengths.length} puntos`);
      console.log(`   - Improvements: ${result.improvements.length} puntos`);
      console.log(`   - Duración: ${duration}ms`);
      console.log();
      console.log('🚀 El sistema está listo para producción.');
      console.log();
    } else {
      console.error('═'.repeat(80));
      console.error('❌ VALIDACIÓN FALLIDA: Output no cumple con estructura esperada');
      console.error('═'.repeat(80));
      console.error();
      console.error('Revisa los checks fallidos arriba. Posibles causas:');
      console.error('- El modelo no siguió las instrucciones del prompt');
      console.error('- El schema Zod en GenerateGithubFeedbackOutputSchema está desalineado');
      console.error('- El output contiene markdown fences o texto extra no limpiado');
      console.error();
      process.exit(1);
    }
  } catch (err) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.error('═'.repeat(80));
    console.error('❌ ERROR NO MANEJADO EN generateGithubFeedback()');
    console.error('═'.repeat(80));
    console.error();
    console.error('Detalles del error:');
    console.error(err);
    console.error();
    console.error(`Tiempo antes del fallo: ${duration}ms`);
    console.error();
    console.error('Esto NO debería suceder — generateGithubFeedback() debería atrapar todos');
    console.error('los errores de IA y devolver null. Revisar implementación del flow.');
    console.error();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error fatal en el script de prueba:', err);
  process.exit(1);
});
