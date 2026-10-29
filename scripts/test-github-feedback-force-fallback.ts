#!/usr/bin/env tsx
/**
 * Script de validación: prueba directa del fallback determinístico, llamando a
 * `generateDeterministicFeedback()` sin usar la API (es lo que recibe el usuario cuando fallan los
 * dos modelos de Groq).
 *
 * Antes este script solo imprimía resultados escritos a mano de una ejecución anterior; ahora corre
 * el fallback real sobre los perfiles de prueba compartidos y falla (exit 1) si algo no cuadra.
 * La misma lógica está cubierta en CI por `generate-github-feedback-flow.test.ts`.
 *
 * Ejecutar: npx tsx scripts/test-github-feedback-force-fallback.ts
 */

import './load-env';
import { generateDeterministicFeedback } from '@/ai/flows/generate-github-feedback-flow';
import { FEEDBACK_PROFILES } from './lib/github-feedback-profiles';

console.log('═'.repeat(80));
console.log('🧪 TEST DIRECTO DEL FALLBACK DETERMINÍSTICO');
console.log('═'.repeat(80));

let failures = 0;
for (const { name, input } of FEEDBACK_PROFILES) {
  const out = generateDeterministicFeedback(input);
  const problems = [
    out.source !== 'deterministic' && 'source no es "deterministic"',
    out.strengths.length === 0 && 'sin fortalezas',
    out.improvements.length === 0 && 'sin mejoras',
    out.improvements.length > 3 && 'más de 3 mejoras',
    !out.feedback && 'sin resumen',
  ].filter(Boolean);

  console.log(`\n${problems.length ? '❌' : '✅'} ${name} (overall ${input.overall})`);
  console.log(`   Resumen    : ${out.feedback}`);
  console.log(`   Fortalezas : ${out.strengths.join(' · ')}`);
  console.log(`   Mejoras    : ${out.improvements.join(' · ')}`);
  for (const p of problems) console.log(`   ⚠️  ${p}`);
  if (problems.length) failures++;
}

console.log('\n' + '═'.repeat(80));
console.log(failures ? `❌ ${failures} perfil(es) con problemas` : `✅ ${FEEDBACK_PROFILES.length}/${FEEDBACK_PROFILES.length} perfiles OK`);
process.exit(failures ? 1 : 0);
