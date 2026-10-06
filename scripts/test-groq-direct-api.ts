#!/usr/bin/env tsx
/**
 * Prueba directa a la API de Groq para verificar qué modelos están disponibles.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function listModels() {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY no definida');
    process.exit(1);
  }

  console.log('═'.repeat(80));
  console.log('🔍 LISTANDO MODELOS DISPONIBLES EN GROQ');
  console.log('═'.repeat(80));
  console.log();

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    console.log('✅ Modelos disponibles:');
    console.log();
    
    for (const model of data.data) {
      console.log(`  📦 ${model.id}`);
      if (model.owned_by) console.log(`     Owner: ${model.owned_by}`);
      console.log();
    }
    
    console.log('═'.repeat(80));
    console.log(`Total: ${data.data.length} modelos`);
    
  } catch (err: any) {
    console.error('❌ Error al listar modelos:');
    console.error(`   ${err.message || err}`);
    process.exit(1);
  }
}

listModels();
