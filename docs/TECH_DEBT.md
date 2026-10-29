# NEXTAPE — Deuda Técnica e Inconsistencias

> Registro consolidado de inconsistencias, bugs y deuda detectados en la revisión de la rama `migration`.
> Prioridad: 🔴 bloqueador de producción · 🟠 importante · 🟡 menor/cosmético.
> Cada ítem indica archivo(s) y acción sugerida.

## Estado de resolución (rama `fix/system-hardening`)

Ver detalle en [`CHANGELOG_FIXES.md`](./CHANGELOG_FIXES.md).

- ✅ **Resueltos:** **B1, B2, B5, B6, B7, B8**, C1(modelo IA doc), **C3**, **A1, A2, A3, A4, A5, A7**, **R1–R7**,
  y **B3** en su mayoría (proyecto canónico `studio-...` fijado + config por env; falta solo el secreto de
  Gemini en hosting). Además: bugs de landing, botones no-op, hook de auth, util de grading, `ui/calendar`
  muerto, script de build no multiplataforma. **Integridad (B2): scoring/DNA movido a servidor** (Admin SDK,
  route handlers `/api/*`); el DNA ya **no es falsificable en cliente** y el `correctIndex` no sale al navegador.
- ✅ **Calidad/CI:** ESLint configurado (0 errores), tests con Vitest (14 pasan; reglas listas para emulador),
  CI en GitHub Actions (typecheck+lint+test+build).
- ⏳ **Pendientes:** `GROQ_API_KEY` + credenciales Admin en Netlify; **A6** (media de últimos 3 intentos,
  si se mantiene); reducir 24 warnings de ESLint; correr los tests de reglas contra el emulador en CI;
  visibilidad de `users` para reclutadores (C2).

## 🔴 Bloqueadores de producción

| # | Problema | Archivo(s) | Acción sugerida |
|---|---|---|---|
| B1 | **Reglas bloquean crear vacantes**: `jobs write: if false`, pero el reclutador crea/actualiza `jobs` desde cliente. | `firestore.rules`, `dashboard/vacancies/new/page.tsx`, `services/jobs.service.ts` | Permitir write a `role==recruiter` dueño (`createdBy==uid`) o mover a Cloud Function con Admin SDK. |
| B2 | **DNA falsificable**: scoring y escritura de `user_skill_scores` ocurren en cliente (owner-write). El `correctIndex` viaja al navegador. Anula el "DNA verificado". | `firestore.rules`, `dashboard/line/page.tsx`, `services/skills.service.ts`, `ai/flows/generate-assessment-flow.ts` | Scoring en servidor (Cloud Function/Admin SDK); no enviar `correctIndex`; `user_skill_scores` write `if false` para clientes. |
| B3 | **Mismatch de `projectId`**: app usa `studio-4462619429-470d8`; `.firebaserc` despliega a `nextape-prod`. Reglas podrían no aplicar al proyecto real. | `src/lib/firebase/client.ts`, `.firebaserc` | Unificar en un único proyecto; mover config a `.env` (`NEXT_PUBLIC_*`). |
| B4 | **`GROQ_API_KEY` no configurada** en hosting → flows IA fallan en prod. | `ai/genkit.ts`, Netlify env | Declarar `GROQ_API_KEY` como variable de entorno en Netlify (ver DEPLOYMENT). |
| B5 | **Build ignora errores** de TS y ESLint → se puede desplegar código roto. | `next.config.ts` | Quitar `ignoreBuildErrors`/`ignoreDuringBuilds`; arreglar errores; CI con `typecheck`+`lint`. |
| B6 | **`vacancies/page.tsx` rompe en runtime**: usa `<Terminal>` y `<Briefcase>` sin importar. | `dashboard/vacancies/page.tsx` | Importar iconos de `lucide-react`. |
| B7 | **Storage con lectura pública total** (`read: if true`). Cualquier archivo de usuario es público. | `storage.rules` | Restringir lectura; separar carpetas públicas/privadas; validar tipo/tamaño. |
| B8 | **`assessment_attempts` listable por cualquiera** (`list` sin filtro de `userId`). | `firestore.rules` | Filtrar `list` por `userId == request.auth.uid`. |

## 🟠 Inconsistencias de arquitectura / modelo

| # | Problema | Archivo(s) | Acción |
|---|---|---|---|
| A1 | **Dos `UserProfile` incompatibles**: `types/index.ts` (legacy: username/grade/skills) vs `types/user.types.ts` (real). | `types/index.ts`, `features/core/*` | Eliminar el legacy; migrar consumidores a `user.types.ts`. |
| A2 | **Colección `core` fantasma**: `CoreService`/`useCore` leen/escriben `core`, sin regla (denegado) y usando el tipo legacy. Código muerto/roto. | `features/core/services/core.service.ts`, `features/core/hooks/useCore.ts` | Borrar el módulo o crear regla + tipo. El CORE real vive en `user_skill_scores`. |
| A3 | **Dos arquitecturas a medias**: `src/features/*` (stubs vacíos) vs `src/services/*` (real). | `src/features/*` | Decidir una; hoy usar `services`. Borrar stubs `AuthService={}`, `useAssessment`, `CompatibilityEngine`. |
| A4 | ✅ **Resuelto (2026-07-22).** El tipo pasó a `CandidateMatch` (con `recruiterId`, `score`, `matchPercent`, `skills` snapshot); `/api/line/submit` escribe `candidate_matches` al postular con The LINE (Admin SDK, conserva mejor `score`, incrementa `applicantsCount`); `CompatibilityService.getMatchesForRecruiter` + `/dashboard/candidates` rankean candidatos por vacante. La regla (ya usaba `recruiterId`) quedó alineada. | `types/job.types.ts`, `app/api/line/submit/route.ts`, `services/compatibility.service.ts`, `services/jobs.service.ts`, `dashboard/candidates/page.tsx` | — |
| A5 | **`assessment_attempts` nunca se escribe**: The LINE salta esta colección → historial y métrica "Simulaciones" vacíos. | `dashboard/line/page.tsx`, `services/assessments.service.ts` | Persistir cada intento al terminar la simulación. |
| A6 | ✅ **Resuelto (2026-10).** El DNA es el promedio de los últimos 3 intentos por skill, ponderados por nivel (junior ×0.6, mid ×0.8, senior ×1). Junto con: 1 intento cada 24 h por tecnología/vacante, 30 min de tiempo (configurable por vacante), opciones barajadas por sesión y prioridad a preguntas no vistas. | `src/lib/server/line-policy.ts`, `src/app/api/line/*` | — |
| A7 | **The LINE solo guarda 1 skill** (`questions[0].tag`) aunque evalúe varias; y **sobrescribe** (reintento peor baja el score). | `dashboard/line/page.tsx` | Puntuar por tag y agregar (max/promedio) por skill. |
| A9 | **Límites de GitHub por cuenta, no por persona** (2026-09-14). `repos` 12/h, `evaluate` 150/h y `aggregate` 20/h por uid protegen el `GITHUB_TOKEN` compartido (5000 req/h) de un usuario con un script, pero varias cuentas pueden sumar cuota. Si raw.githubusercontent.com falla, cada `evaluate` cae a la API de contenidos (~17 peticiones). | `src/lib/server/rate-limit.ts`, `src/services/github-signals.service.ts` | Añadir un contador global (o por IP) antes de escalar tráfico real, o un token de GitHub por usuario (OAuth). |
| A10 | ✅ **Resuelto (2026-10).** El roadmap resuelve el DNA por clave canónica y, además, por las tecnologías que evidencian cada skill del catálogo (`src/lib/skill-technology-map.ts`), que era el problema de fondo (CONTEXT §9, H1). | `src/lib/roadmap-engine.ts`, `src/lib/skill-technology-map.ts` | — |
| A11 | **Vacantes de producción sin dueño ni skills**: `job_1` y `job_2` son seed de un esquema anterior (sin `createdBy` ni `requiredSkills`); están ocultas del listado y no pueden tener The LINE ni entregar candidaturas. | Firestore `jobs` | Decidir: borrarlas o migrarlas a una cuenta de reclutador con skills del catálogo. |
| A8 | **Superficie de escritura activa sin uso en `user_roadmaps/{uid}`**: la regla `write: if isOwner(userId)` permanece activa en `firestore.rules`, pero el MVP del Roadmap Determinístico calcula on-demand client-side y no persiste snapshots. No compromete el DNA verificado (aislado por owner), pero representa una superficie de escritura sin consumidor activo. | `firestore.rules`, `docs/DATABASE.md`, `src/services/roadmap.service.ts` | Mantener documentada para V2 (cuando se active el historial de progreso/diffs) o restringir a `write: if false` hasta que V2 lo requiera. |

## 🟠 Inconsistencias de contenido / docs

| # | Problema | Acción |
|---|---|---|
| C1 | ✅ **Resuelto.** Migrado a **Groq** por coste; hoy con GPT-OSS (`gpt-oss-120b` → `gpt-oss-20b`), porque Llama 3.3 salió del plan gratuito. Modelo centralizado en `genkit.ts` (`GROQ_MODEL`). `blueprint.md` (histórico) aún menciona Gemini. |
| C2 | Blueprint dice `users` con lectura pública para reclutadores; la regla es **owner-only** → rompe el journey de reclutador. | Decidir modelo de visibilidad de candidatos y alinear reglas + blueprint. |
| C3 | Umbrales de "grade" divergen entre `core` y `profile`. | Extraer a una única función util de grading. |
| C4 | `company` hardcodeado a `"Empresa NEXTAPE"` en toda vacante; telemetría falsa ("12ms/Encrypted"); `totalApplicants:0`; fallbacks de roadmap/stackMap hardcodeados. | Sustituir por datos reales / marcar claramente como demo. |

## 🟡 Limpieza de repositorio (archivos basura)

| # | Archivo | Problema | Acción |
|---|---|---|---|
| R1 | `estructura.txt` (1.8 MB, 98k líneas) | Volcado de `ls -R` **incluyendo `node_modules`**, commiteado por error. | Borrar y añadir a `.gitignore`. |
| R2 | `tailwing.config.ts` | Duplicado **idéntico** de `tailwind.config.ts` (typo en el nombre). | Borrar. |
| R3 | `.modified` | Archivo vacío (artefacto de IDX). | Borrar. |
| R4 | Rutas top-level `src/app/{line,jobs,roadmap,profile,compatibility,digital-twin}/page.tsx` | Stubs `return null` (código muerto). | Borrar. |
| R5 | `src/app/dashboard/digital-twin/page.tsx` | `ObsoletePage` que retorna `null`. | Borrar. |
| R6 | `three` / `@react-three/*` / `public/models/laptop.glb` | Instalados pero **0 usos** en `src`. | Borrar del `package.json` y el asset, o implementar el visor 3D. |
| R7 | `src/app/lib/placeholder-images.json` vs `src/lib/placeholder-images.*` | Posible duplicado de imágenes placeholder. | Consolidar en un único origen. |

## 🟡 Bugs menores / UX

- Landing: botón "Soy Reclutador/Empresa" sin `onClick`; ancla `#how-it-works` sin destino; typos Tailwind `sm:row`, `md:row`.
- `compatibility`: botones "Recalcular Auditoría" / "Aplicar con Identity" sin handler.
- Varias páginas usan `auth.currentUser` en `useEffect` sin esperar `onAuthStateChanged` (frágil; dependen del `AuthGuard`).
- `SkillsService.updateSkillScore` usa `new Date()` en vez de `Timestamp.now()`.
- Profile no es editable; avatar/`githubUrl` no se muestran.
- `src/ai/dev.ts` vacío → los flows no se registran en Genkit Dev UI.
- The LINE sin guard cuando `questions` llega vacío (crash potencial).

## ✅ Complejidad cognitiva en scripts (SonarJS S3776) — resuelto 2026-10-29

Los `main()` de los scripts de CLI se partieron en pasos con nombre y la lógica pura pasó a `scripts/lib/`
con tests (`grow-pool`, `pool-inventory`, `skill-catalog-seed`). `seed-question-bank` se probó con `--dry-run`;
`verify-roadmap-engine` ahora es un gate real (sale con 1 si una invariante falla), corre sin credenciales
contra `scripts/data/skill-catalog.json` (`npm run verify:roadmap`, también en CI) y usa `--firestore` para
producción.

## Notas de proceso

- **No modificar** este comportamiento sin acordarlo con el equipo (3 personas). Este archivo es el
  backlog compartido; al resolver un ítem, marcarlo y enlazar el commit/PR.
- Antes de "ir a producción", priorizar todos los 🔴 y B-items. Ver `docs/PRODUCTION_READINESS.md`.
