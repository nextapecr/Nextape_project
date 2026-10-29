/**
 * Precarga el **Skill Catalog COMPLETO** (112 skills) y las **10 Roadmap Routes** en Firestore.
 *
 * Datos: `scripts/data/skill-catalog.json`. Lógica: `scripts/lib/skill-catalog-seed.ts`.
 *
 * Escribe en:
 *   - `skill_catalog/{skillId}`    — 112 skills (18 ya existentes + 94 nuevas)
 *   - `roadmap_routes/{routeId}`   — 10 rutas (1 ya existente + 9 nuevas)
 *
 * ── Cómo se ejecuta ─────────────────────────────────────────────────────────────────────────
 *   npm run seed:catalog:full -- --dry-run          # muestra plan, no escribe nada
 *   npm run seed:catalog:full -- --yes              # escribe en Firestore (PRODUCCIÓN)
 *   npm run seed:catalog:full -- --force --yes      # sobreescribe documentos existentes
 *
 * Requiere en `.env.local`:
 *   FIREBASE_SERVICE_ACCOUNT   JSON del service account en una variable
 *   (o GOOGLE_APPLICATION_CREDENTIALS   ruta al JSON)
 *
 * ⚠️ Escribe en el Firestore del proyecto configurado — normalmente PRODUCCIÓN.
 *    Es reanudable: por defecto salta documentos ya existentes (usa --force para regenerar).
 */

// ⚠️ PRIMER import: carga .env.local antes de que cualquier módulo lea process.env
import "./load-env";

import { ALL_ROUTES, SKILL_CATALOG, runAndExit, runCatalogSeed } from "./lib/skill-catalog-seed";

runAndExit(() =>
  runCatalogSeed({
    title: "Skill Catalog COMPLETO & Roadmap Routes",
    skills: SKILL_CATALOG,
    routes: ALL_ROUTES,
    version: "seed-skill-catalog@v2-full",
  }),
);
