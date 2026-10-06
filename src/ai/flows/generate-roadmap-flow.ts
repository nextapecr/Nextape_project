'use server';
/**
 * @fileOverview Generador de Roadmaps personalizados basados en el Skill DNA (proveedor: Groq / Llama).
 *
 * @deprecated Este flow de IA queda DEPRECADO para el Roadmap principal.
 * NEXTAPE ha migrado a un sistema de Roadmap 100% determinístico basado en grafos de habilidades,
 * catálogo curado (skill_catalog), rutas de progresión (roadmap_routes) y ordenamiento topológico.
 * Ver `src/lib/roadmap-engine.ts`, `src/types/roadmap.types.ts` y `docs/ROADMAP_DETERMINISTIC.md`.
 * No borrar este archivo todavía por si se reintroduce IA en V2 exclusivamente para resúmenes o explicaciones.
 *
 * targetRole usa la taxonomía canónica `TargetRole` de role-weights.ts, compartida con el
 * GitHub Evaluation Engine.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { generateJsonWithFallback } from '@/ai/generate';
import { TARGET_ROLES, type TargetRole } from '@/services/github-engine/role-mapping/role-weights';

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
type Priority = (typeof PRIORITIES)[number];

// Esquema de salida ESTRICTO (tipo canónico que consume la página de Roadmap).
const RoadmapStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  estimatedHours: z.number(),
  priority: z.enum(PRIORITIES),
  resources: z.array(z.string()),
});

const GenerateRoadmapInputSchema = z.object({
  currentSkills: z.array(z.object({
    name: z.string(),
    score: z.number(),
  })),
  /** Rol técnico objetivo — debe coincidir con la taxonomía TargetRole del GitHub Engine. */
  targetRole: z.enum(TARGET_ROLES),
  gaps: z.array(z.string()),
});

const GenerateRoadmapOutputSchema = z.object({
  steps: z.array(RoadmapStepSchema),
  summary: z.string(),
});

export type GenerateRoadmapInput = z.infer<typeof GenerateRoadmapInputSchema>;
export type GenerateRoadmapOutput = z.infer<typeof GenerateRoadmapOutputSchema>;

export async function generateRoadmap(input: GenerateRoadmapInput): Promise<GenerateRoadmapOutput> {
  return generateRoadmapFlow(input);
}

// Esquema TOLERANTE para la salida del modelo (priority como string libre; resources opcional).
const LenientStep = z.object({
  title: z.string(),
  description: z.string(),
  estimatedHours: z.coerce.number(),
  priority: z.string(),
  resources: z.array(z.string()).optional(),
});
const LenientRoadmap = z.object({
  steps: z.array(LenientStep),
  summary: z.string(),
});

function normalizePriority(value: string): Priority {
  return (PRIORITIES as readonly string[]).includes(value) ? (value as Priority) : 'medium';
}

/** Etiqueta legible del rol para el prompt (en español). */
const ROLE_LABELS: Record<TargetRole, string> = {
  frontend: 'Frontend Engineer',
  backend: 'Backend Engineer',
  fullstack: 'Fullstack Engineer',
  devops: 'DevOps Engineer',
  mobile: 'Mobile Engineer',
};

const generateRoadmapFlow = ai.defineFlow(
  {
    name: 'generateRoadmapFlow',
    inputSchema: GenerateRoadmapInputSchema,
    outputSchema: GenerateRoadmapOutputSchema,
  },
  async (input) => {
    const roleLabel = ROLE_LABELS[input.targetRole];
    const skillsList =
      input.currentSkills.map((s) => `- ${s.name}: ${s.score}%`).join('\n') || '- (sin datos aún)';
    const gapsList = input.gaps.map((g) => `- ${g}`).join('\n') || '- (ninguna)';

    const prompt = `Eres un mentor técnico de NEXTAPE. Genera un roadmap de aprendizaje personalizado para un developer que aspira a ${roleLabel}.

Responde ÚNICAMENTE con un objeto JSON válido. Sin markdown, sin texto adicional, solo JSON.

Habilidades actuales:
${skillsList}

Brechas detectadas:
${gapsList}

Estructura EXACTA del JSON:
{
  "steps": [
    {
      "title": "título del paso",
      "description": "qué hacer y por qué, con profundidad técnica",
      "estimatedHours": 20,
      "priority": "high",
      "resources": ["tema o recurso 1", "tema o recurso 2"]
    }
  ],
  "summary": "resumen breve del plan"
}

REGLAS:
- Genera EXACTAMENTE 4 pasos concretos, ordenados por impacto.
- "priority": uno de low, medium, high o critical.
- "estimatedHours": número (horas estimadas).
- Enfócate en profundidad técnica real para alcanzar el rol de ${roleLabel}.

Responde solo con el JSON.`;

    const { data: parsed, model } = await generateJsonWithFallback(prompt, LenientRoadmap);
    console.log(`[generateRoadmapFlow] Generado con modelo: Groq ${model.toUpperCase()}`);

    const steps = parsed.steps.map((s) => ({
      title: s.title,
      description: s.description,
      estimatedHours: s.estimatedHours,
      priority: normalizePriority(s.priority),
      resources: s.resources ?? [],
    }));

    return { steps, summary: parsed.summary };
  }
);
