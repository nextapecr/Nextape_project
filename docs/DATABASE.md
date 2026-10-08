# NEXTAPE — Modelo de Datos (Firestore)

> Fuente de verdad: código real en `src/types/*`, `src/services/*`, `firestore.rules`.
> Cuando este documento y `docs/blueprint.md` discrepen, **manda el código**. Las discrepancias
> conocidas están marcadas con ⚠️ y recogidas en `docs/TECH_DEBT.md`.

## 1. Base de datos

- **Motor:** Cloud Firestore (modo nativo), proyecto Firebase.
- ⚠️ **Ambigüedad de proyecto:** `.firebaserc` apunta a `nextape-prod`, pero
  `src/lib/firebase/client.ts` inicializa el SDK con `projectId: "studio-4462619429-470d8"`.
  El frontend habla con `studio-4462619429-470d8`; el CLI de Firebase despliega reglas a `nextape-prod`.
  **Las reglas pueden estar desplegándose a un proyecto distinto del que usa la app.** Ver TECH_DEBT.
- Acceso a datos **exclusivamente desde el cliente** vía Firebase Web SDK v11 (`'use client'`).
  No hay Admin SDK ni backend con service account. Toda escritura pasa por las reglas de seguridad.

## 2. Colecciones

### `users/{uid}`  — Perfil de usuario
Tipo canónico: [`UserProfile`](../src/types/user.types.ts) (`src/types/user.types.ts`).

| Campo | Tipo | Notas |
|---|---|---|
| `uid` | string | PK = uid de Firebase Auth |
| `displayName` | string | |
| `email` | string | |
| `photoURL` | string? | opcional (login social) |
| `githubUrl` | string? | opcional, no se captura hoy en el registro |
| `role` | `"developer" \| "recruiter"` | define la navegación del dashboard |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp? | |

- Escrito por `UserService.saveUser` (`setDoc` con `merge:true`) en el registro (`AuthModal`).
- ⚠️ Existe un **segundo tipo `UserProfile` incompatible** en `src/types/index.ts`
  (`username`, `grade`, `skills[]`, `core{}`) usado por `CoreService`/`useCore`. No representa
  la colección `users`. Es un modelo legacy. Ver TECH_DEBT.

### `user_skill_scores/{uid}`  — El "CORE" / DNA técnico
Tipo: [`UserSkills`](../src/types/user.types.ts).

| Campo | Tipo | Notas |
|---|---|---|
| `uid` | string | PK = uid |
| `scores` | `{ [skillName: string]: number }` | clave = skill en **minúsculas**, valor 0–100 |
| `updatedAt` | Timestamp | ✅ ahora `Timestamp.now()` (antes `new Date()`) |

- Leído por `SkillsService.getSkills`. Escrito por `SkillsService.updateSkillScores` (y el atajo
  `updateSkillScore`).
- ✅ Persiste **todas** las habilidades evaluadas (por `tag`) y se queda con el **mejor** score por skill.
- ✅ **Escritura SOLO en servidor** (B2): la escribe `/api/line/submit` con Admin SDK. El cliente es
  `write:false` → el DNA **no es falsificable**. Lectura: solo el owner. Ver SECURITY / BACKEND_AI.
- ⚠️ La "media de últimos 3 intentos" del blueprint sigue sin implementarse (se toma el mejor, no la media).

### `assessment_attempts/{attemptId}`  — Intentos de evaluación
Tipo: [`AssessmentSession`](../src/types/assessment.types.ts).

| Campo | Tipo | Notas |
|---|---|---|
| `assessmentId` | string | |
| `userId` | string | debe == `request.auth.uid` para crear |
| `status` | `"pending" \| "in_progress" \| "completed"` | |
| `answers` | `{ [questionId: string]: string }` | |
| `score` | number | |
| `startedAt` | Timestamp | |
| `completedAt` | Timestamp? | |

- Servicio: `AssessmentService` (`getSession`, lectura). La escritura es server-only.
- ✅ **El servidor escribe un documento por intento** (`/api/line/submit`, Admin SDK) al terminar la
  simulación (status `completed`, `score` global). Alimenta la métrica "Simulaciones" del dashboard.
- ✅ Cliente `write:false`; lectura solo del dueño (la query debe filtrar por `userId`).

### `line_sessions/{sessionId}` y `job_answer_keys/{jobId}` — 🔒 server-only
Colecciones de **confianza**, escritas/leídas SOLO por el Admin SDK (reglas `read, write: if false`).
- `line_sessions`: `{ userId, jobId?, questions (con correctIndex), createdAt }`. Sesión de una simulación;
  guarda la clave de respuestas. Se borra al enviar (`/api/line/submit`).
- `job_answer_keys`: `{ jobId, questions (con clave), covered, missing, source: "bank", updatedAt }`. Repertorio
  de la prueba de una vacante, **compuesto desde `line_question_pools` sin IA** ([`job-pool.ts`](../src/lib/server/job-pool.ts)):
  hasta 30 preguntas por skill (máx. 8 skills), del nivel de la vacante o del más cercano con banco. `covered`
  indica de qué nivel salió cada skill y `missing` qué skills no tienen banco. El doc público `jobs` no lleva
  preguntas: solo `assessmentReady`, `assessmentPoolSize` y `assessmentMissingSkills`.

### `jobs/{jobId}`  — Vacantes
Tipo: [`JobOpportunity`](../src/types/job.types.ts).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string? | id de documento |
| `title`, `company`, `description`, `salary`, `location`, `type`, `level` | string | `company` editable (se prefija con el nombre del perfil) |
| `requiredSkills` | string[] | Ids canónicos del catálogo (`src/lib/technologies.ts`) elegidos con `SkillPicker`. Las vacantes antiguas en texto libre ("React.js", "Node") se resuelven por alias |
| `examQuestionCount` | `number \| null`? | Preguntas por examen fijadas por el reclutador (10–30). Vacío/`null` = automático: **10 si el candidato tiene GitHub analizado, 20 si no** |
| `assessmentReady` / `assessmentPoolSize` / `assessmentMissingSkills` | boolean / number / string[] | Estado del repertorio; lo escribe el servidor al componerlo |
| `createdBy` | string | uid del reclutador |
| `postedAt` | Timestamp | |
| `applicantsCount` | number? | |

- Leído por `JobService.getLatestJobs` (`orderBy(postedAt desc) limit 20`) y `getJob`.
- Creada desde `dashboard/vacancies/new` (client `addDoc`) y editada en `dashboard/vacancies/[id]`. Su repertorio lo
  compone `POST /api/jobs/assessment` al publicar (o `/api/line/start` con el primer candidato, si faltaba); al
  cambiar las skills en `[id]` se recompone automáticamente.
- ✅ **Reglas corregidas (B1):** el reclutador **dueño** (`createdBy == uid`) puede crear y actualizar su
  vacante; sin borrado desde cliente; no puede reasignar `createdBy`. La creación de vacantes ya no está bloqueada.

#### Preguntas de la vacante
Ya **no se embeben** en `jobs` (lectura pública): el campo heredado `assessmentQuestions` se borra al componer el
repertorio. Las preguntas viven con su clave en `job_answer_keys/{jobId}` (server-only).

### `questions/{qId}`  — Banco de preguntas (no usado activamente)
Tipo: `Question`. Reglas: lectura autenticada, escritura `if false`.
- No hay servicio que lo consulte hoy; las preguntas viven embebidas en `jobs` o se generan al vuelo.

### `candidate_matches/{matchId}`  — Matches candidato↔vacante
Tipo: [`CandidateMatch`](../src/types/job.types.ts). `matchId = ${uid}_${jobId}`.

| Campo | Tipo | Notas |
|---|---|---|
| `userId` | string | Candidato. |
| `recruiterId` | string | Dueño de la vacante (denormalizado, `= job.createdBy`). La regla de lectura lo usa. |
| `jobId` | string | |
| `jobTitle` | string | Denormalizado desde `jobs`. |
| `candidateName` | string | Denormalizado desde `users`. |
| `score` | number | Resultado de The LINE (0–100). Se conserva el **mejor** entre intentos. |
| `matchPercent` | number | Afinidad DNA↔`requiredSkills` (0–100), vía `calculateMatch`. |
| `skills` | `Record<string, number>` | Snapshot de los scores del candidato en las skills de la vacante. |
| `completedAt` | Timestamp | |

- **Escritor:** `POST /api/line/submit` (Admin SDK) cuando la sesión de The LINE tiene `jobId`: tras calcular
  el DNA, escribe/actualiza `candidate_matches/{userId_jobId}` (conserva el mejor `score`) e incrementa
  `jobs.applicantsCount` solo la primera vez que el candidato aplica. Es best-effort (no invalida el intento).
- **Lector:** `CompatibilityService.getMatchesForRecruiter(recruiterId)` (lee `where recruiterId == uid`).
  Escritura `if false` para el cliente (solo Admin SDK).

### `user_roadmaps/{uid}`  — Roadmaps de aprendizaje (Reservado para V2)
- **Estado MVP:** En el Roadmap Determinístico, el cómputo se realiza **on-demand en el cliente** y **NO se persiste** en esta colección para evitar datos obsoletos.
- **Uso en V2:** Reservado para persistir snapshots históricos (`UserRoadmapSnapshot`) y calcular diffs de progreso.
- **Reglas:** `read, write: if isOwner(userId)`. La regla de escritura permanece documentada como reservada para V2 sin uso activo en MVP.

### `skill_catalog/{skillId}` — Catálogo curado de habilidades
Tipo: [`Skill`](../src/types/roadmap.types.ts).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK = slug en kebab-case (ej. `"unit-testing"`) |
| `name` | string | Nombre legible para UI |
| `category` | `SkillCategory` | Agrupación semántica (`language`, `database`, `testing`, etc.) |
| `prerequisites` | `string[]` | IDs de habilidades que deben dominarse previamente (grafo) |
| `githubDimension` | `SkillDimension \| null` | Dimensión del GitHub Engine como proxy (`null` = sin proxy) |
| `relatedSkills` | `string[]?` | Opcional (V2) para sugerencias cruzadas |

- **Escritor:** Server-only / Admin SDK vía `npm run seed:catalog -- --yes`.
- **Lector:** Lectura pública para usuarios autenticados (`allow read: if isAuthenticated()`).

### `roadmap_routes/{routeId}` — Rutas de progresión curadas
Tipo: [`RoadmapRoute`](../src/types/roadmap.types.ts). `routeId = {targetRole}_{fromLevel}_to_{toLevel}` (ej. `backend_junior_to_mid`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK (ej. `"backend_junior_to_mid"`) |
| `targetRole` | `TargetRole` | Rol objetivo (`backend`, `frontend`, etc.) |
| `fromLevel` | `SeniorityLevel` | Nivel origen inferido (`junior`, `mid`) |
| `toLevel` | `SeniorityLevel` | Nivel objetivo (`mid`, `senior`) |
| `skillWeights` | `Record<string, number>` | Pesos por skill individual (suma = 1.0) |
| `displayName` | string | Nombre para UI (ej. `"Backend Engineer · Junior → Mid"`) |

- **Escritor:** Server-only / Admin SDK vía `npm run seed:catalog -- --yes`.
- **Lector:** Lectura pública para usuarios autenticados (`allow read: if isAuthenticated()`).

### `github_evidence/{uid}` — 🔒 Perfil de GitHub agregado (todos los repositorios)
Tipo: [`GithubEvidence`](../src/types/github.types.ts). `uid = request.auth.uid`. Motor `engineVersion: "2.0.0"`.

| Campo | Tipo | Notas |
|---|---|---|
| `uid` | string | PK = uid de Firebase Auth |
| `githubUsername` | string | Cuenta de GitHub analizada |
| `analyzedRepo` | string | Heredado del análisis de un repo. En perfiles multi-repo: `"N repositorios"` |
| `reposAnalyzed` / `reposWithCode` / `filesAnalyzed` | number | Repos combinados, cuántos tenían código analizable y archivos parseados en total |
| `repos` | `GithubRepoSummary[]` | Por repo: `fullName`, `overall` (`null` sin código analizable), `hasASTData`, `filesAnalyzed`, `mainLanguage` |
| `languagesBytes` / `parsedLanguages` | `Record<string, number>` | Bytes por lenguaje según GitHub y archivos parseados por gramática del motor |
| `identity` | `{ verified, method, linkedLogin }` | `verified: true` solo si la cuenta de Firebase tiene vinculado ese mismo GitHub (proveedor `github.com`). `linkedLogin`: la cuenta vinculada cuando no coincide con la analizada. Se vincula con «Verificar con GitHub» (`linkGithubAccount`) |
| `lastCommitSHA` | string | Heredado; vacío en perfiles agregados (la caché vive por repo) |
| `repoSignals` | `RepoSignals` | Agregado: lenguajes sumados, `repo: "*"` |
| `metrics` | `EngineMetrics` | Complejidad y acoplamiento ponderados por archivos; `deadCodeScore: null` |
| `skillScores` | `GithubSkillScores` | Agregado (ver abajo) |
| `aiFeedback` | `GithubAIFeedback \| null` | Lectura de IA (Groq GPT-OSS) sobre los scores agregados (nunca código fuente). Incluye campo `source: 'ai'|'deterministic'` para distinguir feedback generado por modelo vs fallback |
| `analyzedAt` | Timestamp | Timestamp de servidor |
| `engineVersion` | string | `"2.0.0"` |

#### Subcolección `github_evidence/{uid}/repos/{owner__repo}` — 🔒 evidencia por repositorio
Tipo: `GithubRepoEvidence`. Id = `owner/repo` en minúsculas con `/` → `__` (`repoDocId`).
Campos: `uid, githubUsername, fullName, pushedAt, lastCommitSHA, repoSignals, metrics, skillScores, filesAnalyzed,
parsedLanguages, analyzedAt, engineVersion`.

- **Escritores (Admin SDK):** `POST /api/github/evaluate` analiza UN repo y escribe la subcolección (sin IA);
  `POST /api/github/aggregate` combina la subcolección en el doc raíz (1 llamada a Groq GPT-OSS). El cliente orquesta
  `/api/github/repos` → `evaluate` por repo (3 a la vez) → `aggregate`: así cada petición cabe en el tiempo de
  una Netlify Function aunque el usuario tenga decenas de repositorios.
- **Lector:** solo el dueño, del doc y de la subcolección (dos reglas: la de un documento no cubre sus
  subcolecciones). Escritura `if false` para el cliente.
- **Caché:** un repo no se reanaliza si coinciden `lastCommitSHA` y `engineVersion`; `/api/github/repos` lo marca
  `analyzed` comparando además `pushedAt`, y el cliente lo salta.
- **Selección de archivos:** hasta 12 por repo, repartidos por turnos entre lenguajes (primero los archivos con más
  código), excluyendo dependencias, generados, `.d.ts` y minificados. Motor: 20 lenguajes (`EXTENSION_MAP`).
- **Agregación** (`aggregateRepoEvidence`): arquitectura, seguridad y mantenibilidad = media ponderada por archivos
  analizados **solo de repos con AST** (`null` si ninguno); testing y documentación = media de todos los repos
  (peso mínimo 1).
- **Consumidores:** `GithubEvidenceCard`, el roadmap (`githubScores` por dimensión) y The LINE: con
  `reposWithCode > 0` **y `identity.verified`** el examen es de **10 preguntas en vez de 20**. Sin verificar no
  compensa: cualquiera puede escribir el usuario de GitHub de otra persona.
- **Límites:** `repos` 12/h, `evaluate` 150/h y `aggregate` 20/h por usuario (`api_rate_limits`), y como mucho los
  100 repos con push más reciente. `repos` borra de la subcolección los que ya no están en esa lista (borrados,
  renombrados o fuera del tope), y `aggregate` reutiliza la lectura de IA si los scores no cambiaron.
- **Fórmula de `overall` (Skill Scores):**
  $$\text{overall} = (\text{architecture} \times 0.25) + (\text{testing} \times 0.25) + (\text{security} \times 0.15) + (\text{maintainability} \times 0.20) + (\text{documentation} \times 0.15)$$
  *Si el repositorio no tiene archivos parseables AST (0 archivos), `architecture`, `security` y `maintainability` son `null`, y `overall` se recalcula proporcionalmente sobre métricas disponibles (`testing` 62.5% + `documentation` 37.5%).*

### `api_rate_limits/{scope}:{uid}` — 🔒 Límites de peticiones por usuario
`{ uid, scope, windowStart (ms), count, updatedAt }`. Ventana fija de 1 h por endpoint
([`rate-limit.ts`](../src/lib/server/rate-limit.ts)). Protege el `GITHUB_TOKEN` compartido (5000 req/h para toda la
plataforma) y el coste de IA (Groq GPT-OSS).
- **Escritor:** los endpoints de GitHub (Admin SDK, en transacción). **Cliente:** `read, write: if false`.

### `core/{uid}`  — ⚠️ Colección fantasma
- `CoreService` lee/escribe la colección `core`, **pero no existe regla para `core`**.
  Firestore **deniega por defecto** → toda operación falla. Además usa el `UserProfile` legacy.
  Es código muerto/roto. Ver TECH_DEBT.

## 3. Relaciones

```
Auth user (uid)
 ├─1:1─ users/{uid}                (perfil, role)
 ├─1:1─ user_skill_scores/{uid}    (DNA técnico: scores por skill)
 ├─1:1─ user_roadmaps/{uid}        (roadmap IA — sin persistencia confirmada)
 ├─1:N─ assessment_attempts/{id}   (userId == uid)  [hoy sin uso real]
 └─1:N─ candidate_matches/{uid_jobId} (userId == uid; recruiterId == job.createdBy)

recruiter (uid)
 └─1:N─ jobs/{jobId}               (createdBy == uid)  [bloqueado por reglas]

jobs/{jobId}.assessmentQuestions[]  ← generado por Genkit (generateQuestionsFlow)
```

## 4. Índices

- `jobs`: consulta `orderBy(postedAt, desc) + limit(20)` → índice de un solo campo (automático). OK.
- No hay `firestore.indexes.json` en el repo. Cualquier consulta compuesta futura (p.ej. filtrar
  jobs por skill + orden por fecha) requerirá índice compuesto declarado.

## 5. Reglas de negocio de datos

- **Skills normalizadas a minúsculas** en todos los puntos de escritura/lectura de scores y requiredSkills.
  El match (`JobService.calculateMatch`) también normaliza a minúsculas antes de comparar. Mantener esta invariante.
- **Cálculo de match** (`calculateMatch`): suma los scores del usuario para las skills requeridas y divide
  entre `jobSkills.length` (no entre las encontradas) → penaliza skills faltantes. Devuelve entero redondeado 0–100.

## 6. Convenciones al tocar datos

- Todo acceso a Firestore pasa por los helpers de `src/lib/firebase/firestore.ts`
  (`getDocById`, `setDocById` [merge], `updateDocById`, `queryCollection`) o por un `*.service.ts`.
  **No** llamar al SDK de Firestore directamente desde componentes salvo casos ya existentes (migrar hacia servicios).
- Timestamps: usar `Timestamp.now()` de `firebase/firestore`, nunca `new Date()`.
- Al añadir una colección: (1) tipo en `src/types`, (2) servicio en `src/services`, (3) **regla en `firestore.rules`**,
  (4) documentarla aquí. Sin regla, la colección no funciona en prod.
