#!/usr/bin/env tsx
/**
 * Test directo de la API de Mistral sin Genkit para diagnosticar el 429.
 * Vamos a hacer una llamada HTTP directa para ver el error real.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

console.log('═'.repeat(80));
console.log('🔍 TEST DIRECTO DE MISTRAL API (sin Genkit)');
console.log('═'.repeat(80));

const apiKey = process.env.MISTRAL_API_KEY;
const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';

console.log('\n📋 CONFIGURACIÓN:');
console.log('API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING');
console.log('Model:', model);

if (!apiKey) {
  console.error('❌ MISTRAL_API_KEY no está definida');
  process.exit(1);
}

const testPrompt = `Eres un evaluador técnico. Responde con JSON:
{
  "feedback": "Desarrollador con buen nivel técnico overall.",
  "strengths": ["Testing sólido", "Buena arquitectura"],
  "improvements": ["Mejorar documentación"]
}`;

console.log('\n🚀 Llamando a Mistral API directamente...');
console.log('Endpoint:', 'https://api.mistral.ai/v1/chat/completions');
console.log('Prompt length:', testPrompt.length, 'chars\n');

async function testMistralDirect() {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: testPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const duration = Date.now() - startTime;
    
    console.log('📤 RESPUESTA RECIBIDA:');
    console.log('─'.repeat(80));
    console.log('Status:', response.status, response.statusText);
    console.log('Duration:', duration, 'ms');
    console.log('\n📋 HEADERS:');
    
    // Mostrar headers relevantes
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    console.log('Content-Type:', headers['content-type']);
    console.log('X-Request-Id:', headers['x-request-id'] || 'N/A');
    
    // Headers de rate limiting
    if (headers['x-ratelimit-limit-requests']) {
      console.log('\n🔢 RATE LIMIT INFO:');
      console.log('Limit (requests):', headers['x-ratelimit-limit-requests']);
      console.log('Remaining:', headers['x-ratelimit-remaining-requests']);
      console.log('Reset:', headers['x-ratelimit-reset-requests']);
    }
    
    if (headers['x-ratelimit-limit-tokens']) {
      console.log('Limit (tokens):', headers['x-ratelimit-limit-tokens']);
      console.log('Remaining (tokens):', headers['x-ratelimit-remaining-tokens']);
      console.log('Reset (tokens):', headers['x-ratelimit-reset-tokens']);
    }

    const responseText = await response.text();
    
    if (!response.ok) {
      console.log('\n❌ ERROR RESPONSE:');
      console.log('─'.repeat(80));
      console.log('Status:', response.status);
      console.log('Body:', responseText || '(vacío)');
      
      // Intentar parsear como JSON
      try {
        const errorJson = JSON.parse(responseText);
        console.log('\n📄 ERROR DETALLADO:');
        console.log(JSON.stringify(errorJson, null, 2));
      } catch {
        console.log('(El body no es JSON válido)');
      }
      
      // Análisis específico del 429
      if (response.status === 429) {
        console.log('\n🔴 ANÁLISIS DEL 429:');
        console.log('─'.repeat(80));
        
        if (responseText.includes('quota') || responseText.includes('credit')) {
          console.log('❌ CAUSA: Cuota de créditos agotada');
          console.log('   - Plan free: $10/mes en API credits');
          console.log('   - Revisar dashboard: https://console.mistral.ai/');
        } else if (responseText.includes('rate limit') || responseText.includes('too many')) {
          console.log('❌ CAUSA: Rate limit por tiempo (requests/min)');
          console.log('   - Esperar 1 minuto e intentar de nuevo');
        } else {
          console.log('❌ CAUSA: Desconocida (revisar body arriba)');
        }
      }
      
      return false;
    }

    console.log('\n✅ ÉXITO:');
    console.log('─'.repeat(80));
    
    try {
      const data = JSON.parse(responseText);
      console.log('Response ID:', data.id);
      console.log('Model:', data.model);
      console.log('Usage:');
      console.log('  - Prompt tokens:', data.usage?.prompt_tokens);
      console.log('  - Completion tokens:', data.usage?.completion_tokens);
      console.log('  - Total tokens:', data.usage?.total_tokens);
      
      const content = data.choices?.[0]?.message?.content;
      console.log('\n📝 CONTENIDO GENERADO:');
      console.log(content);
      
      return true;
    } catch (parseError) {
      console.error('Error parseando respuesta exitosa:', parseError);
      console.log('Raw response:', responseText);
      return false;
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n❌ ERROR DE RED después de', duration, 'ms:');
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

testMistralDirect()
  .then((success) => {
    console.log('\n' + '═'.repeat(80));
    console.log(success ? '✅ TEST EXITOSO' : '❌ TEST FALLÓ');
    console.log('═'.repeat(80));
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
