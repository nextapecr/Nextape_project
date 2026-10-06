#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });

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
    console.error(`❌ ${modelToTest}: ${response.status} - ${error}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`✅ ${modelToTest}: ${data.choices[0].message.content}`);
}

test();
