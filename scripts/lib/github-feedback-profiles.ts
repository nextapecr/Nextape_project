import type { GenerateGithubFeedbackInput } from "@/ai/flows/generate-github-feedback-flow";

/**
 * Perfiles técnicos de ejemplo para los scripts manuales del feedback de GitHub
 * (`test-github-feedback-*.ts`). Antes cada script tenía su propia copia.
 */
export const MID_LEVEL_NAME = "Perfil Mid-level - Balance";

export interface FeedbackProfile {
  name: string;
  input: GenerateGithubFeedbackInput;
}

export const FEEDBACK_PROFILES: FeedbackProfile[] = [
  {
    name: 'Perfil Senior - Alto rendimiento',
    input: {
      architecture: 85,
      testing: 90,
      security: 88,
      maintainability: 82,
      documentation: 75,
      overall: 85,
      topWeaknesses: ['Documentación técnica podría ampliarse', 'Cobertura de tests de integración'],
    },
  },
  {
    name: MID_LEVEL_NAME,
    input: {
      architecture: 65,
      testing: 70,
      security: 60,
      maintainability: 68,
      documentation: 55,
      overall: 64,
      topWeaknesses: ['Patrones de seguridad básicos', 'Tests unitarios insuficientes', 'Falta documentación de API'],
    },
  },
  {
    name: 'Perfil Junior - En desarrollo',
    input: {
      architecture: 45,
      testing: 35,
      security: 40,
      maintainability: 50,
      documentation: 30,
      overall: 40,
      topWeaknesses: ['Sin tests automatizados', 'Arquitectura monolítica sin separación', 'Código sin documentar'],
    },
  },
  {
    name: 'Perfil Frontend - Especializado',
    input: {
      architecture: null, // Lenguaje no soportado por parser
      testing: 80,
      security: null,
      maintainability: null,
      documentation: 85,
      overall: 83,
      topWeaknesses: ['Análisis estático limitado por lenguaje'],
    },
  },
  {
    name: 'Perfil Backend - Seguridad fuerte',
    input: {
      architecture: 75,
      testing: 65,
      security: 95,
      maintainability: 70,
      documentation: 60,
      overall: 73,
      topWeaknesses: ['Cobertura de tests podría mejorar', 'Documentación de APIs incompleta'],
    },
  },
];

/** Perfil por nombre (lanza si no existe, para que un typo en un script no pase en silencio). */
export function feedbackProfile(name: string): GenerateGithubFeedbackInput {
  const found = FEEDBACK_PROFILES.find((p) => p.name === name);
  if (!found) throw new Error(`Perfil de prueba desconocido: ${name}`);
  return found.input;
}
