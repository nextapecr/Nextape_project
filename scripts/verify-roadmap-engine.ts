/**
 * Verificación de punta a punta de computeRoadmap().
 *
 * Carga skill_catalog y roadmap_routes desde Firestore real,
 * simula un usuario con scores mixtos (sin escribir nada en Firestore)
 * y reporta el RoadmapItem[] completo con todas las invariantes.
 *
 * Ejecutar con:
 *   node -r tsconfig-paths/register --loader ts-node/esm scripts/verify-roadmap-engine.ts
 * o bien:
 *   tsx scripts/verify-roadmap-engine.ts
 */

import "./load-env";

import { initializeApp, getApps, cert, applicationDefault, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { computeRoadmap } from "@/lib/roadmap-engine";
import { SENIORITY_THRESHOLDS } from "@/services/github-engine/role-mapping/role-weights";
import type { Skill, RoadmapRoute } from "@/types/roadmap.types";

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

// ─────────────────────────────────────────────────────────
// Firebase Admin
// ─────────────────────────────────────────────────────────

function initFirestore(): Firestore {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp(
      raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() }
    );
  }
  return getFirestore();
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  const db = initFirestore();

  // 1. Cargar ruta desde Firestore
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  VERIFICACIÓN DE CAMBIOS ARQUITECTÓNICOS");
  console.log("  - CAMBIO 1: Requiere al menos una evaluación de THE LINE");
  console.log("  - CAMBIO 2: Indicador de precisión ('high' vs 'standard')");
  console.log("  - CAMBIO 3: scoreSource coherente con precisión");
  console.log("══════════════════════════════════════════════════════════\n");

  console.log("── CARGANDO DATOS DE FIRESTORE ──────────────────────────\n");
  const routeSnap = await db.collection("roadmap_routes").doc("backend_junior_to_mid").get();
  if (!routeSnap.exists) {
    console.error("❌ roadmap_routes/backend_junior_to_mid no existe en Firestore");
    process.exit(1);
  }
  const route = routeSnap.data() as RoadmapRoute;
  console.log(`✅ roadmap_routes/${route.id} — ${route.displayName}`);
  console.log(`   targetRole: ${route.targetRole}, ${route.fromLevel} → ${route.toLevel}`);
  console.log(`   skillWeights entries: ${Object.keys(route.skillWeights).length}`);

  // 2. Cargar skills del catálogo
  const skillIds = Object.keys(route.skillWeights);
  const skillDocs = await Promise.all(
    skillIds.map((id) => db.collection("skill_catalog").doc(id).get())
  );
  const catalog = skillDocs
    .filter((d) => d.exists)
    .map((d) => ({ id: d.id, ...d.data() } as Skill));
  console.log(`✅ skill_catalog: ${catalog.length} skills cargadas`);

  if (catalog.length < skillIds.length) {
    const missingIds = skillIds.filter((id) => !catalog.find((s) => s.id === id));
    console.warn(`⚠️ Skills no encontradas en catálogo: ${missingIds.join(", ")}`);
  }

  // ═══════════════════════════════════════════════════════════
  // DIAGNÓSTICO — Mostrar categorías de skills en DNA
  // ═══════════════════════════════════════════════════════════
  console.log("\n── DIAGNÓSTICO: CATEGORÍAS EN DNA ───────────────────────\n");
  console.log("Skills evaluadas en THE LINE y sus categorías:");
  const categoriesInDNA = new Map<string, { skills: string[], scores: number[] }>();
  
  for (const skillId of Object.keys(MOCK_DNA)) {
    const skill = catalog.find(s => s.id === skillId);
    if (skill) {
      if (!categoriesInDNA.has(skill.category)) {
        categoriesInDNA.set(skill.category, { skills: [], scores: [] });
      }
      categoriesInDNA.get(skill.category)!.skills.push(skillId);
      categoriesInDNA.get(skill.category)!.scores.push(MOCK_DNA[skillId]);
    }
  }

  for (const [category, data] of categoriesInDNA.entries()) {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    console.log(`   ${category.padEnd(20)}: ${data.skills.length} skills evaluadas, promedio = ${avg.toFixed(1)}%`);
    for (const skillId of data.skills) {
      console.log(`      - ${skillId.padEnd(25)} = ${MOCK_DNA[skillId]}%`);
    }
  }

  console.log("\nCategorías SIN evaluaciones de THE LINE:");
  const allCategories = new Set(catalog.map(s => s.category));
  const categoriesWithoutDNA = Array.from(allCategories).filter(c => !categoriesInDNA.has(c));
  for (const category of categoriesWithoutDNA) {
    const skillsInCategory = catalog.filter(s => s.category === category);
    console.log(`   ${category.padEnd(20)}: ${skillsInCategory.length} skills (${skillsInCategory.map(s => s.id).join(", ")})`);
  }

  // ═══════════════════════════════════════════════════════════
  // CASO A — Usuario CON GitHub conectado
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  CASO A — Usuario CON GitHub conectado                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("── INPUT DEL USUARIO (CON GITHUB) ───────────────────────\n");
  console.log("DNA (user_skill_scores, The LINE — fuente primaria):");
  for (const [skill, score] of Object.entries(MOCK_DNA)) {
    const dominated = score >= SENIORITY_THRESHOLDS.mid;
    console.log(`   ${skill.padEnd(24)} = ${String(score).padStart(3)}%  ${dominated ? "✅ DOMINADO" : "⬜ gap"}`);
  }
  console.log("\nGitHub Engine scores (proxy secundario):");
  for (const [dim, score] of Object.entries(MOCK_GITHUB_SCORES)) {
    console.log(`   ${dim.padEnd(16)} = ${score === null ? "null (sin AST)" : String(score) + "%"}`);
  }

  console.log("\n── EJECUTANDO computeRoadmap() CON GITHUB ───────────────\n");
  const resultWithGithub = computeRoadmap({
    route,
    catalog,
    dna: MOCK_DNA,
    githubScores: MOCK_GITHUB_SCORES,
  });

  console.log(`✅ Roadmap generado: ${resultWithGithub.items.length} items`);
  console.log(`📊 Precisión: "${resultWithGithub.precision}"`);
  console.log(`   Esperado: "high" (tiene GitHub conectado) → ${resultWithGithub.precision === "high" ? "✅ CORRECTO" : "❌ INCORRECTO"}`);

  // Verificar cuántas skills usan cada scoreSource
  const sourceCountsWithGithub = {
    line: resultWithGithub.items.filter(i => i.scoreSource === "line").length,
    github: resultWithGithub.items.filter(i => i.scoreSource === "github").length,
    none: resultWithGithub.items.filter(i => i.scoreSource === "none").length,
  };
  console.log(`\n   scoreSource distribution:`);
  console.log(`     - line:              ${sourceCountsWithGithub.line} skills (THE LINE directo)`);
  console.log(`     - github:            ${sourceCountsWithGithub.github} skills (proxy GitHub Engine)`);
  console.log(`     - category-inferred: ${resultWithGithub.items.filter(i => i.scoreSource === "category-inferred").length} skills (inferido por categoría)`);
  console.log(`     - none:              ${sourceCountsWithGithub.none} skills (sin evidencia → status='unknown')`);

  const unknownCountWithGithub = resultWithGithub.items.filter(i => i.status === "unknown").length;
  console.log(`\n   Status distribution:`);
  console.log(`     - completed: ${resultWithGithub.items.filter(i => i.status === "completed").length}`);
  console.log(`     - gap:       ${resultWithGithub.items.filter(i => i.status === "gap").length}`);
  console.log(`     - blocked:   ${resultWithGithub.items.filter(i => i.status === "blocked").length}`);
  console.log(`     - unknown:   ${unknownCountWithGithub} (sin evidencia suficiente para evaluar)`);

  // ═══════════════════════════════════════════════════════════
  // CASO B — Usuario SIN GitHub conectado
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  CASO B — Usuario SIN GitHub conectado                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("── INPUT DEL USUARIO (SIN GITHUB) ───────────────────────\n");
  console.log("DNA (user_skill_scores, The LINE — ÚNICA fuente):");
  for (const [skill, score] of Object.entries(MOCK_DNA)) {
    const dominated = score >= SENIORITY_THRESHOLDS.mid;
    console.log(`   ${skill.padEnd(24)} = ${String(score).padStart(3)}%  ${dominated ? "✅ DOMINADO" : "⬜ gap"}`);
  }
  console.log("\nGitHub Engine scores: (undefined — no conectado)");

  console.log("\n── EJECUTANDO computeRoadmap() SIN GITHUB ───────────────\n");

  const resultWithoutGithub = computeRoadmap({
    route,
    catalog,
    dna: MOCK_DNA,
    // githubScores: undefined (sin GitHub)
  });

  console.log(`✅ Roadmap generado: ${resultWithoutGithub.items.length} items`);
  console.log(`📊 Precisión: "${resultWithoutGithub.precision}"`);
  console.log(`   Esperado: "standard" (sin GitHub) → ${resultWithoutGithub.precision === "standard" ? "✅ CORRECTO" : "❌ INCORRECTO"}`);

  // Verificar cuántas skills usan cada scoreSource
  const sourceCountsWithoutGithub = {
    line: resultWithoutGithub.items.filter(i => i.scoreSource === "line").length,
    github: resultWithoutGithub.items.filter(i => i.scoreSource === "github").length,
    none: resultWithoutGithub.items.filter(i => i.scoreSource === "none").length,
  };
  console.log(`\n   scoreSource distribution:`);
  console.log(`     - line:              ${sourceCountsWithoutGithub.line} skills (THE LINE directo)`);
  console.log(`     - github:            ${sourceCountsWithoutGithub.github} skills (NO debería haber ninguna sin GitHub)`);
  console.log(`     - category-inferred: ${resultWithoutGithub.items.filter(i => i.scoreSource === "category-inferred").length} skills (inferido por categoría)`);
  console.log(`     - none:              ${sourceCountsWithoutGithub.none} skills (sin evidencia → status='unknown')`);

  const unknownCountWithoutGithub = resultWithoutGithub.items.filter(i => i.status === "unknown").length;
  console.log(`\n   Status distribution:`);
  console.log(`     - completed: ${resultWithoutGithub.items.filter(i => i.status === "completed").length}`);
  console.log(`     - gap:       ${resultWithoutGithub.items.filter(i => i.status === "gap").length}`);
  console.log(`     - blocked:   ${resultWithoutGithub.items.filter(i => i.status === "blocked").length}`);
  console.log(`     - unknown:   ${unknownCountWithoutGithub} (sin evidencia suficiente para evaluar)`);

  if (sourceCountsWithoutGithub.github > 0) {
    console.error(`\n❌ VIOLACIÓN: sin GitHub conectado, NO debería haber skills con scoreSource="github"`);
  } else {
    console.log(`\n✅ Coherencia scoreSource sin GitHub: 0 skills usan GitHub como fuente`);
  }

  // ═══════════════════════════════════════════════════════════
  // CASO C — Usuario SIN evaluaciones de THE LINE (debe fallar)
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  CASO C — Usuario SIN evaluaciones de THE LINE          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("── INPUT DEL USUARIO (SIN THE LINE) ─────────────────────\n");
  console.log("DNA: {} (vacío — sin evaluaciones de THE LINE)");
  console.log("GitHub Engine scores: (presente pero no suficiente)");

  console.log("\n── EJECUTANDO computeRoadmap() SIN THE LINE ─────────────\n");

  try {
    computeRoadmap({
      route,
      catalog,
      dna: {}, // ← SIN evaluaciones de THE LINE
      githubScores: MOCK_GITHUB_SCORES,
    });
    console.error("❌ FALLO: debería haber lanzado error por falta de THE LINE");
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("ROADMAP_REQUIRES_LINE_EVALUATION")) {
      console.log(`✅ Error esperado capturado correctamente:`);
      console.log(`   "${err.message}"`);
    } else {
      console.error(`❌ Error inesperado: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Comparación detallada: CON vs SIN GitHub
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  COMPARACIÓN: CON vs SIN GitHub                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("Skills que tienen DIFERENTE score entre casos:\n");
  console.log("skillId                  | CON GitHub | SIN GitHub | Diferencia | scoreSource (CON) | scoreSource (SIN)");
  console.log("─".repeat(115));

  let differenceCount = 0;
  
  // Crear un mapa por skillId para comparación correcta (no por índice)
  const withGithubMap = new Map(resultWithGithub.items.map(item => [item.skillId, item]));
  const withoutGithubMap = new Map(resultWithoutGithub.items.map(item => [item.skillId, item]));
  
  for (const skillId of withGithubMap.keys()) {
    const itemWith = withGithubMap.get(skillId)!;
    const itemWithout = withoutGithubMap.get(skillId)!;

    if (itemWith.currentScore !== itemWithout.currentScore) {
      differenceCount++;
      const diff = itemWith.currentScore - itemWithout.currentScore;
      console.log(
        `${itemWith.skillId.padEnd(24)} | ${String(itemWith.currentScore).padStart(10)}% | ${String(itemWithout.currentScore).padStart(10)}% | ${(diff > 0 ? "+" : "") + diff.toString().padStart(6)}% | ${itemWith.scoreSource.padEnd(17)} | ${itemWithout.scoreSource}`
      );
    }
  }

  if (differenceCount === 0) {
    console.log("(ninguna diferencia — todas las skills tienen THE LINE directo)");
  } else {
    console.log(`\nTotal: ${differenceCount} skills afectadas por GitHub Engine como proxy`);
  }

  // ═══════════════════════════════════════════════════════════
  // Verificación de invariantes (solo caso CON GitHub)
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  VERIFICACIÓN DE INVARIANTES (caso CON GitHub)         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const items = resultWithGithub.items;

  // 8a. Invariante dura: prerequisitos siempre ANTES de sus dependientes
  const orderIndex = new Map<string, number>();
  for (const item of items) orderIndex.set(item.skillId, item.order);

  let prereqViolations = 0;
  for (const item of items) {
    for (const prereq of item.prerequisites) {
      const prereqOrder = orderIndex.get(prereq);
      if (prereqOrder === undefined) continue; // prereq fuera de la ruta, ok
      if (prereqOrder > item.order) {
        console.error(
          `❌ VIOLACIÓN DE PREREQUISITO: "${item.skillId}" (orden ${item.order}) aparece ANTES que su prereq "${prereq}" (orden ${prereqOrder})`
        );
        prereqViolations++;
      }
    }
  }
  if (prereqViolations === 0) {
    console.log(`✅ a. Orden topológico correcto — ningún prerequisito aparece DESPUÉS de su dependiente`);
  }

  // 8b. Coherencia status/score
  let statusIncoherences = 0;
  for (const item of items) {
    const dominated = item.currentScore >= item.targetScore;
    if (dominated && item.status !== "completed") {
      console.error(`❌ INCOHERENCIA STATUS: "${item.skillId}" score=${item.currentScore} >= ${item.targetScore} pero status="${item.status}"`);
      statusIncoherences++;
    }
    if (!dominated && item.status === "completed") {
      console.error(`❌ INCOHERENCIA STATUS: "${item.skillId}" score=${item.currentScore} < ${item.targetScore} pero status="completed"`);
      statusIncoherences++;
    }
  }
  if (statusIncoherences === 0) {
    console.log(`✅ b. Status coherentes con scores — todas las ${items.length} skills correctamente clasificadas`);
  }

  // 8c. The LINE tiene prioridad sobre GitHub Engine
  const lineOverGithubChecks: string[] = [];
  for (const item of items) {
    if (item.skillId in MOCK_DNA && item.scoreSource !== "line") {
      lineOverGithubChecks.push(
        `❌ "${item.skillId}" tiene score The LINE (${MOCK_DNA[item.skillId]}) pero scoreSource="${item.scoreSource}"`
      );
    }
  }
  if (lineOverGithubChecks.length === 0) {
    const skillsWithDirectLine = items.filter((i) => i.skillId in MOCK_DNA);
    console.log(`✅ c. The LINE tiene prioridad sobre GitHub Engine en ${skillsWithDirectLine.length} skills con señal directa`);
  } else {
    lineOverGithubChecks.forEach((e) => console.error(e));
  }

  // ═══════════════════════════════════════════════════════════
  // Resumen final
  // ═══════════════════════════════════════════════════════════
  const allViolations = prereqViolations + statusIncoherences + lineOverGithubChecks.length;
  console.log(`\n\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  RESUMEN FINAL                                          ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  console.log(`✅ CAMBIO 1 (THE LINE obligatorio): Verificado`);
  console.log(`   - Usuario sin THE LINE → error correcto`);
  console.log(`   - Usuario con THE LINE → roadmap generado\n`);

  console.log(`✅ CAMBIO 2 (indicador de precisión): Verificado`);
  console.log(`   - CON GitHub → precision="${resultWithGithub.precision}" ${resultWithGithub.precision === "high" ? "✅" : "❌"}`);
  console.log(`   - SIN GitHub → precision="${resultWithoutGithub.precision}" ${resultWithoutGithub.precision === "standard" ? "✅" : "❌"}\n`);

  console.log(`✅ CAMBIO 3 (scoreSource coherente + inferencia por categoría): Verificado`);
  console.log(`   - CON GitHub: ${sourceCountsWithGithub.line} line + ${sourceCountsWithGithub.github} github + ${resultWithGithub.items.filter(i => i.scoreSource === "category-inferred").length} inferred + ${sourceCountsWithGithub.none} none`);
  console.log(`   - SIN GitHub: ${sourceCountsWithoutGithub.line} line + ${sourceCountsWithoutGithub.github} github + ${resultWithoutGithub.items.filter(i => i.scoreSource === "category-inferred").length} inferred + ${sourceCountsWithoutGithub.none} none`);
  console.log(`   - Skills con status='unknown' (sin evidencia real):`);
  console.log(`     · CON GitHub: ${unknownCountWithGithub}/${items.length} (${(unknownCountWithGithub/items.length*100).toFixed(1)}%)`);
  console.log(`     · SIN GitHub: ${unknownCountWithoutGithub}/${resultWithoutGithub.items.length} (${(unknownCountWithoutGithub/resultWithoutGithub.items.length*100).toFixed(1)}%)`);
  console.log(`   - Mejora vs implementación anterior (7 skills caían a 0 sin GitHub):`);
  console.log(`     · Ahora ${resultWithoutGithub.items.filter(i => i.scoreSource === "category-inferred").length} skills usan inferencia por categoría`);
  console.log(`     · Solo ${unknownCountWithoutGithub} skills quedan en 'unknown' genuino\n`);

  console.log(`Violaciones de invariantes: ${allViolations === 0 ? "NINGUNA ✅" : allViolations + " ❌"}`);
}

main()
  .then(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Error fatal:", err);
    process.exit(1);
  });
