# NEXTAPE — Changelog de correcciones (rama `fix/system-hardening`)

Registro de las correcciones aplicadas al sanear el sistema. Cada fase referencia los IDs de
[`docs/TECH_DEBT.md`](./TECH_DEBT.md). Rama base: `migration`.

## FASE 8 — Cierre del loop reclutador (A4) — 2026-07-22
> Antes: el reclutador publicaba vacantes pero nunca podía ver ni rankear candidatos; `candidate_matches`
> estaba inerte (sin escritor) y su regla referenciaba `recruiterId`, campo ausente en el tipo. Ahora el
> loop developer→recruiter está **cerrado**.
- **Tipo** (`types/job.types.ts`): `CompatibilityMatch` → **`CandidateMatch`** con `userId`, `recruiterId`
  (denormalizado), `jobId`, `jobTitle`, `candidateName`, `score` (The LINE 0–100, se conserva el mejor),
  `matchPercent` (afinidad DNA↔`requiredSkills` 0–100), `skills` (`Record<string,number>`, snapshot) y
  `completedAt`. `doc id = ${userId}_${jobId}`.
- **Escritor server-trust** (`app/api/line/submit/route.ts`): si la sesión de The LINE tiene `jobId`, tras
  calcular el DNA escribe/actualiza `candidate_matches/{userId_jobId}` con Admin SDK (`recruiterId = job.createdBy`,
  denormaliza `jobTitle`/`candidateName`, conserva el mejor `score`, calcula `matchPercent` con `calculateMatch`,
  guarda snapshot de `skills`) e incrementa `jobs.applicantsCount` (`FieldValue.increment(1)`) **solo la primera
  vez** que ese candidato aplica a la vacante. Best-effort (try/catch; un fallo no invalida el intento).
- **Servicios** (`src/services/`): `CompatibilityService.getMatch` (muerto) → **`getMatchesForRecruiter(recruiterId)`**
  (lee `candidate_matches where recruiterId == uid`; ordena en cliente por `score` para no depender de índice
  compuesto). Nuevo **`JobService.getJobsByRecruiter(uid)`**.
- **`/dashboard/candidates`**: reescrita. Lee matches reales vía servicios (ya **no** usa el SDK crudo de
  Firestore), agrupa por vacante, rankea candidatos por su `score` de The LINE, muestra `matchPercent` y `skills`.
  Stats reales (vacantes activas, aplicaciones totales, DNA verificados). Eliminado el copy deshonesto sobre
  "el ranking… se activará cuando el pipeline… esté disponible".
- **Dashboard reclutador** (`dashboard/page.tsx`): "Candidatos en Pipeline" ahora suma el `applicantsCount`
  real de las vacantes (antes hardcodeado a 0).
- **Jobs (developer)** (`dashboard/jobs/page.tsx`): la CTA "TOMAR PRUEBA ESPECÍFICA" → "POSTULAR CON THE LINE",
  con microcopy honesto: al completar la prueba, el resultado verificado se comparte con el reclutador de la vacante.
- **Regla** `candidate_matches` (`firestore.rules`): **sin cambios** (ya era correcta: `allow read if userId==uid
  || recruiterId==uid`, `write:false`); ahora el `recruiterId` que referenciaba sí existe en el documento.
- **Privacidad/consentimiento:** tomar The LINE de una vacante concreta = postular = consentir compartir ese
  resultado con el reclutador dueño de esa vacante, que solo ve candidatos de **sus** vacantes (`recruiterId==uid`).
- **Verificación:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅.

## FASE 1 — Código muerto y basura (devops-firebase / code-reviewer)
- **R1** Eliminado `estructura.txt` (1.8 MB, volcado de `ls -R` con `node_modules`).
- **R2** Eliminado `tailwing.config.ts` (duplicado idéntico por typo de `tailwind.config.ts`).
- **R3** Eliminado `.modified` (archivo vacío, artefacto de IDX).
- **R4** Eliminadas rutas top-level muertas: `src/app/{compatibility,digital-twin,jobs,line,profile,roadmap}/page.tsx` (stubs `return null`).
- **R5** Eliminado `src/app/dashboard/digital-twin/page.tsx` (obsoleto; renombrado a CORE).
- **R6** Eliminado el stack 3D huérfano: deps `three`, `@react-three/fiber`, `@react-three/drei`,
  `@types/three` del `package.json` + asset `public/models/laptop.glb` (0 usos en `src`).
- **R7** Eliminados placeholders sin consumidores: `src/app/lib/placeholder-images.json`,
  `src/lib/placeholder-images.ts`, `src/lib/placeholder-images.json`.
- **A3** Eliminado `src/features/*` completo (stubs vacíos: `AuthService`, `useAssessment`,
  `CompatibilityEngine`, y el módulo `core` roto). 0 imports en el resto del código.

## FASE 2 — Consolidación de tipos (database-architect)
- **A1/A2** `src/types/index.ts` dejó de definir un `UserProfile` legacy incompatible. Ahora es un
  **barrel** que reexporta los tipos canónicos (`firebase.types`, `user.types`, `assessment.types`,
  `job.types`). El único consumidor del legacy era el módulo `features/core` (ya eliminado).

## FASE 3 — Bugs de runtime y lógica (frontend / backend)
- **Nuevo hook `src/hooks/use-auth-user.ts`**: estandariza la suscripción a Auth y elimina el
  _race condition_ de leer `auth.currentUser` en `useEffect`. Aplicado en `dashboard`, `core`,
  `profile`, `jobs`, `compatibility`, `vacancies`, `candidates`.
- **Nueva util `src/lib/grading.ts`** (`getTechnicalGrade`, `calculateAverageScore`): fuente única del
  "grade". Corrige **C3** (umbrales divergentes CORE vs Perfil) y el `NaN` del Perfil con scores vacíos.
- **B6** `dashboard/vacancies/page.tsx`: importados `Terminal` y `Briefcase` (crash de runtime resuelto);
  typo `md:row`→`md:flex-row`; `postedAt.toDate()` protegido con `formatPostedAt`; "Ver Candidatos" enlaza a la página.
- **Landing `page.tsx`**: `useRef` e iconos sin usar eliminados; typo `sm:row`→`sm:flex-row`; botón
  "Soy Reclutador" ahora abre el modal; **construida la sección `#how-it-works`** (enlace del navbar que estaba roto).
- **Construida `dashboard/candidates/page.tsx`**: la ruta enlazada desde el menú del reclutador ya no es
  un 404; muestra métricas y vacantes reales con un estado honesto para el ranking por DNA.
- **`compatibility/page.tsx`**: botón "Recalcular Auditoría" ahora recalcula; "Aplicar con Identity"
  enlaza a la prueba de la vacante; `Badge` sin usar eliminado.
- **A7 / A5 — The LINE (`dashboard/line/page.tsx`)**: puntúa **por habilidad (tag)**, no solo la primera;
  persiste el intento en `assessment_attempts` (arregla la métrica "Simulaciones" muerta); **guard** cuando
  la IA no devuelve preguntas (evita crash); banner de error; `level` de la vacante usado al generar.
- **`services/skills.service.ts`**: `updateSkillScores` (varias skills a la vez), se queda con el **mejor**
  score por skill (no regresa el DNA en reintentos peores), y usa **`Timestamp.now()`** (antes `new Date()`).
- **`dashboard/jobs`**: filtro protegido contra `title`/`company` nulos.

## FASE 4 — Hardening de config/build (devops-firebase)
- **B5** `next.config.ts`: eliminado `typescript.ignoreBuildErrors`. El proyecto pasa `tsc --noEmit`
  limpio, así que los errores de tipos ahora **bloquean** el build. (ESLint sigue ignorado en build
  porque aún no hay config de ESLint — ver Pendientes.)
- **Código muerto extra**: eliminado `src/components/ui/calendar.tsx` (0 usos, rompía el typecheck por
  API v9 de react-day-picker) y su dependencia `react-day-picker`.
- **Script de build no multiplataforma**: `"build": "NODE_ENV=production next build"` fallaba en Windows
  (`NODE_ENV` no es reconocido por cmd.exe). Cambiado a `"build": "next build"` (Next ya fija
  `NODE_ENV=production` en build). Ahora el build funciona en Windows/Linux/macOS.
- **B3 (parcial)** `src/lib/firebase/client.ts`: la config lee de `NEXT_PUBLIC_FIREBASE_*` con fallback a
  los valores actuales. Añadido `.env.example` (incluye el secreto `GEMINI_API_KEY`). El proyecto
  canónico sigue pendiente de decisión (Fase 6).

## FASE 5 — Reglas de seguridad (security-auditor)
- **B1** `firestore.rules` `jobs`: `write:if false` → el reclutador **dueño** (`createdBy`) puede crear y
  actualizar su vacante (incl. la prueba IA); sin borrado desde cliente; no se puede reasignar `createdBy`.
- **B8** `firestore.rules` `assessment_attempts`: eliminado el `list` abierto; la lectura/consulta es
  solo del dueño (una query debe filtrar por `userId`).
- **B7** `storage.rules`: lectura pública (`if true`) → solo autenticados; escritura del dueño con
  límite de tamaño (5 MB).
- **B2 (documentado, pendiente)**: `user_skill_scores` sigue owner-write con un comentario que marca la
  necesidad de mover el scoring a servidor (Fase 6). No se cierra sin el pipeline de servidor.

## Verificación
- `npm run typecheck` → **limpio (exit 0)** tras todas las fases.
- ESLint: no configurado en el repo (tarea pendiente, ver docs/PRODUCTION_READINESS.md).

## FASE 6 — Integridad server-trust + calidad (decisiones del usuario)

### 6A — Proyecto Firebase canónico (B3)
- `.firebaserc` alineado a **`studio-4462619429-470d8`** (el que usa la app). Las reglas ya se
  despliegan al mismo proyecto que la app. Pendiente solo el secreto de Gemini en hosting.

### 6B–6E — Scoring en servidor (B2, el fix de integridad central)
- **Firebase Admin SDK** (`src/lib/firebase/admin.ts`, init lazy con ADC/`FIREBASE_SERVICE_ACCOUNT`).
- **Route handlers** (Node runtime, verifican el ID token con Admin):
  - `POST /api/line/start`: genera preguntas EN SERVIDOR, guarda la clave en `line_sessions`
    (server-only) y devuelve preguntas **sin `correctIndex`**.
  - `POST /api/line/submit`: corrige EN SERVIDOR y escribe el DNA (`user_skill_scores`, mejor score
    por skill) y el intento (`assessment_attempts`) con Admin SDK.
  - `POST /api/jobs/assessment`: el reclutador dueño genera la prueba; guarda preguntas públicas
    **sin clave** en `jobs` y la clave en `job_answer_keys` (server-only).
- **Cliente refactorizado**: The LINE y vacancies/new usan `src/lib/api.ts` (`apiPost` con ID token);
  ya no puntúan ni escriben el DNA. `SkillsService`/`AssessmentService` sin métodos de escritura;
  `JobService.generateJobAssessment` eliminado. `calculateMatch` extraído a `src/lib/match.ts` (puro).
- **Reglas cerradas**: `user_skill_scores` `write:false`; `assessment_attempts` `write:false`;
  `line_sessions` y `job_answer_keys` deny total (solo Admin). Tipo `PublicQuestion` (sin `correctIndex`).
- **Resultado (B2 cerrado):** el DNA ya **no es falsificable desde el cliente**; el `correctIndex`
  nunca llega al navegador; el scoring es de confianza (servidor).
- `src/ai/dev.ts` ahora registra los flows (Genkit Dev UI).

### 6G — Calidad y CI
- **ESLint** flat config (`eslint.config.mjs`, `next/core-web-vitals` + `next/typescript`); `npm run lint`
  = 0 errores (24 warnings advisory). Script `lint` → `eslint .`.
- **Tests** con Vitest: `src/lib/grading.test.ts`, `src/lib/match.test.ts`,
  `src/lib/server/assessment.test.ts` (14 tests) + `src/lib/firebase/rules.test.ts` (5 tests de reglas,
  listos para el emulador, se saltan sin él). Scripts `test`/`test:watch`.
- **CI**: `.github/workflows/ci.yml` (typecheck + lint + test + build en push/PR).

### Verificación Fase 6
- `npm run typecheck` ✅ · `npm run lint` ✅ (0 errores) · `npm test` ✅ (14 pasan) · `npm run build` ✅ (rutas `/api/*`).

## FASE 7 — Migración a Groq + coherencia + spanglish

### Proveedor de IA: Gemini → **Groq** (decisión de equipo, coste)
- `src/ai/genkit.ts`: plugin **`genkitx-groq`**, modelo `groq/llama-3.3-70b-versatile` (`GROQ_MODEL`),
  key `GROQ_API_KEY`. Eliminado `@genkit-ai/google-genai`. Se reutiliza el enfoque que el equipo ya tenía
  en la rama `feat/mvp-core-modules`.
- Nuevo `src/ai/generate.ts` (`generateJson`): llama al modelo, limpia fences, `JSON.parse` + **validación
  Zod** con reintento (más robusto con Llama que el structured output nativo).
- Flows reescritos (assessment y roadmap) con esquema *lenient* → normalización a tipos estrictos.
- `.env.example` y **todas las docs** actualizadas (Gemini→Groq). `src/ai/dev.ts` registra los flows.

### Correcciones de coherencia (informe del agente de flujo)
- **#3** El `tag` de la IA se **normaliza al vocabulario del `stack`** (`normalizeTag`) y el prompt lo
  restringe → el pipeline DNA→match ya no subestima el % por diferencias de redacción.
- **#2** Login social: el selector de tipo de cuenta ahora es **visible siempre** (Google/GitHub también
  crean cuenta) → se acabó la auto-asignación silenciosa de `role`.
- **#6** Crear vacante: manejo de error separado (crear vacante vs generar prueba). Ya no hay job huérfano
  con mensaje falso "no se pudo crear"; si falla la IA, la prueba se genera al vuelo después.
- **#7** `jobs.assessmentQuestions` tipado como `PublicQuestion[]` (el doc público no lleva `correctIndex`).
- **#8** `/api/line/submit` persiste las respuestas reales del intento (antes `{}`).
- **#11** `apiPost` espera `auth.authStateReady()` antes de leer `currentUser`.
- **#5** Copy honesto en CORE/Perfil: ya no afirman "los reclutadores ven tu DNA en tiempo real" (las
  reglas no lo permiten hasta A4).
- **Escala de dificultad** de The LINE unificada a junior/mid/senior/master (antes `expert` era inválido).

### Spanglish (informe del agente de consistencia)
- UI a **español** y labels unificados en ~12 archivos: `Recruiter Engine`→`Panel de Reclutador`,
  `Technical Grade`/`Technical Rank`→`Grado Técnico`, `CORE Affinity`/`Core Match`→`Afinidad CORE`,
  `Technical/Skill DNA`→`DNA Técnico`, `Compatibility Engine`→`Motor de Compatibilidad`, `Rank Index`,
  `Skill Gap`, `Latency/Security/Encrypted`, fallbacks `Remote/Full-time/Competitive`, nav `Jobs`→`Empleos`,
  badge `Enterprise`→`Empresa`, roles `Developer`→`Desarrollador`, typo `CORE_SYNCRONIZED`, metadata, etc.
- Política de consistencia (del agente): UI en español; código y nombres de marca (`Nextape`, `The LINE`,
  `CORE`, `Roadmap`, `DNA`, `Match`) en inglés; no mezclar idiomas dentro de una frase.

### Verificación Fase 7
- `npm run typecheck` ✅ · `npm run lint` ✅ (0 errores, 23 warnings) · `npm test` ✅ · `npm run build` ✅.

## Iteración 2026-09-14 — GitHub multi-repo, examen 10/20 y pruebas de vacante desde el banco

### Pruebas THE LINE de vacantes (el error al postular)
- **Causa:** el repertorio se generaba con IA dentro de la función. Con Groq devolviendo 401 (clave inválida) y
  los modelos de NVIDIA retirados (410), `buildQuestionPool` devolvía 0 preguntas y el candidato recibía un
  error. Además, las dos únicas vacantes de producción (`job_1`, `job_2`) son documentos de seed sin `createdBy`
  ni `requiredSkills`: no pueden tener prueba ni entregar candidaturas a ninguna empresa.
- **Fix:** `src/lib/server/job-pool.ts` compone el repertorio desde `line_question_pools`, sin IA: ids canónicos
  con alias, nivel más cercano con banco, ≤ 30 preguntas por skill. Lo usan `/api/jobs/assessment` y
  `/api/line/start`, con errores explícitos (`no_bank_for_skills`, `job_without_bank`, `job_incomplete`,
  `job_closed`) que la pantalla traduce a mensajes concretos.
- Formularios de vacante con `SkillPicker`: solo tecnologías con banco. Al cambiar las skills en
  «Gestionar vacante» la prueba se recompone sola.
- `calculateMatch` y `/api/line/submit` usan la clave canónica: "Next.js" en la vacante casa con el DNA `nextjs`.

### The LINE: 10 preguntas con GitHub, 20 sin él
- `examSizeFor` sustituye las 5 preguntas fijas. `job.examQuestionCount` pasa a ser un override de 10–30
  (vacío = automático).
- `/api/line/catalog` devuelve `examSize` y `hasGithub`; la pantalla lo explica antes de empezar y acepta
  `?technology=&level=` (los enlaces del roadmap).
- `npm run seed:questions -- --top-up --target=50 --yes` amplía el banco sin reemplazar lo existente.

### GitHub: todos los repositorios
- Antes se analizaba un único repo (el último con push). Ahora `/api/github/repos` → `/api/github/evaluate`
  por repo → `/api/github/aggregate`, con la subcolección `github_evidence/{uid}/repos` y su regla.
- Selección de archivos repartida entre lenguajes (≤ 12 por repo), listado paginado sin forks ni archivados,
  detección de tests y CI ampliada a más ecosistemas e identidad verificada vía OAuth de GitHub.
- La lectura de IA devuelve feedback con `source: 'ai'` cuando se genera exitosamente, o `source: 'deterministic'` 
  cuando todos los modelos fallan (fallback estructurado desde scores).
- Validación de usuario y nombre de repo antes de llamar a la API con el token del servidor.
- Tras la auditoría de seguridad: el examen de 10 preguntas solo aplica con la cuenta **verificada** (antes bastaba
  con analizar el GitHub de otra persona); límites por usuario en `repos`/`evaluate`/`aggregate`
  (`api_rate_limits`), tope de 100 repos, limpieza de repos borrados o renombrados, y IA solo se vuelve a
  llamar si cambian los scores.
- Reglas: el dueño de una vacante ya no puede escribir `assessmentReady`, `assessmentPoolSize`,
  `assessmentMissingSkills` ni `applicantsCount`.
- «Verificar con GitHub» (`linkGithubAccount`, `linkWithPopup`): vincula GitHub sin cerrar sesión. Si la sesión ya
  tiene otro GitHub vinculado, el servidor devuelve cuál (`identity.linkedLogin`) y se ofrece analizar ese.
- **Bug del motor encontrado en la verificación E2E:** tree-sitter lanzaba `Invalid argument` con archivos de más
  de 32 KiB y el motor los descartaba en silencio. Como la selección prioriza los archivos con más código, en
  `rust-lang/mdBook` se perdían todos los `.rs`. `universal-parser.ts` ajusta `bufferSize` al archivo.

### Roadmap
- Escalera Junior → Mid → Senior con «Estás aquí» y «Meta», umbral visible por skill, origen del score correcto
  (The LINE / GitHub / promedio de pruebas parecidas / sin datos), sección «Sin medir todavía» en vez de 0 % y una
  acción concreta por skill (practicar en The LINE o analizar GitHub).

### IA
- `generateJson` cae a NVIDIA también ante 401/403/404/410 y no reintenta errores no transitorios.

### Verificación
- `npm run typecheck` ✅ · `npm run lint` ✅ (0 errores, 21 warnings) · `npm test` ✅ (123 pasan; los 8 de reglas
  necesitan emulador) · `npm run build` ✅.
- **E2E contra producción** con usuarios temporales y limpieza verificada (`qa-test-engineer`): 21/21 casos
  (vacantes, práctica general, GitHub multi-repo) y, tras los fixes de seguridad, 12/12 (identidad verificada
  10/20, vínculo real de GitHub, Rust en `rust-lang/mdBook`, poda, 429 del límite). Análisis por repo: ~1,2 s.
- **Revisión** (`code-reviewer`) y **auditoría de seguridad** (`security-auditor`): hallazgos corregidos y
  re-verificados; sin bloqueadores. Riesgo residual documentado en TECH_DEBT A9.

## Pendiente (siguiente)
- **IA:** sustituir `GROQ_API_KEY` (401) en `.env.local` y Netlify; sin proveedor no se puede ampliar el banco.
- **Reglas:** desplegar `firestore.rules` (subcolección `github_evidence/{uid}/repos`, `api_rate_limits` y campos
  protegidos de `jobs`).
- **Datos:** decidir qué hacer con `job_1`/`job_2` (seed sin dueño ni skills, ocultos del listado): son las
  únicas vacantes de producción y ninguna puede tener The LINE.
- **Límites:** son por cuenta; muchas cuentas pueden sumar cuota del `GITHUB_TOKEN`. Valorar un límite global.
- **Roadmap:** `roadmap-engine.ts` busca el DNA por id exacto, sin alias (`canonicalSkillKey`); solo afecta a DNA
  histórico guardado con claves no canónicas.
- **B3/B4** Configurar `GROQ_API_KEY` + `FIREBASE_SERVICE_ACCOUNT` en Netlify (ver DEPLOYMENT).
- **#4** Migrar el SDK crudo de Firestore de las páginas restantes (`dashboard`, `vacancies`, `vacancies/new`)
  a métodos de `JobService` (regla CLAUDE.md §4.2.7). `candidates` ya migrado en la Fase 8.
- **#10** Compartir el perfil entre `AuthGuard` y `DashboardShell` (evitar doble lectura y flash de nav).
- **#13** CTAs de landing que preseleccionen rol/registro en el modal.
- Reducir warnings de ESLint; tests de reglas con emulador en CI.
