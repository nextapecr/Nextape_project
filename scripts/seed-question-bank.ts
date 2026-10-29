/**
 * Precarga el **banco de preguntas de The LINE general** en Firestore.
 *
 * Genera con IA un repertorio por cada combinación (tecnología × nivel) y lo guarda en
 * `line_question_pools/{tecnologia}_{nivel}`. Cuando un usuario practica, `/api/line/start` solo
 * LEE ese documento y sortea: no se invoca al modelo en tiempo de petición, así que The LINE
 * general deja de ser un disparador de trabajo caro (coste y DDoS).
 *
 * ── Cómo se ejecuta ─────────────────────────────────────────────────────────────────────────
 *   npm run seed:questions -- --dry-run                    # plan y coste estimado, no escribe
 *   npm run seed:questions -- --category=frontend --yes    # genera una tanda
 *   npm run seed:questions -- --yes                        # el catálogo completo (tarda MUCHO)
 *   npm run seed:questions -- --top-up --target=50 --yes   # AMPLÍA lo existente hasta ~50 por combinación
 *
 * Requiere en `.env.local` (o el entorno):
 *   GROQ_API_KEY                              clave del proveedor de IA
 *   FIREBASE_SERVICE_ACCOUNT                  JSON del service account en una variable
 *   (o GOOGLE_APPLICATION_CREDENTIALS         ruta a ese JSON)
 *
 * ⚠️ Escribe en el Firestore del proyecto configurado — normalmente **producción**. Por eso no
 * escribe nada sin `--yes`, y por defecto no regenera lo que ya existe.
 *
 * Es **reanudable**: salta las combinaciones ya generadas, así que se puede cortar con Ctrl+C y
 * relanzar sin perder trabajo ni pagar dos veces.
 *
 * `--top-up`: con exámenes de 20 preguntas, un repertorio de ~25 hace que casi todos los candidatos
 * vean las mismas. En este modo las preguntas nuevas se AÑADEN a las existentes (deduplicadas) en
 * rondas hasta llegar a `--target` (50 por defecto). Nunca reemplaza lo que ya hay.
 */

// ⚠️ PRIMER import, sin excepción: carga `.env.local` antes de que se evalúe cualquier módulo que
// lea `process.env` al importarse (`src/ai/genkit.ts` construye el cliente de Groq con la API key
// en ese momento). Ver `scripts/load-env.ts`.
import "./load-env";

import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { TECHNOLOGIES, TECH_CATEGORIES, findTechnology } from "@/lib/technologies";
import type { TechCategory } from "@/lib/technologies";
import { LEVELS, SPECIALTY_STACKS, countByType, dedupeQuestions } from "@/lib/server/assessment";
import {
  buildTechnologyPool,
  buildQuestionPool,
  BANK_QUESTIONS_PER_TYPE,
  ALL_QUESTION_TYPES,
} from "@/lib/server/question-pool";
import type { Question } from "@/types/question.types";

const COLLECTION = "line_question_pools";
const GENERATOR = "seed-question-bank@v1";

/* ────────────────────────────────── Argumentos ────────────────────────────────── */

interface Options {
  dryRun: boolean;
  confirmed: boolean;
  only: string[];
  categories: TechCategory[];
  levels: string[];
  force: boolean;
  limit: number;
  delayMs: number;
  includeSpecialties: boolean;
  topUp: boolean;
  target: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);

  const list = (value: string | undefined): string[] =>
    (value ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  const levels = list(get("levels"));
  const categories = list(get("category")) as TechCategory[];

  return {
    dryRun: has("dry-run"),
    confirmed: has("yes"),
    only: list(get("only")),
    categories: categories.filter((c) => (TECH_CATEGORIES as readonly string[]).includes(c)),
    levels: levels.filter((l) => (LEVELS as readonly string[]).includes(l)),
    force: has("force"),
    limit: Number(get("limit") ?? "0") || 0,
    delayMs: Number(get("delay") ?? "1000") || 0,
    includeSpecialties: !has("no-specialties"),
    topUp: has("top-up"),
    target: Math.max(Number(get("target") ?? "50") || 50, 20),
  };
}

/* ────────────────────────────────── Plan ────────────────────────────────── */

interface Target {
  key: string;
  label: string;
  /** `technology` = una tecnología del catálogo; `specialty` = los 3 stacks generales del LINE. */
  kind: "technology" | "specialty";
  category: string;
  level: string;
  docId: string;
}

function buildPlan(opts: Options): Target[] {
  const levels = opts.levels.length ? opts.levels : [...LEVELS];
  const targets: Target[] = [];

  const technologies = TECHNOLOGIES.filter((t) => {
    if (opts.only.length) return opts.only.includes(t.id);
    if (opts.categories.length) return opts.categories.includes(t.category);
    return true;
  });

  for (const tech of technologies) {
    for (const level of levels) {
      targets.push({
        key: tech.id,
        label: tech.label,
        kind: "technology",
        category: tech.category,
        level,
        docId: `${tech.id}_${level}`,
      });
    }
  }

  // Los 3 stacks amplios que ya ofrecía The LINE general (frontend / backend / devops).
  // Se saltan si el usuario filtró por tecnología o categoría.
  const filtering = opts.only.length > 0 || opts.categories.length > 0;
  if (opts.includeSpecialties && !filtering) {
    for (const specialty of Object.keys(SPECIALTY_STACKS)) {
      for (const level of levels) {
        targets.push({
          key: specialty,
          label: `Stack ${specialty}`,
          kind: "specialty",
          category: specialty,
          level,
          docId: `${specialty}_${level}`,
        });
      }
    }
  }

  return opts.limit > 0 ? targets.slice(0, opts.limit) : targets;
}

/* ────────────────────────────────── Firestore ────────────────────────────────── */

function initFirestore(): Firestore {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp(
      raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() }
    );
  }
  return getFirestore();
}

async function existingQuestions(db: Firestore, docId: string): Promise<Question[]> {
  const snap = await db.collection(COLLECTION).doc(docId).get();
  const questions = snap.data()?.questions;
  return Array.isArray(questions) ? (questions as Question[]) : [];
}

/** Rondas máximas de generación por combinación en `--top-up` (cada ronda aporta ~25). */
const TOP_UP_MAX_ROUNDS = 3;

/* ────────────────────────────────── Ejecución ────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUESTIONS_PER_TARGET = ALL_QUESTION_TYPES.reduce(
  (sum, t) => sum + BANK_QUESTIONS_PER_TYPE[t],
  0
);

function printPlan(targets: Target[], opts: Options) {
  const calls = targets.length * ALL_QUESTION_TYPES.length;
  console.log("\n📋 PLAN DE PRECARGA");
  console.log("─".repeat(60));
  console.log(`Combinaciones (tecnología × nivel) : ${targets.length}`);
  console.log(`Llamadas a la IA                   : ~${calls}  (${ALL_QUESTION_TYPES.length} por combinación)`);
  console.log(`Preguntas estimadas                : ~${targets.length * QUESTIONS_PER_TARGET}`);
  console.log(`Pausa entre llamadas               : ${opts.delayMs} ms`);
  console.log(
    `Tiempo aproximado                  : ~${Math.round((calls * (3000 + opts.delayMs)) / 60000)} min`
  );
  console.log(`Regenerar existentes               : ${opts.force ? "SÍ (--force)" : "no"}`);
  const topUpText = opts.topUp ? `sí, hasta ${opts.target}` : "no";
  console.log(`Ampliar existentes (--top-up)      : ${topUpText}`);
  console.log("─".repeat(60));

  const byCategory = new Map<string, number>();
  for (const t of targets) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
  for (const [cat, n] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${cat.padEnd(16)} ${n} combinaciones`);
  }
  console.log("");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Un id mal escrito en --only generaría un plan vacío o incompleto sin avisar.
  const unknown = opts.only.filter((id) => !findTechnology(id));
  if (unknown.length > 0) {
    console.error(`❌ Tecnologías desconocidas en --only: ${unknown.join(", ")}`);
    console.error(`   Válidas: ${TECHNOLOGIES.map((t) => t.id).join(", ")}\n`);
    process.exit(1);
  }

  const targets = buildPlan(opts);

  if (targets.length === 0) {
    console.error("❌ El filtro no selecciona ninguna combinación. Revisa --only / --category / --levels.");
    console.error(`   Tecnologías válidas: ${TECHNOLOGIES.map((t) => t.id).join(", ")}`);
    process.exit(1);
  }

  printPlan(targets, opts);

  if (opts.dryRun) {
    console.log("🔍 --dry-run: no se ha escrito nada. Quita --dry-run y añade --yes para ejecutar.\n");
    return;
  }

  if (!opts.confirmed) {
    console.error("⚠️  Esto escribe en el Firestore del proyecto configurado (probablemente PRODUCCIÓN).");
    console.error("   Revisa el plan de arriba y vuelve a lanzarlo con --yes para confirmar.\n");
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("❌ Falta GROQ_API_KEY. Defínela en .env.local antes de ejecutar.\n");
    process.exit(1);
  }

  const db = initFirestore();

  let created = 0;
  let skipped = 0;
  let incomplete = 0;
  let failed = 0;
  let totalQuestions = 0;
  const incompleteTargets: string[] = [];
  const startedAt = Date.now();

  for (const [i, target] of targets.entries()) {
    const progress = `[${i + 1}/${targets.length}]`;

    try {
      // En --top-up se parte de lo existente; con --force se descarta; si no, solo se completa lo que falta.
      const existing = opts.force ? [] : await existingQuestions(db, target.docId);
      const goal = opts.topUp ? opts.target : 20;
      if (existing.length >= goal) {
        console.log(`${progress} ⏭️  ${target.docId} — ya tiene ${existing.length} preguntas (objetivo ${goal})`);
        skipped++;
        continue;
      } else if (existing.length > 0) {
        console.log(
          `${progress} 🔄 ${target.docId} — ${existing.length} preguntas < ${goal}, ` +
            (opts.topUp ? "ampliando con IA..." : "completando con IA...")
        );
      }

      console.log(`${progress} 🤖 ${target.docId} — generando (${target.label}, ${target.level})...`);

      const generate = (): Promise<Question[]> =>
        target.kind === "technology"
          ? buildTechnologyPool({ technology: target.key, level: target.level })
          : buildQuestionPool({ stack: SPECIALTY_STACKS[target.key], level: target.level });

      let questions: Question[] = opts.topUp ? existing : [];
      const rounds = opts.topUp ? TOP_UP_MAX_ROUNDS : 1;
      for (let round = 0; round < rounds && questions.length < goal; round++) {
        const before = questions.length;
        questions = dedupeQuestions([...questions, ...(await generate())]);
        if (questions.length === before) break; // el proveedor no aporta nada nuevo
      }
      // Ids consecutivos: cada lote generado numera desde 0.
      questions = questions.map((q, idx) => ({ ...q, id: String(idx) }));

      if (questions.length === 0 || (opts.topUp && questions.length <= existing.length)) {
        console.error(`${progress} ❌ ${target.docId} — la IA no devolvió preguntas nuevas`);
        failed++;
        continue;
      }

      const isIncomplete = questions.length < 20;

      await db.collection(COLLECTION).doc(target.docId).set({
        key: target.key,
        kind: target.kind,
        label: target.label,
        category: target.category,
        level: target.level,
        questions,
        count: questions.length,
        status: isIncomplete ? "incomplete" : "complete",
        byType: countByType(questions),
        generator: GENERATOR,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const mix = Object.entries(countByType(questions))
        .filter(([, n]) => n > 0)
        .map(([t, n]) => `${t}:${n}`)
        .join(" ");

      if (isIncomplete) {
        console.warn(
          `${progress} ⚠️  ${target.docId} — INCOMPLETA: solo ${questions.length} preguntas de 25 esperadas (${mix})`
        );
        incomplete++;
        incompleteTargets.push(target.docId);
      } else {
        console.log(`${progress} ✅ ${target.docId} — ${questions.length} preguntas (${mix})`);
        created++;
      }

      totalQuestions += questions.length;
    } catch (err) {
      console.error(`${progress} ❌ ${target.docId} —`, err instanceof Error ? err.message : err);
      failed++;
    }

    if (opts.delayMs > 0 && i < targets.length - 1) await sleep(opts.delayMs);
  }

  const minutes = Math.round((Date.now() - startedAt) / 60000);
  console.log("\n" + "─".repeat(60));
  console.log("🎉 PRECARGA TERMINADA");
  console.log(`   Creados     : ${created}`);
  console.log(`   Incompletos : ${incomplete} (menos de 20 preguntas)`);
  console.log(`   Saltados    : ${skipped} (ya existían)`);
  console.log(`   Fallidos    : ${failed}`);
  console.log(`   Preguntas   : ${totalQuestions}`);
  console.log(`   Duración    : ~${minutes} min`);
  if (incompleteTargets.length > 0) {
    console.log(`\n   ⚠️ Combinaciones incompletas: ${incompleteTargets.join(", ")}`);
  }
  if (failed > 0 || incomplete > 0) {
    console.log("\n   Relanza el mismo comando con --force en las incompletas para regenerarlas.");
  }
  console.log("─".repeat(60) + "\n");

}

import { deleteApp } from "firebase-admin/app";

main()
  .then(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Error fatal:", err);
    process.exit(1);
  });
