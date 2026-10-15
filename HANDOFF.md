> **Nota (2026-10):** este handoff es un registro histórico de la rama `fix/system-hardening`. El estado
> actual del sistema está en [`docs/CONTEXT.md`](./docs/CONTEXT.md) y las variables de entorno en `.env.example`.

# Handoff / Notas para el equipo — NEXTAPE

> Escribo esto antes de cerrar por hoy para que puedan seguir sin bloquearse. Resumo qué dejé hecho,
> qué falta, cuál es el enfoque y qué pueden ir tomando cada uno. Todo está en la rama
> **`fix/system-hardening`** (ya pusheada). Si algo no cuadra, la fuente de verdad es el código y los
> documentos de `docs/`.

---

## 1. Qué hice hoy (resumen)

Le hice una limpieza y un endurecimiento fuerte al proyecto. En orden:

- **Limpieza de código muerto** (~99k líneas): borré `estructura.txt`, `tailwing.config.ts`, rutas
  top-level que eran stubs, `dashboard/digital-twin`, todo `src/features/*` (estaban vacíos), el stack 3D
  (`three` + `laptop.glb`) que no se usaba, `ui/calendar.tsx`, y placeholders sueltos.
- **Tipos consolidados:** eliminé el `UserProfile` legacy duplicado; `src/types/index.ts` ahora es un barrel.
- **Bugs de runtime y lógica:** arreglé `vacancies` (crasheaba por imports), la landing (botón + sección
  "cómo funciona"), construí la página de **Candidatos**, unifiqué el cálculo del "grade" (`src/lib/grading.ts`),
  y metí un hook `useAuthUser` para quitar el race de `auth.currentUser` que estaba en varias páginas.
- **Integridad del DNA (lo más importante):** moví el scoring y la escritura del DNA **al servidor**.
  Ahora hay route handlers en `src/app/api/*` (`line/start`, `line/submit`, `jobs/assessment`) que usan
  el **Firebase Admin SDK** y verifican el token del usuario. El cliente ya **no** puede escribir su propio
  DNA (reglas `write:false`) y la respuesta correcta de las preguntas **nunca** llega al navegador.
- **Config y calidad:** quité `ignoreBuildErrors`, arreglé el script de build (no funcionaba en Windows),
  moví la config de Firebase a variables de entorno, configuré **ESLint**, **tests con Vitest** y **CI**
  en GitHub Actions.
- **Documentación:** dejé todo el contexto del sistema en `docs/` y monté "harness engineering"
  (`CLAUDE.md` + agentes en `.claude/agents/`) para que trabajar con IA en este repo sea coherente.

**Estado verificado:** `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` pasan en verde.

---

## 2. El enfoque (para que lo tengamos claro)

- **La integridad es el core del producto.** Vendemos "DNA técnico verificado", así que nada de lo que
  determina un score puede vivir en el cliente. Regla de oro: **cualquier dato "verificado" se escribe solo
  en servidor** (route handlers + Admin SDK), autenticando el token. Si alguien necesita escribir scores o
  validar respuestas desde el navegador, es un no rotundo.
- **Firebase es solo Auth + Firestore.** El hosting es **Netlify** (los `/api/*` corren como Netlify
  Functions). Por eso el Admin SDK necesita un service account por variable de entorno (ver punto 3).
- **Documentar mientras cambiamos.** Si tocan arquitectura, datos, seguridad o IA, actualicen el `.md`
  correspondiente en `docs/` en el mismo cambio. Está todo indexado en `docs/README.md`.
- **No reintroducir lo que limpié** (`src/features`, rutas top-level, el `UserProfile` legacy). Si hace
  falta algo de eso, lo hablamos primero.

---

## 3. Lo urgente / que falta (necesita acceso a Netlify + Firebase)

Esto lo hago yo o quien tenga los accesos, pero lo dejo escrito porque **sin esto la app en producción no
funciona del todo** (el nuevo pipeline de servidor necesita credenciales). Guía completa en
**`docs/DEPLOYMENT.md`**. Resumen:

1. Crear un **service account** en Firebase y ponerlo como variable `FIREBASE_SERVICE_ACCOUNT` en Netlify.
2. Poner la **API key de Groq** como `GROQ_API_KEY` en Netlify (el proyecto ya no usa Gemini).
3. En Firebase Auth: habilitar los proveedores y **añadir el dominio de Netlify** a los dominios autorizados.
4. Desplegar las reglas: `firebase deploy --only firestore:rules,storage:rules`.
5. Redeploy en Netlify y correr el checklist de verificación de `docs/DEPLOYMENT.md`.

Hasta que esto esté, **The LINE, el roadmap y la generación de pruebas van a fallar** en el deploy (antes
funcionaban en cliente; ahora dependen del servidor).

---

## 4. Para el equipo — lo que pueden ir tomando ya

Ordenado por prioridad. Cada tarea dice qué agente/área encaja (ver `.claude/agents/`) y por dónde empezar.

### ✅ Motor de matching de candidatos (A4) — *resuelto (2026-07-22)*
Cerrado el loop developer→recruiter. Al hacer la prueba de una vacante (con `jobId`), `/api/line/submit`
escribe/actualiza `candidate_matches` en **servidor** (Admin SDK) con el `score` de The LINE, `matchPercent`
y snapshot de `skills`, y suma `applicantsCount` la primera vez. El tipo pasó a `CandidateMatch` (con
`recruiterId`, ya alineado con la regla) y el reclutador ve el ranking en `/dashboard/candidates`
(`CompatibilityService.getMatchesForRecruiter`).
- Referencias: `src/app/api/line/submit/route.ts`, `firestore.rules`, `docs/CHANGELOG_FIXES.md` (Fase 8),
  `docs/DATABASE.md`, `docs/TECH_DEBT.md` (A4).

### 🟠 Tests de reglas con el emulador en CI — *QA*
Ya dejé los tests escritos en `src/lib/firebase/rules.test.ts` (se saltan si no hay emulador).
- Añadir un paso en `.github/workflows/ci.yml` que levante el emulador de Firestore y los corra.
- Referencia: `docs/PRODUCTION_READINESS.md` (Fase 5), agente `qa-test-engineer`.

### 🟠 Reducir los warnings de ESLint — *tarea buena para arrancar*
`npm run lint` pasa (0 errores) pero deja **24 warnings** (`any` y imports sin usar). Ir tipando y limpiando.
- Empezar por los imports sin usar (rápido) y luego los `any` de estado de listas.

### 🟡 Perfil editable — *frontend*
`src/app/dashboard/profile/page.tsx` es solo lectura y no muestra avatar/`githubUrl` aunque están en el tipo.
- Añadir edición de perfil (nombre, github) escribiendo en `users/{uid}` (owner write, ya permitido).

### 🟡 Coherencia del roadmap — *backend/IA*
El roadmap llama a la IA con un server-action directo, distinto al patrón de The LINE. Funciona, pero por
coherencia se puede mover a un route handler. Además la UI no muestra `summary` ni `resources` que sí se generan.

### 🟡 Limpieza de sesiones (`line_sessions`) — *infra/DB*
Si un usuario abandona una simulación a mitad, queda un doc huérfano. Activar una **TTL policy** de Firestore
sobre `createdAt` para que se limpien solas.

### 🟡 Decisión de producto: visibilidad de candidatos (C2)
Hoy `users` es de lectura solo para el dueño, así que un reclutador **no puede ver perfiles de candidatos**.
Cuando armemos el matching, hay que decidir qué expone el candidato y ajustar reglas (con cuidado).

---

## 5. Cómo trabajar en este repo (para que no se rompa lo de hoy)

- **Comandos:** `npm run dev` (:9002), `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
  Antes de dar algo por terminado, que pasen typecheck + lint + test (es lo que valida CI).
- **Reglas absolutas** (obligatorias): están en `CLAUDE.md`. Las críticas:
  - Nada de escribir datos verificados desde el cliente; eso va en `/api/*` con Admin SDK.
  - Nunca enviar `correctIndex` al cliente.
  - Toda colección nueva necesita su regla en `firestore.rules` en el mismo cambio.
  - Nada de secretos en el repo (`.env*` está en `.gitignore`; usar variables de entorno de Netlify).
- **Contexto:** empiecen por `docs/README.md` → `docs/ARCHITECTURE.md`, y el `.md` del área que toquen.
- **Agentes:** en `.claude/agents/` hay uno por área (frontend, backend/IA, base de datos, seguridad,
  revisor de IA, QA, devops). Si usan Claude en el repo, arrancan con el contexto correcto.

---

## 6. Cierre

Quedó todo compilando y en verde. Lo que **bloquea el deploy** es la config de credenciales (punto 3), que
resuelvo yo o quien tenga los accesos. Lo demás del punto 4 se puede ir tomando en paralelo sin pisarse.

Cualquier duda, la respuesta probablemente está en `docs/` o en `CLAUDE.md`. Nos vemos mañana.

— (equipo NEXTAPE)
