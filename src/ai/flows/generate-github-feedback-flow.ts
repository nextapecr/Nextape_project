/**
 * @fileOverview Flow de Interpretación Humana con Groq AI (fallback NVIDIA NIM).
 *
 * REGLA DE ORO DE ARQUITECTURA: La IA NUNCA recibe código fuente ni AST.
 * Solo interpreta métricas numéricas ya calculadas por el motor determinístico (Capa 2).
 * Presupuesto de output: menos de 1000 tokens.
 *
 * MIGRACIÓN: 2026-08-21
 * Antes: Mistral AI (bloqueado por rate limit 0 req/min)
 * Ahora: Groq llama-3.3-70b-versatile → NVIDIA NIM (fallback automático ante 429)
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
});

export type GenerateGithubFeedbackInput = z.infer<typeof GenerateGithubFeedbackInputSchema>;
export type GenerateGithubFeedbackOutput = z.infer<typeof GenerateGithubFeedbackOutputSchema>;

export async function generateGithubFeedback(
  input: GenerateGithubFeedbackInput,
): Promise<GenerateGithubFeedbackOutput | null> {
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
    const { data, model } = await generateJsonWithFallback(
      prompt,
      GenerateGithubFeedbackOutputSchema,
    );

    console.log(`[generateGithubFeedback] ✅ Generado con modelo: Groq ${model.toUpperCase()}`);
    return data;
  } catch (err) {
    // Sin lectura de IA se devuelve null. Antes se devolvía un texto fijo ("Destacan áreas de
    // oportunidad en testing...") que la UI mostraba como si fuera la interpretación del
    // evaluador: un dato inventado presentado como análisis. Groq con cuota agotada (429)
    // o error de configuración bastaba para que TODO perfil recibiera ese mismo texto.
    console.error(
      '[generateGithubFeedback] ❌ Ambos modelos (Groq 70B + 8B) fallaron, se omite la lectura:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
