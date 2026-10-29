#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Texto externo (respuesta de la API, argumentos) listo para el log: sin saltos de línea ni
 * caracteres de control, para que no pueda falsificar líneas del log (log injection), y acotado.
 */
function forLog(value: unknown, max = 300): string {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, max);
}

const modelToTest = process.argv[2] || 'gemma2-9b';

async function test() {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelToTest,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 10,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ ${forLog(modelToTest)}: ${response.status} - ${forLog(error)}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`✅ ${forLog(modelToTest)}: ${forLog(data.choices?.[0]?.message?.content)}`);
}

test().catch((err) => {
  console.error(`❌ ${forLog(err instanceof Error ? err.message : err)}`);
  process.exit(1);
});
