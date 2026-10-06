# NEXTAPE — Backend, Servicios e IA (Genkit)

> Fuente de verdad: `src/ai/*`, `src/services/*`, `src/lib/firebase/*`.

## 1. Arquitectura de backend

NEXTAPE tiene una **capa de confianza en servidor** sobre Firebase:

1. **Route handlers** (`src/app/api/*`, runtime Node) con el **Firebase Admin SDK**
   (`src/lib/firebase/admin.ts`): todo lo sensible (scoring, corrección, escritura de DNA/intentos,
   generación de pruebas). El Admin SDK bypassa las reglas; por eso los datos "verificados" son
   `write:false` para el cliente.
2. **Flows de Genkit** (`'use server'` en `src/ai/flows/*`): generación con Groq (Llama), invocados desde los handlers.
3. **Firebase gestionado** (Auth + Firestore + Storage): el cliente **LEE** con el Web SDK (sujeto a reglas)
   y llama a la API con `apiPost` (`src/lib/api.ts`) adjuntando su Firebase ID token.

### Route handlers (server-trust)
| Endpoint | Qué hace |
|---|---|
| `POST /api/line/start` | Sortea preguntas de un repertorio existente —`line_question_pools` (práctica) o `job_answer_keys` (vacante; si falta, lo compone desde el banco)—, crea `line_sessions` (server-only) y devuelve preguntas **sin clave** (`PublicQuestion`). Tamaño: 10 con GitHub analizado, 20 sin él, o `job.examQuestionCount` (10–30). Sin IA. |
| `POST /api/line/submit` | Corrige contra la clave de la sesión, escribe el DNA (`user_skill_scores`, mejor score/skill) y el intento (`assessment_attempts`) con Admin SDK, borra la sesión. Si la sesión tiene `jobId` (postulación a una vacante), además escribe/actualiza `candidate_matches/{userId_jobId}` e incrementa `jobs.applicantsCount` la primera vez (best-effort). |
| `POST /api/jobs/assessment` | (Reclutador dueño) compone el repertorio de la vacante desde el banco (`src/lib/server/job-pool.ts`, sin IA) en `job_answer_keys` (server-only); el doc `jobs` solo recibe `assessmentReady/PoolSize/MissingSkills`. 422 `no_bank_for_skills` si no llega a 10 preguntas. |
| `GET /api/line/catalog` | Qué tecnología × nivel tienen banco, y el tamaño de examen del usuario (`examSize`, `hasGithub`). Nunca devuelve preguntas. |
| `POST /api/github/repos` | Lista los repos propios de una cuenta (paginado) y marca los ya analizados con la versión actual del motor. |
| `POST /api/github/evaluate` | Analiza UN repositorio con el motor determinístico (sin IA) → `github_evidence/{uid}/repos/{owner__repo}`. Caché por commit. |
| `POST /api/github/aggregate` | Combina todos los repos analizados → `github_evidence/{uid}` + lectura de Mistral (nullable) + identidad verificada. |

Todos verifican el ID token con `verifyRequestUid` (Admin). Nunca confían en un `uid` del body.
`src/lib/server/assessment.ts` contiene la lógica pura (`gradeAnswers`, `stripAnswerKey`, `SPECIALTY_STACKS`).

## 2. Capa de IA — Genkit + Groq (Fallback Interno 120B → 20B)

### Configuración — `src/ai/genkit.ts`
```ts
import groq from 'genkitx-groq';
export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
export const ai = genkit({
  plugins: [groq({ apiKey: process.env.GROQ_API_KEY })],
  model: GROQ_MODEL,
});
```
- **Proveedor único:** Groq (plugin de comunidad `genkitx-groq`). Modelo por defecto `openai/gpt-oss-120b`,
  sobreescribible con `GROQ_MODEL`. Se eligió por **coste** (Groq free tier con límites renovables diariamente).
- API key en **`GROQ_API_KEY`** (secreto de servidor). En Netlify va como variable de entorno.
- **Cambio de modelos (agosto 2026):** Los modelos Llama 3.3 70B y Llama 3.1 8B fueron movidos a tier Enterprise
  (requieren contactar ventas). El sistema migró a GPT-OSS (modelos open-source): 120B (primario) y 20B (fallback).
- **Generación de JSON:** en vez del structured output nativo (poco fiable con LLMs grandes), se usa el helper
  `src/ai/generate.ts` → `generateJson(prompt, zodSchema)`: llama al modelo, limpia fences de markdown,
  `JSON.parse` y **valida con Zod** (con un reintento). Los flows usan un esquema *lenient* para tolerar
  variaciones del modelo y luego normalizan a los tipos estrictos.
- **Fallback interno de modelo (120B → 20B):** `generateJsonWithFallback` en `src/ai/generate.ts` implementa
  fallback automático dentro de Groq:
  - **Primario:** `openai/gpt-oss-120b` (250K TPM, mejor calidad)
  - **Fallback:** `openai/gpt-oss-20b` (250K TPM, 2x más rápido)
  - Los límites de Groq son **por modelo**, no compartidos: llegar al límite de 120B no afecta la cuota de 20B.
  - Capacidad combinada: **500K tokens/minuto** (250K + 250K).
  - Los errores no transitorios (401/403/404/410: clave inválida, modelo retirado) no se reintentan.

### ¿Por qué se eliminó NVIDIA?
- **Créditos no renovables:** NVIDIA free tier ofrece 5,000 créditos totales (no diarios). Un seeding completo
  (825 requests, 495k tokens) consumiría toda la cuota en 6-10 ejecuciones.
- **No apto para fallback continuo:** Después de agotar los créditos, el proveedor quedaría inutilizable
  permanentemente en el free tier, a diferencia de Groq que renueva límites por minuto.
- **Simplificación:** Un solo proveedor (Groq) con fallback interno entre sus modelos (120B→20B) reduce
  complejidad de configuración, manejo de errores y monitoreo de cuotas.

### Límites de Groq (Free Tier, por modelo)

| Modelo | Velocidad | Precio (por 1M tokens) | TPM | RPM | Uso |
|--------|-----------|------------------------|-----|-----|-----|
| `openai/gpt-oss-120b` | 500 T/sec | $0.15 input / $0.60 output | 250,000 | 1,000 | Primario (mejor calidad) |
| `openai/gpt-oss-20b` | 1000 T/sec | $0.075 input / $0.30 output | 250,000 | 1,000 | Fallback (2x más rápido) |

- **TPM (tokens por minuto):** 250K por modelo = 500K combinados. Más que suficiente para seeding y producción.
- **RPM (requests por minuto):** 1,000 RPM (33x más que Llama anterior). Seeding de 825 requests tarda <1 minuto.
- **Renovación:** Límites por minuto (no diarios), mucho más flexible que los modelos Llama anteriores.

### Dev server — `src/ai/dev.ts`
- Scripts: `genkit:dev` / `genkit:watch` (`genkit start -- tsx src/ai/dev.ts`).
- ✅ `dev.ts` registra los flows (import por efecto secundario) para el Genkit Dev UI.

### Flow: `generateQuestions` — `src/ai/flows/generate-assessment-flow.ts`
- **Input** (`GenerateQuestionsInputSchema`): `{ stack: string[], level: string, count=5 }`.
- **Output**: `{ questions: Question[] }`, `Question = { id, briefing, text, options[4], correctIndex 0-3, difficulty(enum junior|mid|senior|master), tag }`.
- **Prompt**: "Arquitecto Senior de NEXTAPE"; genera desafíos de producción (no sintaxis): fugas de
  memoria, cuellos de botella, seguridad, deuda técnica. 4 opciones, una óptima.
- Usado por: `The LINE` (`src/app/dashboard/line/page.tsx` y `src/app/line/page.tsx`) y por
  `JobService.generateJobAssessment`.

### Flow: `generateRoadmap` — `src/ai/flows/generate-roadmap-flow.ts` (⚠️ DEPRECADO)
- **Estado:** Deprecado para el Roadmap principal.
- **Razón:** El Roadmap ha migrado a una arquitectura 100% determinística (`src/lib/roadmap-engine.ts`) basada en grafos de dependencias, pesos por rol/ruta y ordenamiento topológico Kahn.
- **Input**: `{ currentSkills: {name, score}[], targetRole: TargetRole, gaps: string[] }`.
- **Output**: `{ steps: RoadmapStep[], summary }`.
- Se conserva en el codebase por si en V2 se reintroduce IA para generar explicaciones puntuales de temas, pero el flujo principal ya no lo invoca.
- **Prompt**: genera 4 pasos concretos hacia el rol objetivo según skills actuales y gaps.
- Usado por: página Roadmap (ver FRONTEND).

### Patrón de un flow (a replicar para nuevos)
```ts
'use server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
// 1) Esquemas Zod de input y output (output SIEMPRE tipado → structured output)
// 2) ai.definePrompt({ name, input:{schema}, output:{schema}, prompt: `...handlebars...` })
// 3) ai.defineFlow({ name, inputSchema, outputSchema }, async (input) => (await prompt(input)).output!)
// 4) export async function wrapper(input): Promise<Output> { return flow(input); }
```
- Se usa Handlebars en el prompt (`{{var}}`, `{{#each arr}}{{this}}{{/each}}`).
- El wrapper `export async function` es lo que consumen los componentes cliente (como server action).
- ⚠️ `output!` asume salida no nula; si el modelo devuelve vacío hará throw. Considerar manejo de error.

## 3. Capa de servicios — `src/services/*`

Wrappers finos sobre los helpers de Firestore y los flows de IA. **Punto de entrada preferente** para
la lógica de datos desde componentes.

> Los servicios de cliente son de **lectura**. Las escrituras de datos verificados (DNA, intentos,
> claves) ocurren en los route handlers `/api/*` con Admin SDK (§1).

| Servicio | Métodos | Colección / IA |
|---|---|---|
| `UserService` | `getUser`, `saveUser` | `users` |
| `SkillsService` | `getSkills` (solo lectura) | `user_skill_scores` |
| `JobService` | `getLatestJobs`, `getJob`, `getJobsByRecruiter`, `calculateMatch` | `jobs` |
| `AssessmentService` | `getSession` (solo lectura) | `assessment_attempts` |
| `CompatibilityService` | `getMatchesForRecruiter` | `candidate_matches` (escritor: `/api/line/submit`) |

`calculateMatch` es una función pura en `src/lib/match.ts` (reexportada por `JobService`).

### Escritura del DNA — server-only
- El DNA (`user_skill_scores`) y los intentos (`assessment_attempts`) los escribe **`/api/line/submit`**
  con Admin SDK: score por skill (mejor resultado, `Math.max`), `Timestamp` de servidor. El cliente no
  tiene métodos de escritura (reglas `write:false`). Ver SECURITY.

### `JobService.calculateMatch(jobSkills, userScores)`
- Normaliza skills a minúsculas, suma scores del usuario para las skills requeridas presentes,
  divide entre `jobSkills.length` (penaliza faltantes), redondea. Devuelve 0 si falta input.

### `JobService.generateJobAssessment(jobId, stack, level)`
- Llama `generateQuestions` (server action) → `updateDoc(jobs/{jobId}, { assessmentQuestions, updatedAt })`.
- ✅ Ya permitido: las reglas dejan al reclutador dueño (`createdBy == uid`) actualizar su `jobs` (B1).
- Captura el error y devuelve `[]` (silencioso). El `console.error` es la única señal.

## 4. Frontera cliente/servidor (importante)

- `src/ai/flows/*` → `'use server'` → ejecutan en el servidor de Next (seguro para la API key de Groq).
- `src/services/*` y `src/lib/firebase/*` → **cliente** (`'use client'` o sin marca, importan el Web SDK).
- Un componente cliente puede `import { generateQuestions } from '@/ai/flows/...'` y llamarlo: Next lo
  serializa como server action. **No** importar el Web SDK de Firebase dentro de un archivo `'use server'`.

## 5. Reglas para nuevos flows / servicios

- Todo flow: `'use server'`, esquemas Zod de input **y** output, wrapper `export async function`.
- No mezclar Firebase Web SDK con `'use server'`. Si un flow necesita escribir en Firestore de forma
  confiable, hacerlo con **Admin SDK** en una Cloud Function / route handler, no con el Web SDK del cliente.
- Nombrar el flow y el prompt de forma única (`name:`), coincidiendo con el nombre de archivo.
- Registrar el flow en `src/ai/dev.ts` (import por efecto secundario) para poder probarlo en Genkit Dev UI.
- Validar y manejar `output` nulo del modelo; no asumir `output!` en producción.

## 6. GitHub Evaluation Engine & Universal Parser (Multi-lenguaje)

- **Universal Parser:** `src/services/github-engine/parsers/universal-parser.ts` delega la resolución de gramáticas de los 20 lenguajes soportados a `@kreuzberg/tree-sitter-language-pack` vía `getLanguage(langKey)`.
- **Restricción de Runtime y Entorno:** Este módulo depende del binding nativo de `@kreuzberg/tree-sitter-language-pack`, que requiere Linux x64. La validación de ejecución real debe hacerse en Firebase Functions (producción) o WSL/Docker (desarrollo), nunca en Windows nativo.
- **Universal IR Builder:** `src/services/github-engine/ir/universal-ir-builder.ts` transforma el AST en una representación intermedia unificada `FileIR` de manera puramente declarativa mediante `Set<string>` para funciones, clases, imports y complejidad.

