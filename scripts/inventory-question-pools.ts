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

import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { TECHNOLOGIES, TECH_CATEGORIES, CATEGORY_LABELS } from "@/lib/technologies";
import { LEVELS } from "@/lib/server/assessment";

const COLLECTION = "line_question_pools";

function initFirestore(): Firestore {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() });
  }
  return getFirestore();
}

interface Pool {
  docId: string;
  subject: string;
  level: string;
  count: number;
  byType: Record<string, number>;
  generator?: string;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

async function main() {
  const asJson = process.argv.includes("--json");
  const db = initFirestore();
  const snap = await db.collection(COLLECTION).get();

  const pools: Pool[] = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const questions: Array<Record<string, unknown>> = Array.isArray(data.questions) ? data.questions : [];
    const level = String(data.level ?? doc.id.split("_").pop() ?? "");
    const subject = String(data.key ?? doc.id.replace(new RegExp(`_${level}$`), ""));

    const byType: Record<string, number> = {};
    for (const q of questions) {
      const type = String(q?.type ?? "desconocido");
      byType[type] = (byType[type] ?? 0) + 1;
    }

    pools.push({
      docId: doc.id,
      subject,
      level,
      count: Number(data.count ?? questions.length),
      byType,
      generator: data.generator ? String(data.generator) : undefined,
    });
  });

  const byKey = new Map(pools.map((p) => [`${p.subject}_${p.level}`, p]));
  const catalogIds = new Set(TECHNOLOGIES.map((t) => t.id));
  const expected = TECHNOLOGIES.length * LEVELS.length;
  const totalQuestions = pools.reduce((n, p) => n + p.count, 0);

  const orphans = pools.filter((p) => !catalogIds.has(p.subject));
  const missing: string[] = [];
  const emptyTech: string[] = [];

  for (const tech of TECHNOLOGIES) {
    const present = LEVELS.filter((lvl) => (byKey.get(`${tech.id}_${lvl}`)?.count ?? 0) > 0);
    if (present.length === 0) emptyTech.push(tech.id);
    for (const lvl of LEVELS) {
      if ((byKey.get(`${tech.id}_${lvl}`)?.count ?? 0) <= 0) missing.push(`${tech.id}_${lvl}`);
    }
  }

  const globalByType: Record<string, number> = {};
  for (const p of pools) {
    for (const [type, n] of Object.entries(p.byType)) {
      globalByType[type] = (globalByType[type] ?? 0) + n;
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        { collection: COLLECTION, expected, poolsFound: pools.length, totalQuestions, globalByType, pools, missing, orphans: orphans.map((o) => o.docId), emptyTech },
        null,
        2,
      ),
    );
    return;
  }

  console.log("");
  console.log("════════ INVENTARIO · line_question_pools (SOLO LECTURA) ════════");
  console.log(`Repertorios encontrados : ${pools.length} de ${expected} esperados (${TECHNOLOGIES.length} tecnologías × ${LEVELS.length} niveles)`);
  console.log(`Cobertura               : ${((pools.filter((p) => p.count > 0).length / expected) * 100).toFixed(1)} %`);
  console.log(`Preguntas totales       : ${totalQuestions}`);
  console.log("");
  console.log("Preguntas por tipo (global):");
  for (const [type, n] of Object.entries(globalByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(type, 18)} ${n}`);
  }

  console.log("");
  console.log("──────── COBERTURA POR TECNOLOGÍA (nº de preguntas) ────────");
  console.log(`${pad("TECNOLOGÍA", 22)}${LEVELS.map((l) => pad(l.toUpperCase(), 10)).join("")}`);
  for (const category of TECH_CATEGORIES) {
    const items = TECHNOLOGIES.filter((t) => t.category === category);
    if (items.length === 0) continue;
    console.log(`\n· ${CATEGORY_LABELS[category]}`);
    for (const tech of items) {
      const cells = LEVELS.map((lvl) => {
        const n = byKey.get(`${tech.id}_${lvl}`)?.count ?? 0;
        return pad(n > 0 ? String(n) : "—", 10);
      }).join("");
      console.log(`  ${pad(tech.id, 20)}${cells}`);
    }
  }

  console.log("");
  console.log(`──────── TECNOLOGÍAS SIN NINGÚN REPERTORIO (${emptyTech.length}) ────────`);
  console.log(emptyTech.length ? emptyTech.join(", ") : "(ninguna)");

  console.log("");
  console.log(`──────── COMBINACIONES FALTANTES (${missing.length}) ────────`);
  console.log(missing.length ? missing.join(", ") : "(ninguna)");

  console.log("");
  console.log(`──────── REPERTORIOS HUÉRFANOS: en la DB pero NO en el catálogo (${orphans.length}) ────────`);
  console.log(orphans.length ? orphans.map((o) => `${o.docId} (${o.count})`).join(", ") : "(ninguno)");
  console.log("");
}

main().catch((err) => {
  console.error("[inventory] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
