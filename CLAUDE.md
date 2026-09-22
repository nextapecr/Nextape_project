# CLAUDE.md — NEXTAPE

Guía operativa para agentes de IA (Claude Code) y desarrolladores que trabajen en este repositorio.
Este archivo es **contexto de arranque**. La documentación profunda por área está en [`docs/`](./docs/README.md).

---

## 1. Qué es NEXTAPE (contexto)

Plataforma de **evaluación técnica con IA** que construye el "DNA técnico verificado" de desarrolladores.
Roles: `developer` y `recruiter`.
- **The LINE**: examen técnico **determinista**. Las preguntas se **precargan** con IA en
  `line_question_pools/{tech}_{nivel}` (`npm run seed:questions`); en runtime **NO se llama al modelo**,
  solo se sortean. 55 tecnologías × 3 niveles (`junior|mid|senior`), 5 tipos de pregunta.
  **Es la única fuente del DNA.**
- **CORE**: identidad técnica persistida (scores por skill) en Firestore.
- **GitHub**: analiza el código real de tus repos con **tree-sitter (AST)** y produce 5 dimensiones de
  ingeniería. **No escribe el DNA**: solo influye en el tamaño del examen y en el roadmap.
- **Roadmap**: motor **determinista, sin IA** (`src/lib/roadmap-engine.ts`) sobre `skill_catalog` +
  `roadmap_routes`. The LINE es obligatorio; GitHub es un proxy opcional que nunca penaliza.
- **Jobs / Compatibility**: match entre `job.requiredSkills` y el DNA del usuario.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Firebase (Auth/Firestore/Storage,
Web SDK + Admin SDK) · **tree-sitter** (`@kreuzberg/tree-sitter-language-pack`, 21 gramáticas) ·
Genkit 1.28 · Tailwind 3 + shadcn/ui.
**IA — tres proveedores:** **Groq** principal (`genkitx-groq`, `llama-3.3-70b-versatile`), **NVIDIA NIM**
como fallback ante 429, y **Mistral** para el feedback del análisis de GitHub.
Hosting: **Netlify** (Firebase solo Auth+DB). La config de Cloudflare/App Hosting que queda en el repo
está **muerta** — no la uses como referencia.

**Arquitectura en una frase:** monolito modular sobre Firebase (cliente) **+ una capa de confianza en
servidor** (route handlers `src/app/api/*` con Firebase Admin SDK) para todo lo sensible: scoring/DNA y
generación de pruebas. El cliente lee datos y llama a la API; **nunca** escribe datos "verificados".
→ Lee [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) y [`docs/BACKEND_AI.md`](./docs/BACKEND_AI.md) antes de cambios grandes.

---

## 2. Comandos

```bash
npm run dev          # Next dev (turbopack) en http://localhost:9002
npm run genkit:dev   # Genkit Dev UI (flows registrados en src/ai/dev.ts)
npm run build        # Build de producción (los errores de tipos BLOQUEAN)
npm run typecheck    # tsc --noEmit  ← EJECUTAR SIEMPRE tras cambios de TS
npm run lint         # eslint .      ← 0 errores requerido (warnings permitidos)
npm test             # vitest run    ← tests unitarios; los de reglas requieren emulador

# Datos (escriben en el Firestore configurado — normalmente PRODUCCIÓN; nada escribe sin --yes)
npm run inventory:pools   # SOLO LECTURA: qué bancos de preguntas existen y con cuántas preguntas
npm run seed:questions    # precarga el banco de The LINE (--dry-run / --only=<id> / --top-up / --yes)
npm run seed:catalog:full # catálogo del roadmap: 112 skills + 10 rutas
```
Antes de dar por terminado un cambio: `typecheck` + `lint` + `test` en verde (es lo que valida CI).

---

## 3. Estructura (mapa rápido)

```
src/app/            Rutas App Router. App = src/app/dashboard/*  |  API = src/app/api/* (server-trust)
src/app/api/        Route handlers (Node runtime, Admin SDK): line/{start,submit,catalog}, jobs/assessment, github/{repos,evaluate,aggregate}
src/components/     ui/ (shadcn) · auth/ (AuthGuard, AuthModal) · layout/ (DashboardShell)
src/services/       Capa de datos (LECTURA desde cliente): users, skills(read), jobs, assessments(read)
src/lib/firebase/   client.ts (Web SDK, cliente) · admin.ts (Admin SDK, SOLO servidor)
src/lib/            api.ts (apiPost con ID token) · match.ts · grading.ts · server/ (lógica server-only)
src/hooks/          use-auth-user (useAuthUser), use-toast, use-mobile
src/types/          Tipos canónicos *.types.ts (index.ts = barrel). PublicQuestion = sin correctIndex
src/ai/             genkit.ts + flows/ (generate-assessment, generate-roadmap) — 'use server'
docs/               Documentación del sistema (ver docs/README.md y CHANGELOG_FIXES.md)
firestore.rules · storage.rules   Seguridad — cambiar aquí toda regla de acceso
```

---

## 4. REGLAS ABSOLUTAS

Estas reglas son **vinculantes**. Si una tarea requiere romper una, **detente y coordínalo primero**.

### 4.1 Seguridad e integridad (lo más importante)
1. **La lógica de confianza vive en servidor.** El scoring, la validación de respuestas y la escritura
   del DNA (`user_skill_scores`) y de intentos ocurren SOLO en los route handlers `src/app/api/*` con el
   **Admin SDK** (`src/lib/firebase/admin.ts`). `user_skill_scores`/`assessment_attempts` son
   `write:false` para el cliente. **NUNCA** introduzcas una escritura de datos "verificados" desde el navegador.
2. **NUNCA envíes `correctIndex` (la respuesta correcta) al cliente.** Las preguntas al cliente son
   `PublicQuestion` (sin clave). Las claves viven en `line_sessions`/`job_answer_keys` (server-only) y se
   corrigen en servidor. Un flujo de evaluación nuevo sigue este patrón (start→session→submit→grade).
3. **Autentica los route handlers** verificando el ID token con `verifyRequestUid` (Admin). El cliente
   llama con `apiPost` (`src/lib/api.ts`), que adjunta el token. No confíes en un `uid` del body.
4. **Toda colección nueva DEBE tener su regla** en `firestore.rules` en el mismo cambio. Colecciones
   server-only → `allow read, write: if false` (el Admin SDK las bypassa).
5. **No relajes reglas de seguridad** (`if true`, `write:false → true`, lecturas públicas) sin revisión
   explícita. Ver [`docs/SECURITY.md`](./docs/SECURITY.md).
6. **Nunca commitees secretos.** Config web Firebase → `.env` (`NEXT_PUBLIC_*`); Gemini y credenciales
   del Admin SDK (`FIREBASE_SERVICE_ACCOUNT`) → secret manager. `.env*` está en `.gitignore`: mantenlo así.
7. **No confíes en el `role` del cliente** para autorización de datos; la autoridad son las reglas y el servidor.

### 4.2 Datos
7. **Firestore solo vía `src/services/*` o los helpers de `src/lib/firebase/firestore.ts`.** No uses el
   SDK crudo en componentes nuevos.
8. **Skills siempre en minúsculas y con su id canónico** (`canonicalSkillKey`, "Next.js" → `nextjs`) al leer/escribir scores o `requiredSkills`.
   Es una invariante del match. No la rompas.
9. **Timestamps con `Timestamp.now()`** de `firebase/firestore`, nunca `new Date()`.
10. **Al añadir/cambiar una colección o tipo:** actualiza tipo (`src/types/*.types.ts`), servicio,
    regla, y [`docs/DATABASE.md`](./docs/DATABASE.md).

### 4.3 IA / Genkit
11. **Flows en `src/ai/flows/`, siempre `'use server'`**, con esquemas Zod de **input y output**.
    Consúmelos vía el wrapper `export async function`.
12. **Nunca importes el Firebase Web SDK dentro de un archivo `'use server'`.** Si un flow necesita
    escribir datos de forma confiable, usa Admin SDK en servidor, no el Web SDK del cliente.
13. **Proveedores IA = Groq · NVIDIA NIM · Mistral.** Nunca Gemini ni Anthropic.
    - **Groq** es el principal (`genkitx-groq`, `GROQ_API_KEY`/`GROQ_MODEL`, centralizado en `src/ai/genkit.ts`).
    - **NVIDIA NIM** es el fallback automático ante 429 (`NVIDIA_API_KEY`/`NVIDIA_MODEL`).
    - **Mistral** solo genera el feedback del análisis de GitHub (`MISTRAL_API_KEY`/`MISTRAL_MODEL`), y
      **recibe únicamente números, nunca código**. No cambies eso.
    Genera JSON con `generateJson` (esquema tolerante → normalización → esquema estricto Zod).
    - ⚠️ **La IA NO se invoca en tiempo de petición.** El banco de preguntas se precarga con un script.
      Si una tecnología no tiene banco, la respuesta correcta es `503 pool_not_seeded` — **nunca** generar
      al vuelo en el handler.

### 4.4 Frontend
14. **Consume `src/services/*`**, reutiliza `components/ui/*` (shadcn) y las utilidades de marca
    (`brand-*`, `shadow-apple`, `rounded-[2.5rem]`). No reinventes componentes base.
15. **Rutas de app bajo `/dashboard`** (heredan `AuthGuard`). No crees rutas top-level nuevas.
    Si añades una entrada de navegación en `DashboardShell`, **crea también su página** (evita enlaces rotos).
16. **Espera el estado de Auth con `onAuthStateChanged`** antes de leer datos del usuario; no asumas
    `auth.currentUser`.

### 4.5 Calidad y proceso
17. **Ejecuta `npm run typecheck` (y `lint`) antes de dar por terminado** un cambio de código. El build
    ignora errores de tipos — tú no.
18. **No "arregles" deuda conocida como efecto colateral** de otra tarea sin acordarlo: consulta
    [`docs/TECH_DEBT.md`](./docs/TECH_DEBT.md). Al resolver un ítem de deuda, márcalo ahí.
19. **No borres/edites código de compañeros ni archivos que no creaste** sin confirmarlo. Este repo lo
    mantienen 3 personas.
20. **Mantén la doc sincronizada:** si cambias arquitectura, datos, seguridad, IA o frontend, actualiza
    el `.md` correspondiente en `docs/` en el mismo cambio.
21. **Idioma:** código y nombres en inglés; comentarios y documentación pueden ir en español (como el resto del repo).

---

## 5. Agentes especializados

En [`.claude/agents/`](./.claude/agents/) hay agentes por área. Úsalos (o delega en ellos) según la tarea:

| Agente | Cuándo |
|---|---|
| `frontend-engineer` | UI, rutas, componentes, estado, diseño. |
| `backend-ai-engineer` | Servicios, route handlers, flows de Genkit (Groq/NVIDIA/Mistral). |
| `database-architect` | Modelo de datos Firestore, colecciones, tipos, migraciones. |
| `security-auditor` | Reglas Firestore/Storage, auth, integridad, revisión de seguridad. |
| `ai-flow-reviewer` | Revisión de prompts/flows de IA (calidad, coste, structured output). |
| `code-reviewer` | Revisión general de PRs contra estas reglas y la deuda técnica. |

---

## 6. Estado actual (lee antes de prometer "listo para prod")

La rama viva es **`main`**. 👉 **Lee [`docs/CONTEXT.md`](./docs/CONTEXT.md)**: es el mapa del sistema y su
estado real (snapshot `main` @ `5e4beb7`, 2026-09-22). `thelineRAG` es hoy el mismo commit que `main`;
`fix/system-hardening` quedó 29 commits atrás.

Ya construido: capa de confianza en servidor (DNA/scoring), banco de preguntas precargado (5 tipos,
55 tecnologías), **motor de GitHub** (AST con tree-sitter, 21 lenguajes), **roadmap determinista v2**
(112 skills / 10 rutas), cierre del loop reclutador (`candidate_matches`), rate limiting y CI.

**Estado verificado:** `lint` 0 errores / 21 warnings · `test` 116 pasan, 8 *skipped* (los de reglas
necesitan el emulador y **CI no lo arranca**) · `typecheck` falla **solo en local** por dependencias
nativas no instaladas (`tree-sitter`, `@genkit-ai/compat-oai`); en CI pasa.

**Pendiente destacado** (detalle en [`docs/CONTEXT.md`](./docs/CONTEXT.md) §9 y [`docs/TECH_DEBT.md`](./docs/TECH_DEBT.md)):
- 🔴 **Los vocabularios de The LINE y del roadmap están desacoplados** (ids de tecnología vs. slugs del
  catálogo: solo coinciden 2 de 112). El roadmap apenas se alimenta del DNA real.
- 🔴 **`.env.example` no documenta `GITHUB_TOKEN`, `MISTRAL_API_KEY` ni `NVIDIA_API_KEY`**: un despliegue
  que la siga deja `/api/github/*` roto.
- 🟠 `jobs` valida campos server-only en `update` pero no en `create`; `/api/line/*` sin rate limit y
  `line_sessions` sin TTL.
