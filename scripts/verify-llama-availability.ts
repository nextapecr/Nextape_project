#!/usr/bin/env tsx
/**
 * VERIFICACIÓN CRÍTICA: ¿Los modelos Llama siguen disponibles en free tier?
 * Prueba directa con HTTP (sin Genkit) a la API de Groq.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const apiKey = process.env.GROQ_API_KEY;

async function testModel(modelName: string) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🧪 PRUEBA DIRECTA: ${modelName}`);
  console.log('═'.repeat(80));

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'Responde únicamente con la palabra: OK' }],
        max_tokens: 10,
      }),
    });

    console.log(`\n📊 Status Code: ${response.status} ${response.statusText}`);
    console.log(`📊 Headers:`);
    console.log(`   - Content-Type: ${response.headers.get('content-type')}`);
    console.log(`   - x-ratelimit-limit-requests: ${response.headers.get('x-ratelimit-limit-requests')}`);
    console.log(`   - x-ratelimit-limit-tokens: ${response.headers.get('x-ratelimit-limit-tokens')}`);
    console.log(`   - x-ratelimit-remaining-requests: ${response.headers.get('x-ratelimit-remaining-requests')}`);
    console.log(`   - x-ratelimit-remaining-tokens: ${response.headers.get('x-ratelimit-remaining-tokens')}`);

    const data = await response.json();

    if (!response.ok) {
      console.log(`\n❌ ERROR:`);
      console.log(JSON.stringify(data, null, 2));
      return { available: false, error: data };
    }

    console.log(`\n✅ RESPUESTA EXITOSA:`);
    console.log(`   Modelo: ${data.model || modelName}`);
    console.log(`   Contenido: "${data.choices[0].message.content}"`);
    console.log(`   Tokens (prompt): ${data.usage?.prompt_tokens || 'N/A'}`);
    console.log(`   Tokens (completion): ${data.usage?.completion_tokens || 'N/A'}`);
    console.log(`   Tokens (total): ${data.usage?.total_tokens || 'N/A'}`);

    return { available: true, data };

  } catch (err: any) {
    console.log(`\n❌ EXCEPCIÓN:`);
    console.log(`   ${err.message || err}`);
    return { available: false, error: err.message };
  }
}

async function main() {
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY no definida');
    process.exit(1);
  }

  console.log('═'.repeat(80));
  console.log('🔍 VERIFICACIÓN: DISPONIBILIDAD DE MODELOS LLAMA EN FREE TIER');
  console.log('═'.repeat(80));
  console.log(`📅 Fecha de verificación: ${new Date().toISOString()}`);
  console.log(`🔑 API Key presente: ${!!apiKey} (${apiKey.substring(0, 10)}...)`);

  // Test modelos Llama (supuestamente movidos a Enterprise)
  const llama70b = await testModel('llama-3.3-70b-versatile');
  const llama8b = await testModel('llama-3.1-8b-instant');

  // Test modelos GPT-OSS (supuestamente disponibles en free tier)
  const gpt120b = await testModel('openai/gpt-oss-120b');
  const gpt20b = await testModel('openai/gpt-oss-20b');

  // Resumen
  console.log('\n' + '═'.repeat(80));
  console.log('📊 RESUMEN DE DISPONIBILIDAD');
  console.log('═'.repeat(80));
  console.log(`\n🦙 MODELOS LLAMA (supuestamente Enterprise):`);
  console.log(`   - llama-3.3-70b-versatile: ${llama70b.available ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'}`);
  console.log(`   - llama-3.1-8b-instant: ${llama8b.available ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'}`);
  console.log(`\n🤖 MODELOS GPT-OSS (free tier actual):`);
  console.log(`   - openai/gpt-oss-120b: ${gpt120b.available ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'}`);
  console.log(`   - openai/gpt-oss-20b: ${gpt20b.available ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'}`);

  console.log('\n' + '═'.repeat(80));
  console.log('🎯 CONCLUSIÓN');
  console.log('═'.repeat(80));

  if (llama70b.available && llama8b.available) {
    console.log('\n⚠️  PREMISA INCORRECTA DETECTADA:');
    console.log('   Los modelos Llama SÍ están disponibles en free tier.');
    console.log('   El cambio a GPT-OSS fue innecesario (aunque GPT-OSS también funciona).');
    console.log('\n💡 RECOMENDACIÓN:');
    console.log('   Evaluar si revertir a Llama (genkitx-groq) o mantener GPT-OSS (@genkit-ai/compat-oai).');
  } else if (gpt120b.available && gpt20b.available) {
    console.log('\n✅ PREMISA CORRECTA:');
    console.log('   Los modelos Llama NO están disponibles en free tier.');
    console.log('   El cambio a GPT-OSS fue necesario y correcto.');
  } else {
    console.log('\n🚨 PROBLEMA CRÍTICO:');
    console.log('   Ningún modelo está disponible. Verificar API key o cuenta Groq.');
  }

  console.log('\n');
}

main();
