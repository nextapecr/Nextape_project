# NEXTAPE — Contexto del sistema (rama `main`)

> **Qué es este archivo.** El mapa del sistema y su **estado real**, hecho leyendo el código de `main`
> y ejecutando las verificaciones (no inferido de la documentación previa, que estaba desfasada).
> Es el contexto de arranque para trabajar con agentes: qué existe, cómo fluye, qué está roto y dónde
> encaja el trabajo nuevo.
>
> **Complementa, no reemplaza:** [`/CLAUDE.md`](../CLAUDE.md) son las reglas vinculantes;
> [`docs/README.md`](./README.md) indexa la documentación por área.
>
> **Snapshot:** `main` @ `5e4beb7` · analizado el **2026-09-22**.
> Sustituye al contexto anterior, que describía la rama `thelineRAG` @ `aa9e91a` (1-ago) y hoy es falso.

---

## 0. Lo primero que hay que saber

1. **`main` es la rama viva.** `thelineRAG` es hoy **el mismo commit** que `main`. `fix/system-hardening`
   quedó 29 commits atrás. El resto (`main-legacy`, `migration`, `develop`, `Dashboard`,
   `feat/mvp-core-modules`, `roadmap`, `feature/multi-language-support`) son históricas.
2. **No hay RAG.** Pese al nombre de la rama, no hay embeddings, vector store ni retrieval. Lo que sí
   existe es `TECHNOLOGY_SOURCES` (`src/lib/server/sources.ts`): una lista de URLs de referencia que se
   inyectan **como texto en el prompt**. El modelo no lee esas páginas, así que el campo `source` de una
   pregunta es una atribución suya, no una cita verificada. Por eso nunca se envía al cliente.
3. **La IA ya NO corre en tiempo de petición.** Las preguntas se **precargan** con un script y en runtime
   solo se sortean. Ver §3.1.
4. **Hay dos proveedores de IA**, no uno: Groq GPT-OSS (principal, 120B→20B fallback) para generación
   de preguntas y feedback de GitHub. Ver §6.
5. **El experimento de Cloudflare se abandonó.** El despliegue real es **Netlify**. Queda configuración
   muerta en el repo (§7).

---

## 1. El producto

Plataforma de **evaluación técnica** que construye el **"DNA técnico verificado"** de un desarrollador y
lo conecta con vacantes. Dos roles: `developer` y `recruiter`.

| Módulo | Qué hace | Ruta |
|---|---|---|
| **The LINE** | Examen técnico determinista por tecnología×nivel, o por vacante. **Única fuente del DNA.** | `/dashboard/line` |
| **CORE** | El DNA: score por skill, persistido. | `/dashboard/core` |
| **GitHub** | Analiza el código real de tus repos (AST) y produce 5 dimensiones de ingeniería. | `/dashboard/github` |
| **Roadmap** | Plan de progresión determinista hacia un rol/nivel. | `/dashboard/roadmap` |
| **Empleos / Compatibilidad** | Match entre `job.requiredSkills` y el DNA. | `/dashboard/jobs`, `/dashboard/compatibility` |
| **Vacantes / Candidatos** | El reclutador publica, se genera la prueba, y ve candidatos rankeados. | `/dashboard/vacancies`, `/dashboard/candidates` |

**Navegación por rol** (`DashboardShell.tsx`): *developer* ve Panel, The LINE, CORE, GitHub, Roadmap,
Empleos, Compatibilidad, Perfil. *Recruiter* ve Panel, Mis Vacantes, Publicar, Candidatos.

⚠️ `AuthGuard` comprueba **sesión, no rol**: un developer que escriba `/dashboard/candidates` a mano
renderiza la página. No ve datos ajenos (las reglas filtran por `recruiterId`), así que es un problema de
UX, no de seguridad.

---

## 2. Stack y arquitectura

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15.5** (App Router, RSC) + **React 19** |
| Lenguaje | TypeScript 5 (`strict`), alias `@/* → src/*` |
| UI | **shadcn/ui** (Radix + CVA) + **Tailwind CSS 3** · recharts |
| Auth/DB/Storage | **Firebase** Web SDK v11 (cliente) + **firebase-admin** (servidor) |
| Análisis de código | **tree-sitter** + `@kreuzberg/tree-sitter-language-pack` (21 gramáticas) |
| IA | **Genkit 1.28** — Groq GPT-OSS (120B/20B fallback) (§6) |
| Hosting | **Netlify** (`netlify.toml`, `@netlify/plugin-nextjs`, Node 22) |

### Patrón: monolito modular + capa de confianza en servidor

- El **cliente LEE** Firestore con el Web SDK, sujeto a `firestore.rules`.
- Todo lo sensible (corrección de exámenes, escritura del DNA, claves de respuesta, evidencia de GitHub)
  ocurre en **route handlers** `src/app/api/*` (runtime Node) con el **Admin SDK**, que bypassa las reglas.
  Por eso los datos verificados son `write: false` para el cliente.
- El cliente llama con `apiPost`/`apiGet` (`src/lib/api.ts`), que espera `authStateReady()` y adjunta el
  ID token; el servidor lo verifica con `verifyRequestUid` (`verifyIdToken(token, true)`, comprueba
  revocación). **Ningún handler confía en un `uid` del body.**

```
Browser (React 19)
  ├─ lectura directa de Firestore ───────────► firestore.rules
  └─ apiPost/apiGet + Bearer ID token ───────► /api/* (Node) ── Admin SDK ─► Firestore
                                                   ├─ tree-sitter (motor de GitHub)
                                                   └─ Genkit → Groq GPT-OSS
```

**Excepción consciente:** el **motor de roadmap corre en el CLIENTE** (`src/lib/roadmap-engine.ts`).
Está documentado y es aceptable porque **solo lee y calcula**: no escribe ningún dato verificado (el DNA
es `write:false` y los catálogos son inmutables desde cliente).

---

## 3. Los subsistemas

### 3.1 The LINE — evaluación

**Determinista y sin IA en tiempo de petición.** Las preguntas se precargan con `npm run seed:questions`
en `line_question_pools/{tech}_{level}`; en runtime solo se **sortean**.

**Esquema del repertorio:** `{key, kind, label, category, level, questions[] (CON clave), count,
status: complete|incomplete, byType, generator, updatedAt}`. Regla: `read, write: if false`.

**Catálogo:** **55 tecnologías** (`src/lib/technologies.ts`) en 10 categorías × **3 niveles**
(`junior|mid|senior`) + 3 stacks históricos = **174 combinaciones** (~4 350 preguntas, ~58 min de seed).
Alias → id canónico en `TECHNOLOGY_ALIASES` (40 entradas). Los `id` van **en minúsculas** (invariante del DNA).

Reparto por categoría: frontend 9 · backend 8 · **languages 9** · mobile 4 · databases 6 · cloud 3 ·
devops 5 · api 3 · testing 5 · architecture 3.

**Los 5 tipos de pregunta** (`src/types/question.types.ts`):

| Tipo | Por banco | Clave (server-only) | Corrección |
|---|---|---|---|
| `multiple_choice` | 8 | `correctIndex` | acierto / fallo |
| `true_false` | 5 | `correct: boolean` | acierto / fallo |
| `multi_select` | 4 | `correctIndexes[]` | **crédito parcial**: `max(0,(aciertos−fallos)/correctas)` |
| `ordering` | 4 | `correctOrder[]` | **crédito parcial por posición** |
| `code_output` | 4 | `correctIndex` | acierto / fallo |

→ **25 preguntas por combinación** por defecto; `--top-up --target=50` las **añade** sin reemplazar.

**Invariante I1 — las claves nunca salen.** `toPublicQuestion` construye la versión pública **por lista
blanca**, no borrando campos: un tipo nuevo con clave nueva no se filtra por descuido. Verificado:
`correctIndex|correctIndexes|correctOrder` → 0 apariciones en `src/app/dashboard` y `src/components`.

**Flujo:** `/api/line/start` lee el repertorio, sortea con `pickRandomQuestions` (estratificado por
`(tag, tipo)` para que los scores sean comparables entre candidatos), crea `line_sessions` (con las claves,
server-only) y devuelve `PublicQuestion[]`. `/api/line/submit` valida la forma de cada respuesta, corrige,
escribe el DNA **en transacción** (`max(actual, nuevo)` por skill), registra el intento y **borra la sesión**
(un solo uso).

**Tamaño del examen:** **10** con GitHub verificado, **20** sin él; `job.examQuestionCount` del reclutador
lo sobreescribe, acotado a `[10, 30]`.

**Modo vacante:** el repertorio se compone del banco al publicar (`/api/jobs/assessment`, idempotente) y se
guarda en `job_answer_keys`. Si no alcanza 10 preguntas → `422 no_bank_for_skills`. Si se pide sin
repertorio, `/api/line/start` lo compone al vuelo **en transacción**, para que dos candidatos simultáneos
compartan el mismo.

**Tecnología sin banco:** `503 pool_not_seeded`. El selector **solo ofrece lo precargado**
(`/api/line/catalog`) — decisión explícita: ofrecer algo que no funciona es peor que no ofrecerlo.

### 3.2 Motor de GitHub

**El cliente orquesta, el servidor ejecuta.** Analizar decenas de repos en una sola petición excede el
tiempo de una Netlify Function, así que el bucle por repositorio vive en el navegador (concurrencia 3).

1. **`POST /api/github/repos`** — lista repos analizables, **poda evidencia obsoleta** y marca cuáles ya
   están analizados (`engineVersion` + `pushedAt`).
2. **`POST /api/github/evaluate`** — un repo: señales + árbol, caché por SHA, descarga de archivos y
   **parseo AST → IR → analyzers → skill mapper**. Sin IA.
3. **`POST /api/github/aggregate`** — combina la subcolección, hace **una** llamada a Groq GPT-OSS (sobre los
   números, nunca sobre el código), resuelve la identidad OAuth y escribe el agregado.

**Descubrimiento:** `GET /users/{u}/repos?type=owner` → **solo repos propios**, sin forks, archivados ni
vacíos. Tope 100 repos; 12 archivos descargados por repo, de los que **8** entran al IR. Los archivos se
eligen **repartidos entre lenguajes** (round-robin), priorizando los de más código dentro de cada uno.

**Parseo:** `EXTENSION_MAP` cubre ~40 extensiones → **21 gramáticas**: ts, tsx, js, c, cpp, python, java,
kotlin, scala, c_sharp, go, php, rust, ruby, swift, dart, bash, hcl, elixir, lua, solidity.

**Analyzers** (puros, sobre el IR): `complexity`, `coupling`, `dead-code` (**devuelve `null` a propósito:
no está implementado**), `testing`, `documentation`. El **skill mapper** produce
`architecture · security · maintainability · testing · documentation` + `overall`.

> **Regla de diseño transversal: cuando no se puede medir, se devuelve `null`, no un número.**
> Se respeta en los analyzers, el mapper y la agregación. Cualquier cambio debe mantenerla.

**Caché en 3 niveles:** por repo+SHA, por `pushedAt` en el listado, y reuso del feedback de IA si los
scores no cambiaron. `GITHUB_ENGINE_VERSION` (hoy `2.0.0`) invalida todo al subirlo.

**Identidad:** el username se escribe a mano, así que cualquiera puede analizar el GitHub de otro. La prueba
es OAuth: se compara el id numérico de GitHub del proveedor vinculado en Firebase Auth. Si no coincide, el
análisis **no se bloquea**, pero `identity.verified = false` y **no reduce el examen**.

**Rate limits** (en Firestore, porque la memoria del proceso no sirve en Netlify): `repos` 12/h,
`evaluate` 150/h, `aggregate` 20/h. Limitación conocida: acotan por cuenta, no por persona, y todas
comparten la cuota del `GITHUB_TOKEN` global.

**🔑 GitHub NO escribe el DNA.** `user_skill_scores` lo escribe **exclusivamente** `/api/line/submit`.
La evidencia de GitHub vive aparte y solo influye en (a) el **tamaño del examen** y (b) el **roadmap**,
como proxy de prioridad 2. **GitHub nunca penaliza.**

### 3.3 Roadmap determinístico v2

**100 % determinista, sin IA**, ejecutado en cliente. El flow de IA (`generate-roadmap-flow.ts`) está
marcado `@deprecated` y **solo lo importa el Dev UI de Genkit**: es código muerto en producción.

- Catálogos sembrados: **`skill_catalog`** (112 skills) y **`roadmap_routes`** (10 rutas =
  `backend|frontend|fullstack|devops|mobile` × `junior_to_mid|mid_to_senior`).
  Los seeds **validan antes de escribir** que los pesos de cada ruta sumen 1.0 (±0.001), que cada id de
  `skillWeights` exista en el catálogo y que cada prerequisito exista.
- **Gate:** sin ninguna entrada en el DNA lanza `ROADMAP_REQUIRES_LINE_EVALUATION` — The LINE es obligatorio.
- **Resolución del score, en cascada:** `dna[skill.id]` (`line`) → proxy de GitHub por dimensión (`github`)
  → promedio de la categoría (`category-inferred`) → `null` (`unknown`, **no** "gap con 0").
- **Orden:** topológico de Kahn (nivel topológico primario), `rawPriority` como desempate dentro del nivel.
- **Estado por skill:** `unknown` → `completed` → `blocked` (prerequisito no dominado) → `gap`.

---

## 4. Modelo de datos — 14 colecciones, **todas con regla**

| Colección | Escribe | Lee | Regla |
|---|---|---|---|
| `users/{uid}` | Cliente (dueño) | dueño + Admin | `read, write: isOwner` |
| `user_skill_scores/{uid}` — **el DNA** | **Solo Admin** (`line/submit`) | dueño | `read: isOwner` · `write: false` |
| `assessment_attempts/{uid}_{sid}` | **Solo Admin** | dueño | `read` filtrado · `write: false` |
| `line_sessions/{id}` — **con claves** | Solo Admin | Solo Admin | `read, write: false` |
| `job_answer_keys/{jobId}` — **con claves** | Solo Admin | Solo Admin | `read, write: false` |
| `line_question_pools/{tech}_{lvl}` — **con claves** | Seed (Admin) | Solo Admin | `read, write: false` |
| `questions/{id}` — banco curado | Seed (Admin) | Solo Admin | `read, write: false` |
| `jobs/{jobId}` | Cliente (dueño) + Admin | **público, sin auth** | `read/list: true`; `create`: dueño; `update`: dueño **y** bloquea campos server-only; `delete: false` |
| `candidate_matches/{uid}_{jobId}` | **Solo Admin** | candidato o reclutador | `write: false` |
| `github_evidence/{uid}` (+ `/repos/{id}`) | **Solo Admin** | dueño | `write: false` (dos bloques: la regla del doc no cubre subcolecciones) |
| `api_rate_limits/{scope}:{uid}` | Solo Admin | Solo Admin | `read, write: false` |
| `skill_catalog/{id}` · `roadmap_routes/{id}` | Seed (Admin) | autenticado | `read: isAuthenticated` · `write: false` |
| `user_roadmaps/{uid}` | — | — | `read, write: isOwner` ⚠️ **sin ningún consumidor** |

`storage.rules`: solo `users/{userId}/**`, dueño, escritura < 5 MB.

---

## 5. Endpoints — 7 rutas, todas `runtime = "nodejs"`

| Endpoint | Qué hace | Auth | Rate limit |
|---|---|---|---|
| `POST /api/line/start` | Sortea preguntas, crea sesión, devuelve `PublicQuestion[]` | ID token | ❌ |
| `POST /api/line/submit` | Corrige, escribe DNA + intento + candidatura | ID token + dueño de la sesión | ❌ |
| `GET /api/line/catalog` | Combinaciones disponibles + `examSize` (nunca preguntas) | ID token | ❌ |
| `POST /api/jobs/assessment` | Compone el repertorio de una vacante | ID token + dueño del job | ❌ |
| `POST /api/github/repos` | Lista repos + poda evidencia | ID token | ✅ 12/h |
| `POST /api/github/evaluate` | Analiza 1 repo (AST) | ID token + owner == username | ✅ 150/h |
| `POST /api/github/aggregate` | Agrega + 1 llamada a Groq GPT-OSS | ID token | ✅ 20/h |

---

## 6. IA — tres proveedores

| Proveedor | Para qué | Variables |
|---|---|---|
| **Groq GPT-OSS** (único proveedor) | Generación del banco de preguntas + feedback de GitHub | `GROQ_API_KEY`, `GROQ_MODEL` |

Generación de JSON: esquema **tolerante** por tipo → normalización → esquema **estricto**. Las preguntas de
`ordering` se **desordenan en servidor**, guardando la permutación como `correctOrder`.

---

## 7. Despliegue y configuración

**Plataforma real: Netlify.** `netlify.toml` (build `npm run build`, Node 22, `@netlify/plugin-nextjs`).
Firebase aporta solo Auth + Firestore + Storage.

**Configuración muerta que sigue en el repo** (fuente de confusión): `wrangler.jsonc` y
`open-next.config.ts` (Cloudflare — sin ningún script npm que los invoque; además `tree-sitter` usa
bindings nativos **incompatibles con Workers**), `apphosting.yaml` y `firebase.json.hosting`.

**CI** (`.github/workflows/ci.yml`): Node 22, `npm ci`, typecheck, lint, test, build.

---

## 8. Estado verificado (ejecutado, no leído)

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ **0 errores, 21 warnings** |
| `npm test` | ⚠️ **116 pasan, 8 *skipped*, 2 suites no cargan** |
| `npm run typecheck` | ⚠️ **5 errores `TS2307`** — *fallo de entorno local*, no de código |

- Los 5 errores de typecheck y las 2 suites caídas son **la misma causa**: `tree-sitter`,
  `@genkit-ai/compat-oai` y `@opennextjs/cloudflare` están en `package.json` pero **no instalados** en
  `node_modules` (los binarios nativos fallaron en Windows). En CI, con `npm ci` sobre Linux, pasa.
- Los **8 tests *skipped* son los de `firestore.rules`**: requieren el emulador y **CI no lo arranca**.
  La seguridad crítica del producto **no tiene verificación automática**.

---

## 9. Hallazgos y deuda (priorizados)

### 🔴 Graves

- **H1 — Los vocabularios de The LINE y del roadmap están desacoplados.** El motor busca `dna[skill.id]`,
  pero las claves del DNA son ids de tecnología (`react`, `node.js`, `typescript`) y los del catálogo son
  slugs conceptuales (`typescript-basics`, `unit-testing`, `api-design-rest`). **De las 112 skills del
  catálogo solo 2 (`postgresql`, `terraform`) coinciden con alguna de las 55 tecnologías —y en la práctica
  solo `postgresql`, porque `terraform` únicamente colisiona si tiene banco sembrado—. No existe capa de
  mapeo.** Consecuencia real: casi todo cae a `category-inferred` y de ahí a `unknown`; `gap` queda vacío,
  no hay "siguiente paso", el progreso sale 0, y el gate "The LINE obligatorio" se pasa sin que ninguna
  medición real alimente el plan. `docs/TECH_DEBT.md` (A10) registra una versión **más estrecha** del
  problema (resolución de alias); el desajuste real es **taxonómico** y no está documentado en ningún sitio.
- **H2 — `.env.example` está incompleto.** Falta `GITHUB_TOKEN` (y su correspondiente `GROQ_API_KEY`/`GROQ_MODEL`).
  Un despliegue que siga la plantilla al pie de la letra deja `/api/github/*` roto
  (IA lanza → 500, pero fallback determinístico mantiene funcionalidad básica) y el motor cae a 60 req/h anónimas **para toda la plataforma**.

### 🟠 Medias

- **H3 — `jobs` valida los campos server-only en `update` pero NO en `create`.** Se puede crear una vacante
  con `applicantsCount` o `assessmentReady` arbitrarios desde el navegador.
- **H4 — `/api/line/start` y `/api/line/submit` no tienen rate limit**, y cada `start` **escribe un documento**
  con claves de respuesta. Sumado a que **`line_sessions` no tiene TTL** (solo se borra al enviar), las
  sesiones abandonadas se acumulan indefinidamente.
- **H5 — El estado vacío del roadmap es inalcanzable:** el error `ROADMAP_REQUIRES_LINE_EVALUATION` lo captura
  un `catch` genérico, así que quien no ha hecho The LINE ve un error genérico en vez del CTA para hacerla.
- **H6 — Agujero de rutas en el escalón superior:** un usuario con nivel inferido `senior` construye
  `${role}_senior_to_senior`, que no existe para ningún rol. En backend cae al fallback `backend_junior_to_mid`
  (un senior recibe la ruta junior→mid); en los otros 4 roles, banner de error.
- **H7 — `precision` se calcula y se tira:** la página solo lee `.items`, así que el mensaje "conecta GitHub
  para más precisión" que promete el tipo no se muestra jamás.
- **H8 — `docs/ROADMAP_DETERMINISTIC.md` no existe** pese a estar referenciado en 5 archivos como la única
  documentación de los algoritmos.

### 🟡 Menores

- `scripts/verify-roadmap-engine.ts` **no es un gate**: las violaciones imprimen ❌ pero el proceso sale con
  código 0. Además una de sus aserciones ya está obsoleta.
- 4 skills del catálogo (`backup-recovery`, `javascript-es6`, `networking-basics`,
  `responsive-mobile-design`) **no aparecen en ninguna ruta**: solo son alcanzables como prerequisitos.
- `user_roadmaps` es la **única colección escribible por el cliente sin ningún consumidor**.
- `src/lib/server/question-bank.ts` (40 KB, 38 preguntas curadas) está **huérfano**: solo lo importan tests.
- `generate-roadmap-flow.ts` es código muerto registrado en el Dev UI. `ROLE_WEIGHTS` no se usa.
- Las 18 skills del catálogo MVP están **duplicadas verbatim** entre los dos seeders, sin nota de cuál usar.
- `src/types/index.ts` **no reexporta** `roadmap.types`, así que `@/types` no alcanza `Skill`/`RoadmapRoute`.
- El motor de roadmap **no tiene tests unitarios**; solo un script manual contra Firestore de producción.
- Basura en la raíz: `check-firestore-state.ts`, `migration.sh` (**hace `rm -rf .git`**), `graphify-out/`,
  `tsconfig.tsbuildinfo` versionado.

---

## 10. Mapa de lectura para un agente

| Si vas a tocar… | Lee primero |
|---|---|
| Exámenes / preguntas | `src/lib/server/assessment.ts`, `question-pool.ts`, `src/types/question.types.ts`, `src/app/api/line/*` |
| Catálogo de tecnologías | `src/lib/technologies.ts`, `src/lib/server/sources.ts`, `scripts/seed-question-bank.ts` |
| Motor de GitHub | `src/services/github-engine/index.ts`, `parsers/universal-parser.ts`, `aggregate.ts`, `src/services/github-signals.service.ts` |
| Roadmap | `src/lib/roadmap-engine.ts`, `src/types/roadmap.types.ts`, `scripts/seed-skill-catalog-full.ts` |
| Datos / reglas | `firestore.rules`, `src/types/*.types.ts`, `docs/DATABASE.md` |
| Despliegue | `netlify.toml`, `.env.example`, `docs/DEPLOYMENT.md` |

**Para añadir una tecnología al catálogo** hay que tocar, como mínimo:

1. `src/lib/technologies.ts` → `TECHNOLOGIES` (y `TECHNOLOGY_ALIASES` si tiene grafías habituales).
2. `src/lib/server/sources.ts` → `TECHNOLOGY_SOURCES`. **No es opcional:** `technologies.test.ts` exige que
   *todas* las tecnologías resuelvan documentación específica.
3. `npm run seed:questions -- --only=<id> --yes` (y `--top-up --target=50 --yes` para variedad).

**No** hay que tocar `firestore.rules`, los índices, el selector de la UI ni `/api/line/catalog`: todos
derivan del catálogo o de los documentos existentes.

**Herramienta de diagnóstico:** `npm run inventory:pools` lista (solo lectura) qué combinaciones están
realmente sembradas, con cuántas preguntas y de qué tipos.
