import { genkit } from 'genkit';
import { openAICompatible } from '@genkit-ai/compat-oai';

/**
 * Proveedor de IA: **Groq** via OpenAI-compatible API (`@genkit-ai/compat-oai`).
 * Se eligió por coste (Groq free tier con límites renovables) manteniendo Genkit como
 * capa de orquestación. El modelo está centralizado aquí y se puede sobreescribir con `GROQ_MODEL`.
 * La API key va en `GROQ_API_KEY` (secreto de servidor). Ver docs/BACKEND_AI.md.
 * 
 * NOTA: Los modelos Llama 3.3 70B y Llama 3.1 8B fueron movidos a tier Enterprise (agosto 2026).
 * Free tier ahora usa GPT-OSS (modelos open-source): 120B (primario) y 20B (fallback rápido).
 * 
 * Cambiamos de `genkitx-groq` a `@genkit-ai/compat-oai` porque el plugin comunitario no tiene
 * los modelos GPT-OSS registrados y la API de Groq es compatible con OpenAI.
 */
export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'groq/openai/gpt-oss-120b';

// Inicializar Groq con el plugin OpenAI-compatible
export const ai = genkit({
  plugins: [
    openAICompatible({
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 60000,
    }),
  ],
  model: GROQ_MODEL,
});
