#!/usr/bin/env tsx
/**
 * Script de diagnóstico para validar conectividad con Groq y NVIDIA.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

console.log('═'.repeat(80));
console.log('🔍 DIAGNÓSTICO DE PROVEEDORES AI');
console.log('═'.repeat(80));
console.log();

// Test 1: Groq
console.log('📡 Test 1: Groq API');
console.log('─'.repeat(80));

async function testGroq() {
  const { ai, GROQ_MODEL } = await import('../src/ai/genkit');
  
  console.log(`Modelo: ${GROQ_MODEL}`);
  console.log(`API Key presente: ${!!process.env.GROQ_API_KEY}`);
  console.log();
  
  try {
    console.log('⏳ Enviando request a Groq...');
    const response = await ai.generate({
      model: GROQ_MODEL,
      prompt: 'Responde únicamente con la palabra: OK',
    });
    
    console.log(`✅ Groq respondió: "${response.text}"`);
    console.log();
    return true;
  } catch (err: any) {
    console.error('❌ Groq falló:');
    console.error(`   Status: ${err.status || 'N/A'}`);
    console.error(`   Mensaje: ${err.message || err}`);
    console.log();
    return false;
  }
}

// Test 2: NVIDIA
console.log();
console.log('📡 Test 2: NVIDIA NIM API');
console.log('─'.repeat(80));

async function testNvidia() {
  const { aiBackup, NVIDIA_MODEL } = await import('../src/ai/genkit-nvidia');
  
  console.log(`Modelo: ${NVIDIA_MODEL}`);
  console.log(`API Key presente: ${!!process.env.NVIDIA_API_KEY}`);
  console.log();
  
  try {
    console.log('⏳ Enviando request a NVIDIA...');
    const response = await aiBackup().generate({
      model: `nvidia/${NVIDIA_MODEL}`,
      prompt: 'Responde únicamente con la palabra: OK',
    });
    
    console.log(`✅ NVIDIA respondió: "${response.text}"`);
    console.log();
    return true;
  } catch (err: any) {
    console.error('❌ NVIDIA falló:');
    console.error(`   Status: ${err.status || 'N/A'}`);
    console.error(`   Mensaje: ${err.message || err}`);
    console.log();
    return false;
  }
}

async function main() {
  const groqOk = await testGroq();
  const nvidiaOk = await testNvidia();
  
  console.log('═'.repeat(80));
  console.log('📊 RESUMEN');
  console.log('═'.repeat(80));
  console.log(`Groq: ${groqOk ? '✅ Funcional' : '❌ No disponible'}`);
  console.log(`NVIDIA: ${nvidiaOk ? '✅ Funcional' : '❌ No disponible'}`);
  console.log();
  
  if (!groqOk && !nvidiaOk) {
    console.error('❌ CRÍTICO: Ningún proveedor está disponible');
    process.exit(1);
  }
  
  if (!groqOk) {
    console.warn('⚠️  ADVERTENCIA: Groq no disponible, sistema dependerá solo de NVIDIA');
  }
  
  if (!nvidiaOk) {
    console.warn('⚠️  ADVERTENCIA: NVIDIA no disponible, sin fallback ante rate limits');
  }
  
  console.log('✅ Al menos un proveedor está funcional');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
