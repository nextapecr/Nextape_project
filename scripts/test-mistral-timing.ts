#!/usr/bin/env tsx
/**
 * Test para verificar si el problema es timing/múltiples requests.
 * Vamos a esperar 10 segundos antes de hacer la primera request.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const apiKey = process.env.MISTRAL_API_KEY;
const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';

console.log('═'.repeat(80));
console.log('⏱️  TEST DE TIMING - MISTRAL API');
console.log('═'.repeat(80));

console.log('\n📋 Esperando 10 segundos para asegurar que no hay rate limit activo...');

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWithDelay() {
  await sleep(10000);
  
  console.log('✅ 10 segundos transcurridos. Haciendo request...\n');
  
  const testPrompt = 'Di "Hola" en JSON: {"mensaje": "Hola"}';
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: testPrompt }],
        max_tokens: 50,
      }),
    });

    console.log('Status:', response.status, response.statusText);
    
    // Mostrar rate limit headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().includes('ratelimit') || key.toLowerCase().includes('limit')) {
        headers[key] = value;
      }
    });
    
    if (Object.keys(headers).length > 0) {
      console.log('\n📊 RATE LIMIT HEADERS:');
      Object.entries(headers).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    } else {
      console.log('\n⚠️  No se encontraron headers de rate limit');
    }
    
    const body = await response.text();
    
    if (response.ok) {
      console.log('\n✅ ¡ÉXITO! La API respondió correctamente.');
      const data = JSON.parse(body);
      console.log('Contenido:', data.choices?.[0]?.message?.content);
      console.log('\nUsage:', data.usage);
    } else {
      console.log('\n❌ Falló con', response.status);
      console.log('Body:', body);
      
      if (response.status === 429) {
        console.log('\n🔴 CONCLUSIÓN: El rate limit persiste incluso después de 10 segundos.');
        console.log('Posibles causas:');
        console.log('1. Múltiples requests previas agotaron el límite');
        console.log('2. El rate limit se resetea cada hora/mes, no por tiempo de inactividad');
        console.log('3. La cuenta está en un estado de rate limit prolongado');
        console.log('\n💡 RECOMENDACIÓN: Revisar dashboard de Mistral:');
        console.log('   https://console.mistral.ai/');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testWithDelay().then(() => {
  console.log('\n' + '═'.repeat(80));
  console.log('Test completado');
  console.log('═'.repeat(80));
});
