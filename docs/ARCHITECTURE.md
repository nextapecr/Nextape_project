# NEXTAPE — Arquitectura del Sistema

> Documento maestro de arquitectura. Para detalle por área ver:
> [DATABASE](./DATABASE.md) · [SECURITY](./SECURITY.md) · [BACKEND_AI](./BACKEND_AI.md) ·
> [FRONTEND](./FRONTEND.md) · [TECH_DEBT](./TECH_DEBT.md) · [PRODUCTION_READINESS](./PRODUCTION_READINESS.md).

## 1. Qué es NEXTAPE

Plataforma de evaluación técnica que valida el **"DNA técnico"** de desarrolladores mediante
simulaciones generadas por IA ("The LINE"), construye una identidad técnica persistente (**CORE**),
genera **roadmaps** de mejora y calcula **compatibilidad** con vacantes. Dos roles: `developer` y `recruiter`.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15.5** (App Router, RSC) + **React 19** |
| Lenguaje | TypeScript 5 (`strict: true`, alias `@/* → src/*`) |
| UI | **shadcn/ui** (Radix + CVA) + **Tailwind CSS 3** |
| Auth/DB/Storage | **Firebase** Web SDK v11 (Auth, Firestore, Storage) |
| IA | **Genkit 1.28** + **`genkitx-groq`** — proveedor **Groq**, modelo `groq/openai/gpt-oss-120b` (fallback automático a `gpt-oss-20b`) |
| Formularios | react-hook-form + zod + `@hookform/resolvers` |
| Gráficos | recharts |
| Hosting | **Netlify** (`netlify.toml` + `@netlify/plugin-nextjs`); route handlers `/api/*` = Netlify Functions. Firebase solo Auth+Firestore. Ver [DEPLOYMENT](./DEPLOYMENT.md). |
| Entorno dev | Firebase Studio / Project IDX (`.idx/dev.nix`, Node 22) — usa backends de **producción** |
| Dev server | `next dev --turbopack -p 9002` |

## 3. Patrón arquitectónico: Monolito Modular + capa de confianza en servidor

- **Firebase como backend gestionado**: el cliente LEE datos vía Web SDK, sujeto a `firestore.rules`.
- **Capa de confianza en servidor** (`src/app/api/*`, route handlers con runtime Node): todo lo sensible
  —scoring, corrección de respuestas, escritura del DNA/intentos, generación de pruebas— ocurre aquí con el
  **Firebase Admin SDK** (`src/lib/firebase/admin.ts`), que bypassa las reglas. El cliente llama con `apiPost`
  adjuntando su ID token, verificado en servidor.
- **IA**: los flows de Genkit (`src/ai/flows`, `'use server'`) se invocan desde los route handlers.
- Consecuencia: los datos "verificados" (DNA) son **write:false** para el cliente; su integridad no depende
  del navegador. (Ver SECURITY / BACKEND_AI.)

### Excepción consciente al patrón server-trust: Roadmap Determinístico
El cómputo del Roadmap (`src/lib/roadmap-engine.ts`) se ejecuta **directamente en el cliente** (`RoadmapPage`), sin pasar por un route handler / Admin SDK.
- **Justificación:** El Roadmap es una operación 100% de **sólo lectura y cálculo en memoria**. No escribe ni modifica ningún dato verificado (el DNA sigue protegido con `write:false` y el catálogo `skill_catalog`/`roadmap_routes` es inmutable para el cliente).
- **Beneficio:** Cero latencia de servidor adicional y reactividad instantánea ante cambios de rol en la UI sin comprometer la integridad del sistema.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (App Router · React 19 · 'use client')             │
│   app/ (rutas) → services/ (LECTURA) → lib/firebase/client   │
│                └── lib/api.ts (apiPost + ID token) ──┐        │
└──────────────┬──────────────────────────────────────┼────────┘
               │ read (rules)                          │ POST /api/* (Bearer token)
               ▼                                        ▼
        Firebase (Auth/Firestore)          Route handlers (Node) ── Admin SDK ─► Firestore
                                            └── ai/flows (Genkit) ─► Groq (GPT-OSS 120B/20B)
               ▲ writes de confianza (DNA, intentos, claves) SOLO desde aquí ─────┘
```

## 4. Estructura de carpetas (`src/`)

> Actualizado tras el saneamiento (`fix/system-hardening`): eliminados `src/features`, las rutas
> top-level muertas, `dashboard/digital-twin`, el stack 3D y los placeholders sin uso. Ver `CHANGELOG_FIXES.md`.

```
src/
├─ app/                      # Rutas (App Router)
│  ├─ layout.tsx             # Root layout (fuentes Google, html lang=es)
│  ├─ page.tsx               # Landing pública (con sección #how-it-works)
│  ├─ auth/                  # Página de auth
│  └─ dashboard/             # App autenticada (AuthGuard + DashboardShell)
│     ├─ layout.tsx          # <AuthGuard><DashboardShell>
│     ├─ page.tsx            # Panel/Resumen (según role)
│     ├─ line/               # "The LINE" — simulación técnica IA
│     ├─ core/               # CORE — DNA técnico
│     ├─ roadmap/            # Roadmap IA
│     ├─ jobs/               # Vacantes + match (developer)
│     ├─ compatibility/      # Compatibilidad
│     ├─ profile/            # Perfil
│     ├─ candidates/         # Reclutador: candidatos por vacante
│     └─ vacancies/          # Reclutador: listado + new/
├─ components/
│  ├─ ui/                    # shadcn/ui (~44 componentes)
│  ├─ auth/                  # AuthGuard, AuthModal
│  └─ layout/                # DashboardShell (sidebar + nav por role)
├─ services/                 # ✅ Capa de datos (users, skills, jobs, assessments, compatibility)
├─ lib/
│  ├─ firebase/              # client, auth, firestore, storage (Web SDK)
│  ├─ grading.ts             # getTechnicalGrade / calculateAverageScore (fuente única)
│  └─ utils.ts               # cn()
├─ hooks/                    # use-mobile, use-toast, use-auth-user
├─ types/                    # user, assessment, job, firebase, index (barrel)
└─ ai/                       # genkit.ts, dev.ts, flows/ (assessment, roadmap)
```

### Convención de módulos (ya consolidada)
La lógica de datos vive en **`src/services/*`** y los tipos canónicos en **`src/types/*.types.ts`**
(con `src/types/index.ts` como barrel). El antiguo `src/features/*` (stubs) y el `UserProfile` legacy
fueron eliminados. **No reintroducir** `src/features` sin una decisión de equipo.

## 5. Mapa de rutas

**Públicas:** `/`, `/auth`
**API (route handlers, server-trust):** `/api/line/start`, `/api/line/submit`, `/api/line/catalog`, `/api/jobs/assessment`,
`/api/github/repos`, `/api/github/evaluate`, `/api/github/aggregate`
**Dashboard (protegidas por `AuthGuard`):**
`/dashboard`, `/dashboard/line`, `/dashboard/core`, `/dashboard/roadmap`, `/dashboard/jobs`,
`/dashboard/compatibility`, `/dashboard/profile`, `/dashboard/candidates`,
`/dashboard/vacancies`, `/dashboard/vacancies/new`.

**Navegación por role** (`DashboardShell`):
- **developer:** Panel, The LINE, CORE, Roadmap, Empleos, Compatibilidad, Perfil.
- **recruiter:** Resumen, Mis Vacantes, Publicar, **Candidatos**.
- ✅ Las rutas top-level muertas y `dashboard/digital-twin` fueron eliminadas; `/dashboard/candidates` existe.

## 6. Flujos principales (user journeys)

### Developer
1. Landing → `AuthModal` (registro con role=developer).
2. `/dashboard` → resumen del DNA.
3. `/dashboard/line` → elige tecnología+nivel → `/api/line/start` (sortea de un banco precargado 10 preguntas si
   tiene GitHub analizado o 20 si no, sin la respuesta) → responde → `/api/line/submit` (**score calculado y escrito EN SERVIDOR** con Admin SDK) → CORE.
4. `/dashboard/core` → visualiza DNA técnico.
5. `/dashboard/roadmap` → IA genera plan según skills/gaps.
6. `/dashboard/jobs` → match% = `calculateMatch(job.requiredSkills, user.scores)`.

### Recruiter
1. Registro con role=recruiter (auto-asignado).
2. `/dashboard/vacancies/new` → crea vacante (`jobs`, skills elegidas del catálogo con banco) y
   `/api/jobs/assessment` compone su "The LINE" desde el banco, sin IA.
3. `/dashboard/vacancies` → listado.
4. `/dashboard/candidates` → candidatos rankeados por DNA → **implementado (A4)**: cuando un developer
   postula tomando The LINE de una vacante, `/api/line/submit` escribe `candidate_matches` (server-trust);
   la página agrupa por vacante y rankea a los candidatos por su `score` de The LINE, mostrando `matchPercent`.

## 7. Comandos

```bash
npm run dev          # Next dev (turbopack) en :9002
npm run genkit:dev   # Genkit dev UI (⚠️ dev.ts vacío: no registra flows)
npm run build        # next build (NODE_ENV=production)
npm run start        # next start
npm run lint         # next lint
npm run typecheck    # tsc --noEmit  ← usar para validar tipos (el build los ignora)
```

## 8. Estado de madurez

MVP en migración a Next.js 15 + Genkit. **Frontend/UI avanzado**; **backend de confianza inexistente**;
varias inconsistencias y bloqueadores para producción documentados en
[TECH_DEBT](./TECH_DEBT.md) y [PRODUCTION_READINESS](./PRODUCTION_READINESS.md).
