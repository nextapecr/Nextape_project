#!/usr/bin/env tsx
/**
 * Script de diagnóstico para validar conectividad con Groq (70B y 8B).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

console.log('═'.repeat(80));
console.log('🧪 DIAGNÓSTICO: GROQ 120B → 20B FALLBACK (GPT-OSS)');
console.log('═'.repeat(80));
console.log();

// Test Groq 120B
console.log('📡 Test 1: Groq GPT-OSS 120B');
console.log('─'.repeat(80));

async function testGroq120b() {
  const { ai } = await import('../src/ai/genkit');
  
  const model = 'groq/openai/gpt-oss-120b';
  console.log(`Modelo: ${model}`);
  console.log(`API Key presente: ${!!process.env.GROQ_API_KEY}`);
  console.log();
  
  try {
    console.log('⏳ Enviando request a Groq 120B...');
    const response = await ai.generate({
      model,
      prompt: 'Responde únicamente con la palabra: OK',
    });
    
    console.log(`✅ Groq 120B respondió: "${response.text}"`);
    console.log();
    return true;
  } catch (err: any) {
    console.error('❌ Groq 120B falló:');
    console.error(`   Status: ${err.status || 'N/A'}`);
    console.error(`   Mensaje: ${err.message || err}`);
    console.error();
    return false;
  }
}

// Test Groq 20B
console.log();
console.log('📡 Test 2: Groq GPT-OSS 20B');
console.log('─'.repeat(80));

async function testGroq20b() {
  const { ai } = await import('../src/ai/genkit');
  
  const model = 'groq/openai/gpt-oss-20b';
  console.log(`Modelo: ${model}`);
  console.log(`API Key presente: ${!!process.env.GROQ_API_KEY}`);
  console.log();
  
  try {
    console.log('⏳ Enviando request a Groq 20B...');
    const response = await ai.generate({
      model,
      prompt: 'Responde únicamente con la palabra: OK',
    });
    
    console.log(`✅ Groq 20B respondió: "${response.text}"`);
    console.log();
    return true;
  } catch (err: any) {
    console.error('❌ Groq 20B falló:');
    console.error(`   Status: ${err.status || 'N/A'}`);
    console.error(`   Mensaje: ${err.message || err}`);
    console.error();
    return false;
  }
}

async function main() {
  const groq120bOk = await testGroq120b();
  const groq20bOk = await testGroq20b();
  
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
