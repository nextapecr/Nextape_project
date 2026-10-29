/**
 * Precarga el **Skill Catalog** y las **Roadmap Routes** en Firestore.
 *
 * Escribe en:
 *   - `skill_catalog/{skillId}`    — Catálogo curado de skills (18 skills para MVP Backend)
 *   - `roadmap_routes/{routeId}`   — Rutas de progresión (backend_junior_to_mid para MVP)
 *
 * ── Cómo se ejecuta ─────────────────────────────────────────────────────────────────────────
 *   npm run seed:catalog -- --dry-run          # muestra plan, no escribe nada
 *   npm run seed:catalog -- --yes              # escribe en Firestore (PRODUCCIÓN)
 *   npm run seed:catalog -- --force --yes      # sobreescribe documentos existentes
 *
 * Requiere en `.env.local`:
 *   FIREBASE_SERVICE_ACCOUNT   JSON del service account en una variable
 *   (o GOOGLE_APPLICATION_CREDENTIALS   ruta al JSON)
 *
 * ⚠️ Escribe en el Firestore del proyecto configurado — normalmente PRODUCCIÓN.
 *    Es reanudable: por defecto salta documentos ya existentes (usa --force para regenerar).
 *
 * Es el subconjunto MVP de `seed:catalog:full` (misma fuente: `scripts/data/skill-catalog.json`):
 * la ruta backend_junior_to_mid y sus 18 skills. Para el catálogo entero usa `seed:catalog:full`.
 */

// ⚠️ PRIMER import: carga .env.local antes de que cualquier módulo lea process.env
import "./load-env";

import { ALL_ROUTES, runAndExit, runCatalogSeed, skillsForRoutes } from "./lib/skill-catalog-seed";

const MVP_ROUTES = ALL_ROUTES.filter((r) => r.id === "backend_junior_to_mid");

runAndExit(() =>
  runCatalogSeed({
    title: "Skill Catalog MVP (backend junior → mid)",
    skills: skillsForRoutes(MVP_ROUTES),
    routes: MVP_ROUTES,
    version: "seed-skill-catalog@v1",
  }),
);
