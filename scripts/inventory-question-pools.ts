/**
 * Inventario de **SOLO LECTURA** del banco de preguntas de The LINE.
 *
 * Responde: ¿qué combinaciones (tecnología × nivel) están realmente sembradas en
 * `line_question_pools`, con cuántas preguntas y de qué tipos? ¿Qué falta respecto al catálogo
 * de `src/lib/technologies.ts`? ¿Hay repertorios huérfanos (en la DB pero fuera del catálogo)?
 *
 * ── Cómo se ejecuta ─────────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/inventory-question-pools.ts
 *   npx tsx scripts/inventory-question-pools.ts --json    # salida JSON (para pegar/procesar)
 *
 * Requiere en `.env.local` (o el entorno) las MISMAS credenciales que los seeds:
 *   FIREBASE_SERVICE_ACCOUNT        JSON del service account en una variable
 *   (o GOOGLE_APPLICATION_CREDENTIALS   ruta a ese JSON)
 *
 * ⚠️ NO ESCRIBE NADA. Solo hace `.get()` sobre la colección. Es seguro ejecutarlo contra
 * producción: no crea, no actualiza y no borra ni un documento.
 *
 * Tampoco imprime el enunciado ni las respuestas de ninguna pregunta: el repertorio contiene las
 * claves de respuesta y es server-only. Solo se cuentan metadatos.
 */

// ⚠️ PRIMER import: carga `.env.local` antes de que cualquier módulo lea `process.env`.
import "./load-env";

import { TECHNOLOGIES, TECH_CATEGORIES, CATEGORY_LABELS } from "@/lib/technologies";
import { LEVELS } from "@/lib/server/assessment";
import { scriptFirestore } from "./lib/firestore";
import { analyzeInventory, toPool, type Inventory } from "./lib/pool-inventory";

const COLLECTION = "line_question_pools";

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function section(title: string, items: string[], empty: string) {
  console.log("");
  console.log(`──────── ${title} (${items.length}) ────────`);
  console.log(items.length ? items.join(", ") : empty);
}

function printSummary(inv: Inventory) {
  console.log("");
  console.log("════════ INVENTARIO · line_question_pools (SOLO LECTURA) ════════");
  console.log(`Repertorios encontrados : ${inv.pools.length} de ${inv.expected} esperados (${TECHNOLOGIES.length} tecnologías × ${LEVELS.length} niveles)`);
  console.log(`Cobertura               : ${((inv.pools.filter((p) => p.count > 0).length / inv.expected) * 100).toFixed(1)} %`);
  console.log(`Preguntas totales       : ${inv.totalQuestions}`);
  console.log("");
  console.log("Preguntas por tipo (global):");
  for (const [type, n] of Object.entries(inv.globalByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(type, 18)} ${n}`);
  }
}

function printCoverageTable(inv: Inventory) {
  console.log("");
  console.log("──────── COBERTURA POR TECNOLOGÍA (nº de preguntas) ────────");
  console.log(`${pad("TECNOLOGÍA", 22)}${LEVELS.map((l) => pad(l.toUpperCase(), 10)).join("")}`);
  for (const category of TECH_CATEGORIES) {
    const items = TECHNOLOGIES.filter((t) => t.category === category);
    if (items.length === 0) continue;
    console.log(`\n· ${CATEGORY_LABELS[category]}`);
    for (const tech of items) {
      const cells = LEVELS.map((lvl) => pad(String(inv.countOf(tech.id, lvl) || "—"), 10)).join("");
      console.log(`  ${pad(tech.id, 20)}${cells}`);
    }
  }
}

async function main() {
  const snap = await scriptFirestore().collection(COLLECTION).get();
  const inv = analyzeInventory(snap.docs.map((doc) => toPool(doc.id, doc.data())));

  if (process.argv.includes("--json")) {
    const report = {
      collection: COLLECTION,
      expected: inv.expected,
      poolsFound: inv.pools.length,
      totalQuestions: inv.totalQuestions,
      globalByType: inv.globalByType,
      pools: inv.pools,
      missing: inv.missing,
      orphans: inv.orphans.map((o) => o.docId),
      emptyTech: inv.emptyTech,
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printSummary(inv);
  printCoverageTable(inv);
  section("TECNOLOGÍAS SIN NINGÚN REPERTORIO", inv.emptyTech, "(ninguna)");
  section("COMBINACIONES FALTANTES", inv.missing, "(ninguna)");
  section(
    "REPERTORIOS HUÉRFANOS: en la DB pero NO en el catálogo",
    inv.orphans.map((o) => `${o.docId} (${o.count})`),
    "(ninguno)",
  );
  console.log("");
}

main().catch((err) => {
  console.error("[inventory] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
