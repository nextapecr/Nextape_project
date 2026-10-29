/**
 * Lógica compartida de los seeders del catálogo del roadmap (`seed:catalog` y `seed:catalog:full`).
 *
 * Antes cada seeder traía su propia copia de las 18 skills del MVP, de la ruta backend_junior_to_mid
 * y de toda la lógica (argumentos, validación, escritura): el mismo código dos veces. Ahora los datos
 * viven en `scripts/data/skill-catalog.json` (fuente de verdad de `skill_catalog` y `roadmap_routes`)
 * y los dos seeders llaman a `runCatalogSeed` con el subconjunto que les toca.
 *
 * ⚠️ El script que lo importe debe cargar `./load-env` ANTES que este módulo.
 */
import { getApps, deleteApp } from "firebase-admin/app";
import { scriptFirestore } from "./firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import type { Skill, RoadmapRoute } from "@/types/roadmap.types";
import catalog from "../data/skill-catalog.json";

export type CatalogSkill = Omit<Skill, "relatedSkills">;

// El JSON se tipa con literales; se valida con `validateCatalog` antes de escribir.
export const SKILL_CATALOG = catalog.skills as unknown as CatalogSkill[];
export const ALL_ROUTES = catalog.routes as unknown as RoadmapRoute[];

const SKILL_CATALOG_COLLECTION = "skill_catalog";
const ROUTES_COLLECTION = "roadmap_routes";

/** Skills que usa una ruta (las de sus pesos), en el orden del catálogo. */
export function skillsForRoutes(routes: RoadmapRoute[]): CatalogSkill[] {
  const ids = new Set(routes.flatMap((r) => Object.keys(r.skillWeights)));
  return SKILL_CATALOG.filter((s) => ids.has(s.id));
}

/** Errores de integridad: pesos que no suman 1, skills inexistentes en rutas, prerequisitos rotos. */
export function validateCatalog(skills: CatalogSkill[], routes: RoadmapRoute[]): string[] {
  const errors: string[] = [];
  const ids = new Set(skills.map((s) => s.id));
  for (const route of routes) {
    const total = Object.values(route.skillWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.001) errors.push(`${route.id}: los pesos suman ${total.toFixed(4)}, no 1.0`);
    const missing = Object.keys(route.skillWeights).filter((id) => !ids.has(id));
    if (missing.length) errors.push(`${route.id}: skills no encontradas → ${missing.join(", ")}`);
  }
  for (const skill of skills) {
    for (const prereq of skill.prerequisites) {
      if (!ids.has(prereq)) errors.push(`"${skill.id}" → prerequisito "${prereq}" no existe`);
    }
  }
  return errors;
}


/** Escribe documentos `{id, …}` en una colección; sin `force`, salta los que ya existen. */
async function seedDocs(
  db: Firestore,
  collection: string,
  docs: { id: string }[],
  { force, version }: { force: boolean; version: string },
) {
  let created = 0;
  let skipped = 0;
  const width = String(docs.length).length;
  for (const [i, doc] of docs.entries()) {
    const progress = `[${String(i + 1).padStart(width)}/${docs.length}]`;
    try {
      const ref = db.collection(collection).doc(doc.id);
      if (!force && (await ref.get()).exists) {
        console.log(`${progress} ⏭️  ${doc.id} — ya existe, saltando`);
        skipped++;
        continue;
      }
      await ref.set({ ...doc, seeder: version, updatedAt: FieldValue.serverTimestamp() });
      console.log(`${progress} ✅ ${doc.id}`);
      created++;
    } catch (err) {
      console.error(`${progress} ❌ ${doc.id} —`, err instanceof Error ? err.message : err);
    }
  }
  return { created, skipped };
}

/**
 * Seeder completo: plan → validación → confirmación (`--yes`) → escritura.
 * Flags: `--dry-run` (no escribe), `--yes` (confirma), `--force` (sobreescribe).
 */
export async function runCatalogSeed({
  title,
  skills,
  routes,
  version,
  argv = process.argv.slice(2),
}: {
  title: string;
  skills: CatalogSkill[];
  routes: RoadmapRoute[];
  version: string;
  argv?: string[];
}) {
  const force = argv.includes("--force");
  console.log(`\n📋 PLAN DE SEED — ${title}`);
  console.log("─".repeat(80));
  console.log(`Skills a cargar : ${skills.length}`);
  console.log(`Rutas a cargar  : ${routes.length} (${routes.map((r) => r.id).join(", ")})`);
  console.log(`Sobreescribir   : ${force ? "SÍ (--force)" : "no"}`);
  console.log("─".repeat(80));

  const errors = validateCatalog(skills, routes);
  if (errors.length) {
    console.error("\n❌ El catálogo tiene errores de integridad. Abortando:");
    errors.forEach((e) => console.error(`   ❌ ${e}`));
    process.exit(1);
  }
  console.log("\n✅ Pesos, referencias y prerequisitos válidos");

  if (argv.includes("--dry-run")) {
    console.log("\n🔍 --dry-run: no se ha escrito nada. Quita --dry-run y añade --yes para ejecutar.\n");
    return;
  }
  if (!argv.includes("--yes")) {
    console.error("\n⚠️  Esto escribe en el Firestore del proyecto configurado (probablemente PRODUCCIÓN).");
    console.error("   Revisa el plan de arriba y vuelve a lanzarlo con --yes para confirmar.\n");
    process.exit(1);
  }

  const db = scriptFirestore();
  console.log("\n🗂️  Cargando skill_catalog...");
  const s = await seedDocs(db, SKILL_CATALOG_COLLECTION, skills, { force, version });
  console.log("\n🗺️  Cargando roadmap_routes...");
  const r = await seedDocs(db, ROUTES_COLLECTION, routes, { force, version });

  console.log("\n" + "─".repeat(80));
  console.log("🎉 SEED TERMINADO");
  console.log(`   Skills creadas / saltadas : ${s.created} / ${s.skipped}`);
  console.log(`   Rutas creadas / saltadas  : ${r.created} / ${r.skipped}`);
  console.log("─".repeat(80) + "\n");
}

/** Ejecuta el seeder y cierra las apps de Firebase al terminar. */
export function runAndExit(task: () => Promise<void>) {
  task()
    .then(async () => {
      await Promise.all(getApps().map((app) => deleteApp(app)));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Error fatal:", err);
      process.exit(1);
    });
}
