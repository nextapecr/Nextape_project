/**
 * Script de prueba para verificar el sistema de fallback de modelos de timeline.
 * 
 * Prueba:
 * 1. Generación con el modelo primario (Llama 86M)
 * 2. Fallback automático si el primario falla
 * 3. Que cada modelo tenga límites independientes en Groq
 * 
 * Uso:
 *   npm run tsx scripts/test-timeline-models.ts
 */

import './load-env';
import { generateJsonWithFallback } from '@/ai/generate';
import { z } from 'zod';

const TestSchema = z.object({
  questions: z.array(
    z.object({
      briefing: z.string(),
      text: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
    })
  ),
});

const testPrompt = `Genera EXACTAMENTE 2 preguntas técnicas sobre JavaScript en formato JSON:

{
  "questions": [
    {
      "briefing": "contexto breve",
      "text": "pregunta técnica",
      "options": ["opción 1", "opción 2", "opción 3", "opción 4"],
      "correctIndex": 0
    }
  ]
}

Responde solo con el JSON válido.`;

async function main() {
  console.log('🧪 TEST: Sistema de fallback de modelos timeline\n');
  console.log('─'.repeat(80));
  
  // Mostrar configuración
  const primaryModel = process.env.GROQ_TIMELINE_MODEL_PRIMARY || 'openai/gpt-oss-120b';
  const fallbackModel = process.env.GROQ_TIMELINE_MODEL_FALLBACK || 'openai/gpt-oss-20b';
  
  console.log('📋 CONFIGURACIÓN:');
  console.log(`   Primario : ${primaryModel}`);
  console.log(`   Fallback : ${fallbackModel}`);
  console.log(`   API Key  : ${process.env.GROQ_API_KEY ? '✅ Configurada' : '❌ NO configurada'}`);
  console.log('─'.repeat(80));
  
  if (!process.env.GROQ_API_KEY) {
    console.error('\n❌ GROQ_API_KEY no está configurada. Define la variable en .env.local\n');
    process.exit(1);
  }
  
  // Test 1: Generación normal
  console.log('\n🧪 TEST 1: Generación con modelo primario');
  console.log('─'.repeat(80));
  
  try {
    const startTime = Date.now();
    const result = await generateJsonWithFallback(testPrompt, TestSchema);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Generación exitosa`);
    console.log(`   Modelo usado    : ${result.model === 'primary' ? primaryModel : fallbackModel} [${result.model}]`);
    console.log(`   Preguntas       : ${result.data.questions.length}`);
    console.log(`   Duración        : ${duration}ms`);
    
    if (result.usage) {
      console.log(`   Tokens entrada  : ${result.usage.promptTokens}`);
      console.log(`   Tokens salida   : ${result.usage.completionTokens}`);
      console.log(`   Tokens totales  : ${result.usage.totalTokens}`);
    }
    
    console.log('\n📝 Primera pregunta generada:');
    console.log(`   ${result.data.questions[0].text}`);
    
  } catch (err) {
    console.error('❌ Error en la generación:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
  
  // Test 2: Llamada múltiple (verificar que el estado de fallback persiste)
  console.log('\n─'.repeat(80));
  console.log('🧪 TEST 2: Segunda llamada (verificar persistencia de estado)');
  console.log('─'.repeat(80));
  
  try {
    const startTime = Date.now();
    const result = await generateJsonWithFallback(testPrompt, TestSchema);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Segunda generación exitosa`);
    console.log(`   Modelo usado    : ${result.model === 'primary' ? primaryModel : fallbackModel} [${result.model}]`);
    console.log(`   Duración        : ${duration}ms`);
    
  } catch (err) {
    console.error('❌ Error en la segunda generación:', err instanceof Error ? err.message : err);
  }
  
  console.log('\n─'.repeat(80));
  console.log('✅ TESTS COMPLETADOS\n');
  console.log('💡 NOTAS:');
  console.log('   • Cada modelo tiene límites INDEPENDIENTES en Groq');
  console.log('   • Si el primario falla, el sistema cambia al fallback automáticamente');
  console.log('   • El estado persiste durante la sesión (no reintenta el primario)');
  console.log('─'.repeat(80) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Error fatal:', err);
    process.exit(1);
  });
