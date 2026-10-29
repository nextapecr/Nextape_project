#!/usr/bin/env tsx
/**
 * Script de diagnóstico para validar conectividad con Groq (GPT-OSS 120B y 20B).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

console.log('═'.repeat(80));
console.log('🧪 DIAGNÓSTICO: GROQ 120B → 20B FALLBACK (GPT-OSS)');
console.log('═'.repeat(80));
console.log();

/** Pide un "OK" a un modelo de Groq y dice si respondió. */
async function testModel(step: number, label: string, model: string): Promise<boolean> {
  const { ai } = await import('../src/ai/genkit');
  console.log(`📡 Test ${step}: Groq GPT-OSS ${label}`);
  console.log('─'.repeat(80));
  console.log(`Modelo: ${model}`);
  console.log(`API Key presente: ${!!process.env.GROQ_API_KEY}`);
  console.log();

  try {
    console.log(`⏳ Enviando request a Groq ${label}...`);
    const response = await ai.generate({ model, prompt: 'Responde únicamente con la palabra: OK' });
    console.log(`✅ Groq ${label} respondió: "${response.text}"`);
    console.log();
    return true;
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error(`❌ Groq ${label} falló:`);
    console.error(`   Status: ${e.status ?? 'N/A'}`);
    console.error(`   Mensaje: ${e.message ?? String(err)}`);
    console.error();
    return false;
  }
}

async function main() {
  const groq120bOk = await testModel(1, '120B', 'groq/openai/gpt-oss-120b');
  const groq20bOk = await testModel(2, '20B', 'groq/openai/gpt-oss-20b');
  
  console.log('═'.repeat(80));
  console.log('📊 RESULTADOS');
  console.log('═'.repeat(80));
  console.log(`Groq 120B: ${groq120bOk ? '✅ Funcional' : '❌ No disponible'}`);
  console.log(`Groq 20B: ${groq20bOk ? '✅ Funcional' : '❌ No disponible'}`);
  console.log();
  
  if (!groq120bOk && !groq20bOk) {
    console.error('❌ CRÍTICO: Ningún modelo Groq está disponible');
    console.error('   Regenera GROQ_API_KEY en console.groq.com/keys');
    process.exit(1);
  }
  
  if (!groq120bOk) {
    console.warn('⚠️  ADVERTENCIA: Groq 120B no disponible, sistema usará solo 20B');
  }
  
  if (!groq20bOk) {
    console.warn('⚠️  ADVERTENCIA: Groq 20B no disponible, sin fallback ante rate limits de 120B');
  }
  
  if (groq120bOk && groq20bOk) {
    console.log('✅ Sistema listo: Groq 120B como primario, 20B como fallback');
  }
  
  console.log();
}

main().catch((err) => {
  console.error('❌ Error crítico:', err);
  process.exit(1);
});
