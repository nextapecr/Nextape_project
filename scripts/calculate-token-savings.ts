#!/usr/bin/env tsx
/**
 * Calcula el ahorro de tokens al consolidar 5 llamadas en 1.
 */

// Prompt típico del flow actual (basado en el código real)
const basePrompt = `Eres un Arquitecto de Software Senior en NEXTAPE que evalúa a candidatos de élite.

Responde ÚNICAMENTE con un objeto JSON válido. Sin markdown, sin texto adicional, solo JSON.

Genera EXACTAMENTE 5 desafíos técnicos de nivel senior centrados en: React, TypeScript, Node.js.

Estructura EXACTA del JSON:
{
  "questions": [
    {
      "briefing": "contexto corto de un sistema en producción",
      "text": "enunciado del problema técnico específico",
      [SPEC_SHAPE],
      "difficulty": "senior",
      "tag": "una de las habilidades del stack, en minúsculas"
    }
  ]
}

REGLAS:
[SPEC_RULES]
- "difficulty": uno de junior, mid o senior (el más cercano al nivel "senior").
- "tag": DEBE ser EXACTAMENTE una de estas habilidades (en minúsculas): react, typescript, node.js. No inventes otras.
- NO preguntes sintaxis trivial. Plantea problemas reales: fugas de memoria, cuellos de botella,
  condiciones de carrera, seguridad, deuda técnica.
- Genera EXACTAMENTE 5 preguntas en el array "questions".

Responde solo con el JSON.`;

// Estimación simple: ~4 caracteres por token (estándar para GPT-style models)
const charsPerToken = 4;

// Calcular tokens del prompt base
const baseTokens = Math.ceil(basePrompt.length / charsPerToken);

console.log('═'.repeat(80));
console.log('🧮 CÁLCULO DE AHORRO: CONSOLIDACIÓN 5→1 LLAMADAS');
console.log('═'.repeat(80));
console.log();

console.log('📊 ARQUITECTURA ACTUAL:');
console.log(`   - Combinaciones (tech×level): 165`);
console.log(`   - Tipos de pregunta: 5`);
console.log(`   - Llamadas totales: 165 × 5 = 825`);
console.log();

console.log('📏 TAMAÑO DEL PROMPT:');
console.log(`   - Caracteres del prompt base: ${basePrompt.length.toLocaleString()}`);
console.log(`   - Tokens estimados por prompt: ~${baseTokens} tokens`);
console.log(`   - Nota: Esto es el prompt de sistema que se repite 5 veces`);
console.log();

console.log('💰 AHORRO CON CONSOLIDACIÓN:');
console.log();
console.log('   ANTES (5 llamadas separadas):');
const tokensBefore = baseTokens * 5 * 165; // prompt × 5 tipos × 165 combos
console.log(`   - Tokens de entrada totales: ${baseTokens} × 5 × 165 = ${tokensBefore.toLocaleString()} tokens`);
console.log();

console.log('   DESPUÉS (1 llamada consolidada):');
const tokensAfter = baseTokens * 165; // prompt × 1 × 165 combos
console.log(`   - Tokens de entrada totales: ${baseTokens} × 1 × 165 = ${tokensAfter.toLocaleString()} tokens`);
console.log();

const savings = tokensBefore - tokensAfter;
const savingsPercent = ((savings / tokensBefore) * 100).toFixed(1);
console.log(`   ✅ AHORRO: ${savings.toLocaleString()} tokens (${savingsPercent}%)`);
console.log();

console.log('⏱️  IMPACTO EN TIEMPO DE SEEDING:');
console.log();
const tpmLimit = 8000; // Límite real confirmado

console.log('   ANTES (arquitectura actual):');
const totalTokensBefore = 495000; // Medición previa del seeding completo
const timeBefore = Math.ceil(totalTokensBefore / tpmLimit);
console.log(`   - Tokens totales (in+out): ~${totalTokensBefore.toLocaleString()}`);
console.log(`   - Tiempo estimado: ~${timeBefore} minutos (${totalTokensBefore.toLocaleString()} ÷ ${tpmLimit} TPM)`);
console.log();

console.log('   DESPUÉS (con consolidación):');
// Solo reducimos tokens de ENTRADA (el prompt repetido)
// Los tokens de SALIDA no cambian (mismas 25 preguntas por combo)
const inputTokensBefore = Math.ceil(totalTokensBefore * 0.6); // ~60% input en LLMs típicos
const outputTokens = totalTokensBefore - inputTokensBefore;
const inputTokensAfter = inputTokensBefore - savings;
const totalTokensAfter = inputTokensAfter + outputTokens;
const timeAfter = Math.ceil(totalTokensAfter / tpmLimit);

console.log(`   - Tokens de entrada: ${inputTokensBefore.toLocaleString()} → ${inputTokensAfter.toLocaleString()} (-${savings.toLocaleString()})`);
console.log(`   - Tokens de salida: ${outputTokens.toLocaleString()} (sin cambio)`);
console.log(`   - Tokens totales: ${totalTokensAfter.toLocaleString()}`);
console.log(`   - Tiempo estimado: ~${timeAfter} minutos (${totalTokensAfter.toLocaleString()} ÷ ${tpmLimit} TPM)`);
console.log();

const timeSavings = timeBefore - timeAfter;
const timeSavingsPercent = ((timeSavings / timeBefore) * 100).toFixed(1);
console.log(`   ✅ REDUCCIÓN DE TIEMPO: ${timeSavings} minutos (${timeSavingsPercent}%)`);
console.log(`   ✅ NUEVO TIEMPO: ${timeAfter} minutos (vs ${timeBefore} min antes)`);
console.log();

console.log('🎯 CONCLUSIÓN:');
console.log(`   - Llamadas: 825 → 165 (80% menos)`);
console.log(`   - Tokens: ${totalTokensBefore.toLocaleString()} → ${totalTokensAfter.toLocaleString()} (${((1 - totalTokensAfter/totalTokensBefore) * 100).toFixed(1)}% menos)`);
console.log(`   - Tiempo: ${timeBefore} min → ${timeAfter} min (${timeSavingsPercent}% más rápido)`);
console.log();
