# Modelos de Groq: cuál se usa y cómo cambiarlo

> Fuente de verdad: `src/ai/generate.ts` (`generateJsonWithFallback`). Revisado: 2026-10-28.

## Resumen

Toda la IA de NEXTAPE pasa por **Groq** y por una sola función, `generateJsonWithFallback`:

- **Banco de preguntas de The LINE** — `npm run seed:questions` (script, nunca en tiempo de petición).
- **Feedback del análisis de GitHub** — `/api/github/aggregate` (recibe solo números, nunca código).
- **Roadmap por IA** — `generate-roadmap-flow.ts`, obsoleto; solo lo usa el Dev UI de Genkit.

| Papel | Modelo por defecto | Variable para cambiarlo |
|---|---|---|
| Primario | `openai/gpt-oss-120b` | `GROQ_TIMELINE_MODEL_PRIMARY` |
| Respaldo | `openai/gpt-oss-20b` | `GROQ_TIMELINE_MODEL_FALLBACK` |

Si los dos fallan, el feedback de GitHub cae a un **texto determinístico** sin IA (`source: "deterministic"`),
y la tarjeta de GitHub lo muestra distinto.

> Pese al nombre (`TIMELINE`), estas variables controlan **toda** la IA, no solo The LINE. Se mantiene el
> nombre para no romper los `.env.local` que ya las usan.
>
> `GROQ_MODEL` (en `src/ai/genkit.ts`) **no** cambia el modelo de estos flujos: solo afecta a `generateJson`,
> la función simple sin respaldo, que hoy ningún flujo usa.

## Cómo funciona el respaldo

1. Cada llamada va primero al modelo **primario**, con hasta 2 intentos.
2. Si responde con límite alcanzado (429), clave inválida (401/403) o modelo retirado (404/410), se pasa al
   **respaldo** y **todas las llamadas siguientes de ese proceso** van directo al respaldo, sin volver a
   probar el primario. El estado se reinicia cuando se reinicia el proceso (en Netlify, con cada arranque en
   frío de la función).
3. Cualquier otro error (JSON inválido tras los reintentos, error de red) se propaga; en el feedback de
   GitHub lo captura el respaldo determinístico.
4. El feedback de GitHub, además, tiene un **tope de 8 s** (`AI_FEEDBACK_TIMEOUT_MS`): si la IA tarda más, se
   usa el texto determinístico para responder antes del límite de la función de Netlify.

Las respuestas indican qué se usó: `model: "primary" | "fallback"`.

## Límites del plan gratuito de Groq

Según [la página de límites de Groq](https://console.groq.com/docs/rate-limits), consultada el 2026-10-14,
los dos modelos GPT-OSS tienen: **30 peticiones/min, 1 000/día, 8 000 tokens/min y 200 000 tokens/día**.
Los límites son **por modelo**, así que el respaldo tiene su propio cupo cuando el primario se agota.

Los límites cambian: antes de planificar una carga grande, revísalos en
[console.groq.com/settings/limits](https://console.groq.com/settings/limits) con la cuenta del proyecto.

## Cambiar de modelo

En `.env.local` (local) o en las variables de entorno de Netlify:

```bash
GROQ_TIMELINE_MODEL_PRIMARY=openai/gpt-oss-120b
GROQ_TIMELINE_MODEL_FALLBACK=openai/gpt-oss-20b
```

- Escribe el id **sin** el prefijo `groq/`: el código lo añade.
- El modelo tiene que ser **de chat que genere texto** y saber devolver JSON. Los modelos de moderación o
  clasificación (por ejemplo los `llama-prompt-guard`) no sirven: fallarían siempre.
- Antes de cambiarlo en producción, prueba en local con una sola combinación:
  `npm run seed:questions -- --only=react --levels=junior --limit=1 --dry-run` y luego sin `--dry-run` en un
  proyecto de Firestore de prueba.

## Precargar el banco de preguntas

```bash
npm run seed:questions -- --dry-run                     # plan y coste estimado, no escribe
npm run seed:questions -- --category=frontend --yes     # una tanda
npm run seed:questions -- --top-up --target=50 --yes    # amplía lo existente hasta ~50 por combinación
```

⚠️ Escribe en el Firestore configurado, normalmente **producción**. Comparte el cupo diario de Groq con el
feedback de GitHub de la página en vivo: mejor correrlo de noche. Ver `docs/CONTEXT.md` §3.1.

## Historial

- **2026-08:** Llama 3.3 70B y 3.1 8B salieron del plan gratuito → GPT-OSS 120B / 20B.
- **2026-08:** Mistral abandonado por sus límites (ver `docs/DECISIONS.md`).
- **2026-10:** NVIDIA NIM descartado (ver `docs/DECISIONS.md`). Modelos configurables por variable de entorno;
  tope de 8 s en el feedback de GitHub.
