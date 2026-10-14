# NEXTAPE — Contratación técnica, reinventada

Plataforma de evaluación técnica que construye el **"DNA técnico verificado"** de cada desarrollador y lo
conecta con vacantes. Dos roles: `developer` y `recruiter`.

- **The LINE** — examen por tecnología y nivel (junior / mid / senior), o por vacante. Preguntas
  precargadas, corrección en servidor, 1 intento cada 24 h y tiempo límite. **Única fuente del DNA.**
- **CORE** — el DNA: una nota por tecnología (promedio de los últimos 3 intentos, ponderado por nivel).
- **GitHub** — analiza el código real de tus repositorios (AST con tree-sitter) en 5 dimensiones de ingeniería.
- **Roadmap** — plan de mejora determinista hacia un rol y nivel, alimentado por The LINE y GitHub.
- **Vacantes y candidatos** — el reclutador publica, se compone la prueba y ve a los candidatos rankeados.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui · Firebase (Auth, Firestore, Storage)
+ Firebase Admin SDK en los route handlers · Genkit + **Groq** (GPT-OSS) solo para precargar preguntas y el
feedback de GitHub · Hosting en **Netlify**.

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # y rellena los valores (ver comentarios del archivo)
npm run dev                  # http://localhost:9002
```

Para probar The LINE sin esperar 24 h entre intentos, pon `LINE_ATTEMPT_COOLDOWN_HOURS=0` en tu `.env.local`.

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run typecheck` · `npm run lint` · `npm test` | Lo que valida CI antes de aceptar un cambio |
| `npm run build` | Build de producción |
| `npm run inventory:pools` | (Solo lectura) qué bancos de preguntas hay en la base de datos |
| `npm run seed:questions -- --dry-run` | Plan de precarga del banco de The LINE (escribe solo con `--yes`) |

## Cómo trabajamos

- `main` es la versión en producción. Nadie trabaja directo en `main`: cada uno en su rama y Pull Request.
- Antes de pedir revisión: `npm run typecheck`, `npm run lint` y `npm test` en verde.

## Documentación

- [`CLAUDE.md`](./CLAUDE.md) — reglas del proyecto (también para agentes de IA).
- [`docs/CONTEXT.md`](./docs/CONTEXT.md) — mapa del sistema y su estado real. **Empieza aquí.**
- [`docs/README.md`](./docs/README.md) — índice del resto: arquitectura, base de datos, seguridad, despliegue,
  decisiones y deuda técnica.
