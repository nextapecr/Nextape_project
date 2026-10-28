# NEXTAPE — Frontend

> Fuente de verdad: `src/app/*`, `src/components/*`, `tailwind.config.ts`, `src/app/globals.css`.

## 1. Framework y convenciones

- **Next.js 15 App Router + React 19.** Casi todas las páginas son **Client Components** (`"use client"`)
  porque dependen del Firebase Web SDK y de estado/efectos. RSC se usa solo en `app/layout.tsx`.
- Alias de import: `@/… → src/…`.
- Datos: los componentes llaman a `src/services/*` (o a helpers de `src/lib/firebase/*`). Evitar SDK crudo en páginas nuevas.
- Fuentes cargadas en `layout.tsx`: **Playfair Display** (headline, `italic` de marca) y **DM Sans** (body).
  `tailwind.config` nombra "SF Pro Display"/"SF Mono" pero **no se cargan** (fallback a system/DM Sans).

## 2. Mapa de rutas (estado real)

### Activas — `src/app/dashboard/*`
| Ruta | Rol | Descripción | Escribe |
|---|---|---|---|
| `/dashboard` | ambos | Panel bifurcado por `role` (métricas DNA / vacantes) | — |
| `/dashboard/line` | developer | **The LINE**: simulación IA, quiz, scoring | `user_skill_scores` |
| `/dashboard/core` | developer | **CORE**: DNA técnico (barras) + grade S/A+/A/B/C | — |
| `/dashboard/roadmap` | developer | Roadmap IA (pasos, prioridad) | `user_roadmaps` |
| `/dashboard/jobs` | developer | Vacantes + match% + búsqueda | — |
| `/dashboard/compatibility` | developer | "Rank index" /10 (decorativo en parte) | — |
| `/dashboard/profile` | developer | Perfil **solo lectura** + DNA + perfil profesional (enlace a editar) | — |
| `/dashboard/onboarding` | developer | Cuestionario del candidato en 4 pasos (sobre ti, experiencia, estudios, extras). Se abre tras registrarse como candidato; el panel avisa si falta | `users.candidateProfile` |
| `/dashboard/candidates` | recruiter | Candidatos por vacante (métricas + estado del ranking) + "Ver perfil profesional" de cada uno | — |
| `/dashboard/vacancies` | recruiter | Listado de vacantes propias | — |
| `/dashboard/vacancies/new` | recruiter | Crear vacante + generar prueba IA | `jobs` ✅ (reglas corregidas) |

### Públicas
- `/` — Landing (marketing; incluye sección `#how-it-works`; `AuthModal`).
- `/auth` — Redirige a `/dashboard` si hay sesión; si no, `AuthModal` embebido.

### Código muerto — ✅ eliminado
Las rutas top-level stub (`/line`, `/jobs`, …), `dashboard/digital-twin` (obsoleto) y `ui/calendar.tsx`
fueron **eliminados** en `fix/system-hardening`. El módulo real "digital twin" es **CORE** (`dashboard/core`).

## 3. Layout y navegación

- `app/dashboard/layout.tsx` = `<AuthGuard><DashboardShell>{children}</DashboardShell></AuthGuard>`.
- **`AuthGuard`** (`components/auth/AuthGuard.tsx`): escucha `onAuthStateChanged`; sin usuario en
  `/dashboard/*` → redirige a `/`. Protección **solo de cliente**. Reintenta leer el perfil (5×500ms)
  y hace fail-open (deja pasar) ante errores. No es control de acceso a datos.
- **`DashboardShell`** (`components/layout/DashboardShell.tsx`): sidebar fija (desktop) + `Sheet` (mobile).
  Menú **según `profile.role`**:
  - developer: Panel, The LINE, CORE, Roadmap, Jobs, Compatibilidad, Perfil.
  - recruiter: Resumen, Mis Vacantes, Publicar, **Candidatos**.
  - ✅ "Candidatos" → `/dashboard/candidates` ya existe (página construida).

## 4. Autenticación en UI — `AuthModal`

- Login/registro por Email/Password + Google + GitHub (popup).
- En registro escribe `users/{uid}` con el `role` elegido en un `RadioGroup` (developer/recruiter).
- Tras éxito → `router.push("/dashboard")`. Usa `useToast` para feedback.

## 5. Sistema de diseño

- **shadcn/ui** (~45 componentes en `components/ui/`, Radix + `class-variance-authority`). `cn()` en `lib/utils.ts`.
- **Estilo visual "Apple-like":** fondo `#F5F5F7`, tarjetas blancas muy redondeadas
  (`rounded-[2.5rem]`, `rounded-3xl`), sombras `shadow-apple` / `shadow-apple-lg`, tipografía en
  `italic` para titulares, mucho `uppercase tracking-widest`.
- **Paleta de marca** (HSL en `globals.css`, expuesta como `brand-*` en Tailwind):
  `brand-blue #00ACEE` (primario), `brand-green #00A44E`, `brand-red #E52521`, `brand-orange #F48E1F`,
  `brand-yellow #FADD1A`, `brand-purple #5C3193`.
- **Dark mode:** hay variables `.dark` definidas en `globals.css` y `darkMode:['class']`, pero **no hay
  toggle** ni se aplica la clase `dark` en ningún sitio. Efectivamente la app es solo light.
- Gráficos: `recharts` vía `components/ui/chart.tsx` (mapea series a `brand-*`).

## 6. Gestión de estado

- **Local por página** con `useState`/`useEffect`. No hay store global (Redux/Zustand/Context de datos).
- El "estado de sesión" se obtiene con el hook **`src/hooks/use-auth-user.ts`** (`useAuthUser`), que
  envuelve `onAuthStateChanged` y expone `{ user, authLoading }`. ✅ Ya aplicado en dashboard, core,
  profile, jobs, compatibility, vacancies y candidates (antes leían `auth.currentUser` con race). Úsalo
  en toda página nueva que dependa del usuario.
- Toasts: `hooks/use-toast.ts` (patrón shadcn). Detección mobile: `hooks/use-mobile.tsx`.

## 7. Assets 3D huérfanos

- `public/models/laptop.glb` + dependencias `three`, `@react-three/fiber`, `@react-three/drei`
  están instaladas **pero sin ningún uso en `src`** (0 referencias). Peso muerto de una idea de
  "digital twin 3D" reemplazada por la UI de barras de CORE. Ver TECH_DEBT.

## 8. Bugs de frontend — estado

✅ **Resueltos** (`fix/system-hardening`): imports faltantes en `vacancies` (crash); nav a
`/dashboard/candidates` (página construida); landing (botón reclutador, ancla `#how-it-works`, typo
`sm:row`); botones no-op de `compatibility`; umbrales de "grade" unificados (`lib/grading.ts`); guard de
The LINE con `questions` vacío; métrica "Simulaciones" (ahora se escribe `assessment_attempts`); race de
`auth.currentUser` (hook `use-auth-user`).

⚠️ **Pendientes (menores):** Profile no es editable y no muestra avatar/`githubUrl`; contenido de
marketing/`company` hardcodeado; sin dark-mode toggle.

## 9. Reglas para nuevas pantallas

- Client Component (`"use client"`) si toca Firebase/estado; consumir `src/services/*`, no el SDK directo.
- Reutilizar `components/ui/*` (shadcn) y las utilidades de marca (`brand-*`, `shadow-apple`, `rounded-[2.5rem]`).
- Toda ruta bajo `/dashboard` hereda `AuthGuard`; no re-implementar guardas.
- Esperar el estado de Auth con `onAuthStateChanged` antes de leer datos del usuario (no asumir `auth.currentUser`).
- Nueva entrada de navegación → añadirla en `DashboardShell` **y** crear la página (evitar enlaces rotos).
- No añadir páginas top-level fuera de `/dashboard`: consolidar todo bajo `/dashboard`.
