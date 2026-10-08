/**
 * @fileOverview Flow de Interpretación Humana con Groq AI (GPT-OSS 120B → 20B fallback).
 *
 * REGLA DE ORO DE ARQUITECTURA: La IA NUNCA recibe código fuente ni AST.
 * Solo interpreta métricas numéricas ya calculadas por el motor determinístico (Capa 2).
 * Presupuesto de output: ~400 tokens con reasoning_effort='low' para control de costos.
 *
 * ARQUITECTURA: 2026-12-XX
 * Modelo primario: openai/gpt-oss-120b (500 tok/s, 250K TPM, reasoning_effort='low')
 * Fallback automático: openai/gpt-oss-20b (1000 tok/s, 250K TPM) ante 429 o timeout
 * Fallback determinístico: Construye feedback estructurado desde skillScores cuando IA falla
 * 
 * HISTORIAL:
 * - 2026-08-21: Migrado desde Mistral AI (bloqueado por rate limit 0 req/min)
 * - 2026-12-XX: Actualizado a GPT-OSS con control de costos y fallback determinístico
 */

import { z } from 'zod';
import { generateJsonWithFallback } from '@/ai/generate';

export const GenerateGithubFeedbackInputSchema = z.object({
  architecture: z.number().nullable(),
  testing: z.number(),
  security: z.number().nullable(),
  maintainability: z.number().nullable(),
  documentation: z.number(),
  overall: z.number(),
  topWeaknesses: z.array(z.string()),
});

export const GenerateGithubFeedbackOutputSchema = z.object({
  feedback: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  source: z.enum(['ai', 'deterministic']).default('ai'),
});

export type GenerateGithubFeedbackInput = z.infer<typeof GenerateGithubFeedbackInputSchema>;
export type GenerateGithubFeedbackOutput = z.infer<typeof GenerateGithubFeedbackOutputSchema>;

/**
 * Genera feedback determinístico a partir de los scores numéricos cuando la IA falla.
 * Construye un análisis estructurado basado en las métricas calculadas.
 */
function generateDeterministicFeedback(input: GenerateGithubFeedbackInput): GenerateGithubFeedbackOutput {
  const { architecture, testing, security, maintainability, documentation, overall, topWeaknesses } = input;

  // Identificar áreas fuertes (score >= 70)
  const strengths: string[] = [];
  if (testing >= 70) strengths.push('Buenas prácticas de testing y CI detectadas');
  if (documentation >= 70) strengths.push('Documentación clara y completa en el repositorio');
  if (security !== null && security >= 70) strengths.push('Implementación sólida de patrones de seguridad');
  if (maintainability !== null && maintainability >= 70) strengths.push('Código estructurado y mantenible');
  if (architecture !== null && architecture >= 70) strengths.push('Arquitectura bien diseñada con bajo acoplamiento');

  // Si no hay fortalezas evidentes, mencionar el overall
  if (strengths.length === 0) {
    if (overall >= 50) {
      strengths.push('Fundamentos técnicos presentes en el código analizado');
    } else {
      strengths.push('Oportunidades de mejora identificadas en múltiples áreas');
    }
  }

  // Áreas de mejora: usar topWeaknesses calculadas por el motor
  const improvements = topWeaknesses.length > 0
    ? topWeaknesses.slice(0, 3) // Máximo 3 mejoras principales
    : ['Ampliar cobertura de tests y documentación técnica', 'Reforzar patrones de arquitectura y seguridad'];

  // Resumen basado en el overall
  let feedback: string;
  if (overall >= 75) {
    feedback = 'Perfil técnico sólido con buenas prácticas evidenciadas en el código. Las métricas muestran experiencia en múltiples áreas de desarrollo.';
  } else if (overall >= 50) {
    feedback = 'Fundamentos técnicos adecuados con oportunidades claras de crecimiento. Se identifican áreas específicas para fortalecer competencias.';
  } else {
    feedback = 'Perfil en desarrollo con potencial de mejora significativo. Se recomienda enfoque en las áreas prioritarias identificadas para fortalecer habilidades técnicas.';
  }

  return {
    feedback,
    strengths,
    improvements,
    source: 'deterministic',
  };
}

export async function generateGithubFeedback(
  input: GenerateGithubFeedbackInput,
): Promise<GenerateGithubFeedbackOutput> {
  const prompt = `Eres un Senior Tech Lead evaluador en NEXTAPE.
Interpreta las siguientes métricas técnicas numéricas ya evaluadas para un desarrollador (NO recibes ni analizas código fuente).

PUNTUACIONES TÉCNICAS (0 a 100):
- Arquitectura: ${input.architecture !== null ? `${input.architecture}/100` : 'No analizable (lenguaje no soportado por el parser actual)'}
- Testing y CI: ${input.testing}/100
- Seguridad / Patrones: ${input.security !== null ? `${input.security}/100` : 'No analizable'}
- Mantenibilidad: ${input.maintainability !== null ? `${input.maintainability}/100` : 'No analizable'}
- Documentación: ${input.documentation}/100
- Puntuación Global: ${input.overall}/100

PRINCIPALES DEBILIDADES DETECTADAS:
${input.topWeaknesses.map((w) => `- ${w}`).join('\n')}

INSTRUCCIONES DE RESPUESTA:
Genera un análisis técnico breve y constructivo en idioma español.
Responde ÚNICAMENTE con un objeto JSON válido con este formato exacto:

{
  "feedback": "2 a 3 líneas de resumen constructivo del perfil técnico basándote exclusivamente en estas métricas.",
  "strengths": ["Punto fuerte 1", "Punto fuerte 2"],
  "improvements": ["Área clave de mejora 1", "Área clave de mejora 2"]
}

REGLAS STRICTAS:
- Máximo 300 palabras (menos de 1000 tokens).
- Sé conciso, profesional y basado únicamente en los datos provistos.
- Sin fences de markdown extra si es posible, responde solo con el JSON.`;

  try {
    const { data, model, usage } = await generateJsonWithFallback(
      prompt,
      GenerateGithubFeedbackOutputSchema,
      {
        maxTokens: 400, // Control de costo: feedback conciso
        reasoningEffort: 'low', // Fuente: https://console.groq.com/docs/reasoning
        includeReasoning: false, // No necesitamos ver el proceso de razonamiento
      },
    );

    // Logging de métricas para medición de costos
    console.log(`[generateGithubFeedback] ✅ Generado con modelo: Groq ${model.toUpperCase()}`);
    if (usage) {
      console.log('[generateGithubFeedback] 📊 Token usage:', {
        model: model.toUpperCase(),
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        reasoningTokens: usage.reasoningTokens ?? 0,
        cachedTokens: usage.cachedTokens ?? 0,
        cacheHitRate: usage.cachedTokens
          ? `${((usage.cachedTokens / usage.promptTokens) * 100).toFixed(1)}%`
          : '0%',
      });
    }
    
    return { ...data, source: 'ai' };
  } catch (err) {
    // Fallback determinístico: cuando todos los modelos fallan (429, timeout, JSON inválido),
    // construimos un feedback estructurado a partir de los scores ya calculados.
    // Marcado con source: "deterministic" para que la UI pueda distinguirlo.
    console.error(
      '[generateGithubFeedback] ⚠️ Ambos modelos (Groq 120B + 20B) fallaron, activando fallback determinístico:',
      err instanceof Error ? err.message : err,
    );
    
    return generateDeterministicFeedback(input);
  }
}
