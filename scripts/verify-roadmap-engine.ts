/**
 * Verificación de punta a punta de computeRoadmap().
 *
 * Simula un usuario con scores mixtos (sin escribir nada), ejecuta el motor con y sin GitHub y
 * comprueba sus invariantes. **Es un gate:** termina con código 1 si alguna falla (antes imprimía ❌
 * y salía con 0).
 *
 * Datos: por defecto el catálogo del repo (`scripts/data/skill-catalog.json`, lo mismo que siembra
 * `seed:catalog:full`), así corre sin credenciales. Con `--firestore`, lee `skill_catalog` y
 * `roadmap_routes` del Firestore configurado (solo lectura) para verificar lo que hay en producción.
 *
 *   npx tsx scripts/verify-roadmap-engine.ts              # catálogo del repo
 *   npx tsx scripts/verify-roadmap-engine.ts --firestore  # Firestore (producción)
 */

import "./load-env";

import { getApps, deleteApp } from "firebase-admin/app";

import { computeRoadmap } from "@/lib/roadmap-engine";
import type { Skill, RoadmapRoute, RoadmapItem } from "@/types/roadmap.types";
import { scriptFirestore } from "./lib/firestore";
import { ALL_ROUTES, SKILL_CATALOG } from "./lib/skill-catalog-seed";

// ─────────────────────────────────────────────────────────
// Input sintético realista (sin escribir nada en Firestore)
// ─────────────────────────────────────────────────────────

/**
 * Simula un usuario Junior real con:
 * - typescript-basics: 80 (dominado, score ≥ 70)
 * - unit-testing: 65     (gap real: debajo de 70)
 * - node-runtime: 72     (dominado)
 * - api-design-rest: 40  (gap crítico: 70 - 40 = 30 déficit × 0.12 peso)
 * - http-protocol: 75    (dominado)
 * - sql-fundamentals: 55 (gap, pero tiene señal directa de The LINE)
 *   (NO usa GitHub Engine como proxy: tiene señal directa de The LINE)
 * - Resto: sin datos (score 0, sin proxy de GitHub Engine tampoco)
 */
const MOCK_DNA: Record<string, number> = {
  "typescript-basics": 80,
  "unit-testing": 65,
  "node-runtime": 72,
  "api-design-rest": 40,
  "http-protocol": 75,
  "sql-fundamentals": 55,
  // SIN: docker-basics, postgresql, orm-basics, auth-jwt, etc.
  // SIN: async-patterns, integration-testing, basic-security, etc.
};

/**
 * Simula la evidencia del GitHub Engine (opcional):
 * - testing: 60   → proxy para unit-testing / integration-testing si no hay señal The LINE directa
 * - architecture: 70 → proxy para node-runtime, typescript-basics, api-design-rest, async-patterns
 * - security: null → sin AST data para repo del usuario
 * - maintainability: 55
 * - documentation: 45
 *
 * El motor debe preferir The LINE cuando hay señal directa.
 */
const MOCK_GITHUB_SCORES = {
  architecture: 70,
  testing: 60,
  security: null,
  maintainability: 55,
  documentation: 45,
};

const ROUTE_ID = "backend_junior_to_mid";

// ─────────────────────────────────────────────────────────
// Datos
// ─────────────────────────────────────────────────────────

async function loadRouteAndCatalog(fromFirestore: boolean): Promise<{ route: RoadmapRoute; catalog: Skill[] }> {
  if (!fromFirestore) {
    const route = ALL_ROUTES.find((r) => r.id === ROUTE_ID);
    if (!route) throw new Error(`La ruta ${ROUTE_ID} no está en scripts/data/skill-catalog.json`);
    const ids = new Set(Object.keys(route.skillWeights));
    return { route, catalog: SKILL_CATALOG.filter((s) => ids.has(s.id)) as Skill[] };
  }
  const db = scriptFirestore();
  const routeSnap = await db.collection("roadmap_routes").doc(ROUTE_ID).get();
  if (!routeSnap.exists) throw new Error(`roadmap_routes/${ROUTE_ID} no existe en Firestore`);
  const route = routeSnap.data() as RoadmapRoute;
  const docs = await Promise.all(Object.keys(route.skillWeights).map((id) => db.collection("skill_catalog").doc(id).get()));
  return { route, catalog: docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() }) as Skill) };
}

// ─────────────────────────────────────────────────────────
// Comprobaciones
// ─────────────────────────────────────────────────────────

interface Check {
  name: string;
  /** Problemas encontrados; vacío = pasa. */
  problems: string[];
}

const count = (items: RoadmapItem[], pick: (i: RoadmapItem) => string) =>
  items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [pick(i)]: (acc[pick(i)] ?? 0) + 1 }), {});

/** Un prerequisito nunca va después de su dependiente. */
function checkTopologicalOrder(items: RoadmapItem[]): string[] {
  const order = new Map(items.map((i) => [i.skillId, i.order]));
  return items.flatMap((item) =>
    item.prerequisites
      .filter((p) => (order.get(p) ?? -1) > item.order)
      .map((p) => `"${item.skillId}" (orden ${item.order}) va antes que su prerequisito "${p}" (orden ${order.get(p)})`),
  );
}

/** `completed` si y solo si la nota llega al objetivo (las `unknown` no tienen nota). */
function checkStatusCoherence(items: RoadmapItem[]): string[] {
  return items
    .filter((i) => i.status !== "unknown")
    .filter((i) => (i.currentScore >= i.targetScore) !== (i.status === "completed"))
    .map((i) => `"${i.skillId}" score=${i.currentScore} objetivo=${i.targetScore} status="${i.status}"`);
}

/** Si The LINE tiene nota de la skill, esa es la fuente (por delante de GitHub). */
function checkLinePriority(items: RoadmapItem[]): string[] {
  return items
    .filter((i) => i.skillId in MOCK_DNA && i.scoreSource !== "line")
    .map((i) => `"${i.skillId}" tiene nota de The LINE pero scoreSource="${i.scoreSource}"`);
}

/** Precisión 'standard' si más del 30 % de las skills quedan sin evidencia; si no, 'high'. */
function checkPrecision(result: { items: RoadmapItem[]; precision: string }): string[] {
  const unknown = result.items.filter((i) => i.status === "unknown").length;
  const expected = unknown / result.items.length > 0.3 ? "standard" : "high";
  return result.precision === expected ? [] : [`precision="${result.precision}", esperado "${expected}" (${unknown} unknown)`];
}

/** Sin evaluaciones de The LINE el motor debe negarse a generar el roadmap. */
function checkRequiresLine(route: RoadmapRoute, catalog: Skill[]): string[] {
  try {
    computeRoadmap({ route, catalog, dna: {}, githubScores: MOCK_GITHUB_SCORES });
    return ["generó un roadmap sin ninguna evaluación de The LINE"];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return message.includes("ROADMAP_REQUIRES_LINE_EVALUATION") ? [] : [`error inesperado: ${message}`];
  }
}

function describe(label: string, result: { items: RoadmapItem[]; precision: string }) {
  console.log(`\n── ${label}: ${result.items.length} skills · precisión "${result.precision}"`);
  console.log(`   fuentes: ${JSON.stringify(count(result.items, (i) => i.scoreSource))}`);
  console.log(`   estados: ${JSON.stringify(count(result.items, (i) => i.status))}`);
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main(): Promise<boolean> {
  const fromFirestore = process.argv.includes("--firestore");
  const { route, catalog } = await loadRouteAndCatalog(fromFirestore);
  console.log(`\n🧭 Verificación del motor de roadmap — ${route.displayName}`);
  console.log(`   Datos: ${fromFirestore ? "Firestore" : "scripts/data/skill-catalog.json"} · ${catalog.length} skills`);

  const missing = Object.keys(route.skillWeights).filter((id) => !catalog.some((s) => s.id === id));
  const withGithub = computeRoadmap({ route, catalog, dna: MOCK_DNA, githubScores: MOCK_GITHUB_SCORES });
  const withoutGithub = computeRoadmap({ route, catalog, dna: MOCK_DNA });
  describe("CON GitHub", withGithub);
  describe("SIN GitHub", withoutGithub);

  const checks: Check[] = [
    { name: "La ruta encuentra todas sus skills en el catálogo", problems: missing.map((id) => `falta "${id}"`) },
    { name: "Sin The LINE no hay roadmap", problems: checkRequiresLine(route, catalog) },
    { name: "Orden topológico (con GitHub)", problems: checkTopologicalOrder(withGithub.items) },
    { name: "Orden topológico (sin GitHub)", problems: checkTopologicalOrder(withoutGithub.items) },
    { name: "Status coherente con la nota", problems: checkStatusCoherence([...withGithub.items, ...withoutGithub.items]) },
    { name: "The LINE tiene prioridad sobre GitHub", problems: checkLinePriority(withGithub.items) },
    {
      name: "Sin GitHub ninguna nota sale de GitHub",
      problems: withoutGithub.items.filter((i) => i.scoreSource === "github").map((i) => `"${i.skillId}"`),
    },
    { name: "Precisión según la regla del 30 % (con GitHub)", problems: checkPrecision(withGithub) },
    { name: "Precisión según la regla del 30 % (sin GitHub)", problems: checkPrecision(withoutGithub) },
  ];

  console.log("\n── Invariantes");
  for (const c of checks) {
    console.log(`${c.problems.length ? "❌" : "✅"} ${c.name}`);
    for (const p of c.problems) console.log(`     · ${p}`);
  }
  const failed = checks.filter((c) => c.problems.length > 0).length;
  const verdict = failed ? `❌ ${failed} invariante(s) rota(s)` : `✅ ${checks.length}/${checks.length} invariantes OK`;
  console.log(`\n${verdict}\n`);
  return failed === 0;
}

main()
  .then(async (ok) => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("\n❌ Error fatal:", err);
    process.exit(1);
  });
