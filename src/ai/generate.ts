import { z } from 'zod';
import { ai, GROQ_MODEL } from './genkit';

/**
 * Genera contenido con el modelo (Groq) y devuelve un objeto JSON **validado con Zod**.
 *
 * Los modelos tipo Llama a veces envuelven el JSON en fences de markdown o añaden texto;
 * por eso se limpia la respuesta y se valida el esquema, con un reintento ante JSON inválido.
 * (Este patrón es más robusto con Groq que el structured output nativo de Genkit.)
 */
export async function generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await ai.generate({ model: GROQ_MODEL, prompt });

    try {
      const cleaned = extractJson(response.text);
      return schema.parse(JSON.parse(cleaned));
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('La IA devolvió un JSON que no cumple el esquema esperado.');
}

/* ─────────────────── Fallback: Groq 120B → Groq 20B ─────────────────── */

/**
 * Detecta si un error es un rate limit (HTTP 429 o mensaje con "rate limit" / "RateLimitError").
 * Se usa para decidir si reintentar con el modelo de backup.
 */
export function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    if (typeof err === 'object' && err !== null) {
      const status = (err as Record<string, unknown>).status ?? (err as Record<string, unknown>).statusCode;
      if (status === 429) return true;
    }
    return false;
  }
  const msg = err.message.toLowerCase();
  if (
    msg.includes('rate limit') ||
    msg.includes('ratelimiterror') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('quota') ||
    msg.includes('tokens per') ||
    msg.includes('requests per') ||
    msg.includes('exceeded')
  ) {
    return true;
  }
  const status = (err as unknown as { status?: number; statusCode?: number }).status ??
    (err as unknown as { status?: number; statusCode?: number }).statusCode;
  if (status === 429) return true;
  const code = (err as unknown as { code?: number | string }).code;
  if (code === 429 || code === '429') return true;
  return false;
}

let isGroq120bUnavailable = false;

/**
 * Errores que no se arreglan reintentando: clave inválida/revocada (401/403) o modelo inexistente
 * o retirado (404/410). Ante ellos tiene sentido pasar al modelo de respaldo, igual que ante un
 * rate limit, y no tiene sentido repetir la misma llamada.
 */
export function isProviderUnavailableError(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; message?: string } | null;
  const status = e?.status ?? e?.statusCode;
  if (status === 401 || status === 403 || status === 404 || status === 410) return true;
  const msg = String(e?.message ?? err ?? '').toLowerCase();
  return (
    /\b(401|403|404|410)\b/.test(msg) ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('end of life') ||
    msg.includes('decommissioned') ||
    msg.includes('model_not_found') ||
    msg.includes('not found for account')
  );
}

/**
 * Genera JSON con Groq 120B (primario) y, si falla con rate limit, reintenta con Groq 20B (backup).
 *
 * Una vez detectado el rate limit en la corrida actual, las llamadas subsiguientes
 * cambian automáticamente a Groq 20B sin perder tiempo re-intentando 120B.
 *
 * Devuelve `{ data, model }` para que el llamador pueda loguear qué modelo se usó.
 */
export async function generateJsonWithFallback<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<{ data: T; model: '120b' | '20b' }> {
  // Modelos GPT-OSS (free tier, agosto 2026+)
  const MODEL_120B = 'groq/openai/gpt-oss-120b';
  const MODEL_20B = 'groq/openai/gpt-oss-20b';

  // Si ya sabemos que 120B no está disponible, usar 20B directamente
  if (isGroq120bUnavailable) {
    const data = await generateJsonWithModel(prompt, schema, MODEL_20B);
    return { data, model: '20b' };
  }

  try {
    const data = await generateJsonWithModel(prompt, schema, MODEL_120B);
    return { data, model: '120b' };
  } catch (err) {
    const rateLimited = isRateLimitError(err);
    if (!rateLimited && !isProviderUnavailableError(err)) throw err;

    isGroq120bUnavailable = true;
    console.warn(
      rateLimited
        ? '[ai/generate] ⚠️ Groq 120B rate limit alcanzado — cambiando a 20B para esta sesión...'
        : `[ai/generate] ⚠️ Groq 120B no disponible (${err instanceof Error ? err.message.slice(0, 120) : err}) — cambiando a 20B para esta sesión...`,
    );

    const data = await generateJsonWithModel(prompt, schema, MODEL_20B);
    return { data, model: '20b' };
  }
}

/**
 * Extrae el primer bloque JSON `{…}` de una respuesta de texto libre.
 *
 * Los modelos Llama suelen acompañar el JSON con texto narrativo:
 *   - "Here is the JSON:\n```json\n{…}\n```\nI hope this helps!"
 *   - Trailing commas, comentarios de línea (`//`), etc.
 *
 * La estrategia es:
 *   1. Quitar fences de markdown y texto fuera de `{…}`.
 *   2. Eliminar trailing commas antes de `}` o `]`.
 *   3. Eliminar comentarios de línea (`// …`).
 */
function extractJson(raw: string): string {
  // 1. Si hay un bloque ```json … ```, extraerlo.
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  const body = fenceMatch ? fenceMatch[1] : raw;

  // 2. Localizar el primer '{' y el último '}' (el objeto raíz).
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No se encontró un objeto JSON en la respuesta del modelo.');
  }

  let json = body.slice(start, end + 1);

  // 3. Quitar comentarios de bloque (/* … */) y de línea (// …).
  json = json.replace(/\/\*[\s\S]*?\*\//g, '');
  json = json.replace(/^\s*\/\/.*$/gm, '');

  // 4. Quitar trailing commas: `,` seguida de `}` o `]` (con espacios/saltos de línea opcionales).
  json = json.replace(/,\s*([}\]])/g, '$1');

  return json.trim();
}

/**
 * Genera JSON con un modelo específico de Groq. Versión robusta que tolera texto
 * narrativo, fences, trailing commas y comentarios que el modelo añade.
 */
async function generateJsonWithModel<T>(prompt: string, schema: z.ZodType<T>, model: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        console.warn(`[ai/generate] ⏳ Pausa de reintento (${attempt}/2) para ${model}...`);
        await new Promise((r) => setTimeout(r, 3000));
      }

      const response = await ai.generate({
        model,
        prompt,
      });
      const text = response.text;

      if (!text) {
        throw new Error(`El modelo ${model} no devolvió texto.`);
      }

      const cleaned = extractJson(text);
      return schema.parse(JSON.parse(cleaned));
    } catch (err) {
      console.warn(
        `[ai/generate] ⚠️ Intento ${attempt + 1} con ${model} falló:`,
        err instanceof Error ? err.message : err,
      );
      lastError = err;
      if (isProviderUnavailableError(err)) break; // clave o modelo inválidos: reintentar no ayuda
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${model} (backup) devolvió un error o JSON no válido tras 3 intentos.`);
}
