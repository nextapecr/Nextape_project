/**
 * @fileOverview Motor determinístico del Roadmap de NEXTAPE.
 *
 * Función pura `computeRoadmap()`: sin efectos secundarios, sin IA, testeable aislada.
 * Ver docs/ROADMAP_DETERMINISTIC.md para los algoritmos completos.
 *
 * Diseño consciente — EXCEPCIÓN AL PATRÓN SERVER-TRUST:
 * Este cómputo se ejecuta en el cliente (browser), a diferencia del resto del sistema
 * (The LINE, GitHub Engine) que usa route handlers con Admin SDK.
 * Justificación: el Roadmap es exclusivamente lectura/cálculo. No escribe dato
 * verificado alguno, no modifica DNA ni scores. La integridad del sistema no está
 * en riesgo porque el resultado es solo una vista personalizada derivada del DNA
 * (que es write:false para el cliente) y del catálogo (que es inmutable desde el cliente).
 * Esto permite una UX más responsiva sin latencia de servidor adicional.
 * Ver docs/ARCHITECTURE.md §Excepciones al patrón server-trust.
 *
 * Algoritmos implementados:
 *   1. Score resolution  (§2.2): The LINE (directa o por tecnologías relacionadas, ver
 *      `src/lib/skill-technology-map.ts`) > GitHub Engine proxy > promedio de categoría > sin datos
 *   2. Prioridad         (§2.3): rawPriority = (deficit/100) × routeWeight → nivel discreto
 *   3. Kahn's topo sort  (§2.4): prerequisitos antes de sus dependientes, prioridad dentro del nivel
 */

import { SENIORITY_THRESHOLDS } from "@/services/github-engine/role-mapping/role-weights";
import { lineEvidenceForSkill } from "@/lib/skill-technology-map";
import type {
  ComputeRoadmapInput,
  ComputeRoadmapResult,
  RoadmapItem,
  RoadmapItemStatus,
  RoadmapPriority,
  RoadmapPrecision,
  ScoreSource,
  Skill,
} from "@/types/roadmap.types";

// ─────────────────────────────────────────────────────────
// §2.2 — Score Resolution
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// §2.2 — Score Resolution
// ─────────────────────────────────────────────────────────

/**
 * Calcula el promedio de scores de THE LINE por categoría.
 * Usado para inferencia conservadora cuando no hay evidencia directa.
 *
 * @param catalog - Catálogo completo de skills
 * @param dna - Scores del usuario de THE LINE
 * @returns Map de category → promedio de scores en esa categoría
 */
function calculateCategoryAverages(
  catalog: Skill[],
  dna: Record<string, number>
): Map<string, number> {
  const categoryScores = new Map<string, number[]>();

  // Agrupar scores de THE LINE por categoría
  for (const skill of catalog) {
    const score = lineEvidenceForSkill(skill.id, dna)?.score;
    if (score !== undefined && typeof score === "number") {
      if (!categoryScores.has(skill.category)) {
        categoryScores.set(skill.category, []);
      }
      categoryScores.get(skill.category)!.push(score);
    }
  }

  // Calcular promedio por categoría
  const categoryAverages = new Map<string, number>();
  for (const [category, scores] of categoryScores.entries()) {
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      categoryAverages.set(category, avg);
    }
  }

  return categoryAverages;
}

/**
 * Resuelve el score real de una skill para el usuario.
 *
 * Orden de prioridad:
 *   1. user_skill_scores (The LINE): evidencia directa y específica de la skill.
 *   2. github_evidence (GitHub Engine): proxy por dimensión agregada — menos preciso.
 *   3. Inferencia por categoría: promedio de THE LINE en skills de la misma categoría.
 *   4. null: sin evidencia alguna → status='unknown', no 'gap' con score=0.
 *
 * Regla de negocio: GitHub nunca penaliza. Sin GitHub, usamos inferencia de categoría
 * antes de caer a "sin datos". Un usuario con 75% promedio en testing no tiene 0%
 * en unit-testing solo porque no conectó GitHub — es más honesto inferir ~75%.
 */
function resolveScore(
  skill: Skill,
  dna: Record<string, number>,
  githubScores: ComputeRoadmapInput["githubScores"],
  categoryAverages: Map<string, number>
): { score: number | null; source: ScoreSource; technologies?: string[] } {
  // 1. The LINE — evidencia directa (id de la skill) o de las tecnologías que la evidencian.
  //    Antes solo se buscaba `dna[skill.id]`, y los ids del catálogo ("react-fundamentals") nunca
  //    coinciden con los del DNA ("react"): el roadmap ignoraba casi por completo The LINE (H6).
  const line = lineEvidenceForSkill(skill.id, dna);
  if (line) {
    return { score: line.score, source: "line", technologies: line.technologies };
  }

  // 2. GitHub Engine — proxy por dimensión
  if (skill.githubDimension !== null && githubScores) {
    const proxyScore = githubScores[skill.githubDimension];
    if (typeof proxyScore === "number") {
      return { score: proxyScore, source: "github" };
    }
  }

  // 3. Inferencia por categoría — promedio de THE LINE en la misma categoría
  const categoryAvg = categoryAverages.get(skill.category);
  if (categoryAvg !== undefined) {
    return { score: categoryAvg, source: "category-inferred" };
  }

  // 4. Sin datos → null (se marcará como 'unknown', no 'gap')
  return { score: null, source: "none" };
}

// ─────────────────────────────────────────────────────────
// §2.3 — Fórmula de Prioridad
// ─────────────────────────────────────────────────────────

/**
 * Calcula la prioridad discreta de una skill gap a partir de su déficit ponderado.
 *
 * Fórmula:
 *   rawPriority = (deficit / 100) × routeWeight
 *
 * Umbrales:
 *   ≥ 0.15 → 'critical'
 *   ≥ 0.08 → 'high'
 *   ≥ 0.03 → 'medium'
 *   >  0   → 'low'
 *   =  0   → 'none'  (skill completada)
 */
function calcPriority(deficit: number, routeWeight: number): RoadmapPriority {
  if (deficit <= 0) return "none";
  const raw = (deficit / 100) * routeWeight;
  if (raw >= 0.15) return "critical";
  if (raw >= 0.08) return "high";
  if (raw >= 0.03) return "medium";
  return "low";
}

/** Calcula el rawPriority numérico para ordenar dentro de un nivel topológico. */
function rawPriority(deficit: number, routeWeight: number): number {
  return (deficit / 100) * routeWeight;
}

/**
 * Implementación de Kahn's topological sort sobre el grafo de prerequisitos.
 *
 * Invariante dura: una skill con prerequisitos (dominados o no) nunca aparece antes
 * de sus prerequisitos en el resultado, sin importar su rawPriority.
 *
 * Criterio de orden en el resultado:
 *   1. PRIMARIO: nivel topológico (profundidad en el grafo de prerequisitos).
 *      Todos los prerequisitos de una skill tienen un nivel menor.
 *   2. SECUNDARIO: rawPriority DESC como desempate entre skills del MISMO nivel.
 *      Esto nunca puede empujar una skill fuera de su nivel topológico real.
 *
 * La clave del fix: los prerequisitos dominados (completed) siguen contando como
 * aristas del grafo para calcular el nivel topológico. Solo los prerequisitos
 * no-dominados bloquean el STATUS de la skill (gap vs blocked), pero el nivel
 * topológico se calcula sobre el grafo COMPLETO de prerequisitos.
 *
 * Complejidad: O(V + E) donde V = skills, E = aristas de prerequisitos.
 * Para el MVP Backend: ~18 nodos, ~30 aristas → <1ms.
 */
function kahnSort(
  skillIds: string[],
  prereqMap: Map<string, string[]>,
  priorityMap: Map<string, number>,
  _dominated: Set<string> // ya no se usa para el sort, solo para status
): string[] {
  const skillSet = new Set(skillIds);
  const byPriority = (a: string, b: string) => (priorityMap.get(b) ?? 0) - (priorityMap.get(a) ?? 0);

  // Prerequisitos que están en la ruta: TODOS, también los dominados (excluirlos era el bug).
  const routePrereqs = new Map<string, string[]>();
  for (const id of skillIds) routePrereqs.set(id, (prereqMap.get(id) ?? []).filter((p) => skillSet.has(p)));

  const inDegree = new Map<string, number>();
  for (const id of skillIds) inDegree.set(id, routePrereqs.get(id)!.length);

  // Nivel topológico de cada skill (profundidad en el grafo). Nivel 0: sin prerequisitos en la ruta.
  const topoLevel = new Map<string, number>();
  let queue: string[] = skillIds.filter((id) => inDegree.get(id) === 0);
  for (const id of queue) topoLevel.set(id, 0);

  // BFS por niveles de Kahn — calcula el nivel topológico de cada skill
  const processed = new Set<string>();
  const bfsOrder: string[] = [];

  /** Baja el in-degree de las skills que dependen de `current`; devuelve las que quedan libres. */
  const releaseDependents = (current: string): string[] => {
    const released: string[] = [];
    const nextLevel = topoLevel.get(current)! + 1;
    for (const candidate of skillIds) {
      if (processed.has(candidate) || !routePrereqs.get(candidate)!.includes(current)) continue;
      topoLevel.set(candidate, Math.max(topoLevel.get(candidate) ?? 0, nextLevel));
      const remaining = inDegree.get(candidate)! - 1;
      inDegree.set(candidate, remaining);
      if (remaining === 0) released.push(candidate);
    }
    return released;
  };

  while (queue.length > 0) {
    const nextQueue: string[] = [];
    // Ordenar por rawPriority DESC dentro del mismo nivel
    for (const current of [...queue].sort(byPriority)) {
      if (processed.has(current)) continue;
      processed.add(current);
      bfsOrder.push(current);
      nextQueue.push(...releaseDependents(current));
    }
    queue = nextQueue;
  }

  // Añadir cualquier skill que no pudo procesar (ciclo o prerequisito fuera de la ruta)
  for (const id of skillIds) {
    if (!processed.has(id)) {
      topoLevel.set(id, 999);
      bfsOrder.push(id);
    }
  }

  // Ordenar resultado final: nivel topológico PRIMARIO, rawPriority DESC SECUNDARIO
  bfsOrder.sort((a, b) => (topoLevel.get(a) ?? 0) - (topoLevel.get(b) ?? 0) || byPriority(a, b));

  return bfsOrder;
}

// ─────────────────────────────────────────────────────────
// computeRoadmap() — función pública principal
// ─────────────────────────────────────────────────────────

/**
 * Computa el roadmap determinístico para un usuario dado.
 *
 * Función pura: mismos inputs → mismo output. Sin efectos secundarios.
 * Ejecuta en cliente (<1ms para el catálogo MVP de 18 skills).
 *
 * CAMBIO ARQUITECTÓNICO — THE LINE como fuente obligatoria:
 * Requiere al menos una evaluación real en user_skill_scores (THE LINE).
 * Sin evaluaciones, lanza error indicando que debe completar THE LINE primero.
 *
 * @param input - Ruta, catálogo de skills, DNA del usuario, y scores del GitHub Engine opcionales.
 * @returns Resultado con items ordenados + indicador de precisión ('high' con GitHub, 'standard' sin GitHub).
 * @throws Error si el usuario no tiene ninguna evaluación de THE LINE.
 */
export function computeRoadmap(input: ComputeRoadmapInput): ComputeRoadmapResult {
  const { route, catalog, dna, githubScores } = input;

  // ═══════════════════════════════════════════════════════════
  // CAMBIO 1 — Validación: al menos una evaluación de THE LINE
  // ═══════════════════════════════════════════════════════════
  const hasLineEvaluation = Object.keys(dna).length > 0;
  if (!hasLineEvaluation) {
    throw new Error(
      "ROADMAP_REQUIRES_LINE_EVALUATION: Completa al menos una evaluación en THE LINE para generar tu roadmap."
    );
  }

  const targetScore = SENIORITY_THRESHOLDS[route.toLevel];

  // Filtrar el catálogo a solo las skills que aparecen en esta ruta
  const routeSkillIds = new Set(Object.keys(route.skillWeights));
  const routeSkills = catalog.filter((skill) => routeSkillIds.has(skill.id));

  // ═══════════════════════════════════════════════════════════
  // Calcular promedios por categoría para inferencia
  // ═══════════════════════════════════════════════════════════
  const categoryAverages = calculateCategoryAverages(catalog, dna);

  // Construir mapas de prerequisitos y dominio
  const prereqMap = new Map<string, string[]>();
  const dominated = new Set<string>();
  const scoreMap = new Map<string, { score: number | null; source: ScoreSource; technologies?: string[] }>();

  for (const skill of routeSkills) {
    prereqMap.set(skill.id, skill.prerequisites);
    const resolved = resolveScore(skill, dna, githubScores, categoryAverages);
    scoreMap.set(skill.id, resolved);
    // Solo marcar como dominado si hay score real (no null)
    if (resolved.score !== null && resolved.score >= targetScore) {
      dominated.add(skill.id);
    }
  }

  // Calcular déficit y prioridad para cada skill
  const deficitMap = new Map<string, number>();
  const priorityMap = new Map<string, number>(); // valor numérico para ordenar

  for (const skill of routeSkills) {
    const { score } = scoreMap.get(skill.id)!;
    const weight = route.skillWeights[skill.id] ?? 0;
    // Si score es null (unknown), déficit = 0 para no inflar prioridad artificialmente
    const deficit = score !== null ? Math.max(0, targetScore - score) : 0;
    deficitMap.set(skill.id, deficit);
    priorityMap.set(skill.id, rawPriority(deficit, weight));
  }

  // Kahn's topological sort
  const allIds = routeSkills.map((s) => s.id);
  const sortedIds = kahnSort(allIds, prereqMap, priorityMap, dominated);

  // Construir RoadmapItem[] en el orden resultante
  const skillById = new Map<string, Skill>();
  for (const skill of routeSkills) skillById.set(skill.id, skill);

  const items: RoadmapItem[] = sortedIds.map((skillId, idx) => {
    const skill = skillById.get(skillId)!;
    const { score, source, technologies } = scoreMap.get(skillId)!;
    const weight = route.skillWeights[skillId] ?? 0;
    const deficit = deficitMap.get(skillId)!;
    const priority = calcPriority(deficit, weight);

    // Determinar status
    let status: RoadmapItemStatus;
    
    // Si score es null → 'unknown' (sin evidencia suficiente)
    if (score === null) {
      status = "unknown";
    } else if (dominated.has(skillId)) {
      status = "completed";
    } else {
      const prereqs = prereqMap.get(skillId) ?? [];
      const hasBlockingPrereq = prereqs.some(
        (p) => routeSkillIds.has(p) && !dominated.has(p)
      );
      status = hasBlockingPrereq ? "blocked" : "gap";
    }

    // Prerequisitos que bloquean (solo los que están en la ruta y no son dominados)
    const blockedBy =
      status === "blocked"
        ? (prereqMap.get(skillId) ?? []).filter(
            (p) => routeSkillIds.has(p) && !dominated.has(p)
          )
        : [];

    return {
      skillId,
      skillName: skill.name,
      category: skill.category,
      status,
      priority,
      order: idx + 1,
      currentScore: score ?? 0, // Para UI, mostrar 0 si null pero status='unknown' indica que no es gap real
      targetScore,
      deficit,
      blockedBy,
      prerequisites: skill.prerequisites,
      scoreSource: source,
      ...(technologies?.length ? { evidenceTechnologies: technologies } : {}),
    };
  });

  // ═══════════════════════════════════════════════════════════
  // CAMBIO 2 y 3 — Calcular indicador de precisión
  // ═══════════════════════════════════════════════════════════
  const precision = calculatePrecision(items, routeSkills, githubScores);

  return {
    items,
    precision,
  };
}

/**
 * Calcula el nivel de precisión del roadmap según la calidad de evidencia disponible.
 *
 * Lógica actualizada:
 * - 'high': mayoría de skills tienen evidencia directa (line, github, o category-inferred)
 * - 'standard': muchas skills en 'unknown' (sin datos suficientes para evaluar)
 *
 * La precisión refleja la confianza en el roadmap, no solo si GitHub está conectado.
 * Un roadmap con muchas inferencias por categoría es 'high' si esas inferencias son razonables.
 */
function calculatePrecision(
  items: RoadmapItem[],
  routeSkills: Skill[],
  githubScores: ComputeRoadmapInput["githubScores"]
): RoadmapPrecision {
  // Contar skills por tipo de evidencia
  const unknownCount = items.filter((item) => item.status === "unknown").length;
  const totalCount = items.length;
  
  // Si más del 30% son 'unknown', la precisión es 'standard'
  const unknownRatio = unknownCount / totalCount;
  if (unknownRatio > 0.3) {
    return "standard";
  }

  // Si tenemos GitHub Y está aportando evidencia real, es 'high'
  if (githubScores) {
    const hasGithubEvidence = items.some((item) => item.scoreSource === "github");
    if (hasGithubEvidence) {
      return "high";
    }
  }

  // Si la mayoría de skills tienen evidencia (directa o inferida), es 'high'
  return "high";
}

// ─────────────────────────────────────────────────────────
// inferFromLevel — inferencia del nivel actual desde el DNA
// ─────────────────────────────────────────────────────────

/**
 * Infiere el nivel actual (`fromLevel`) del usuario basándose en su DNA técnico.
 * Usa SENIORITY_THRESHOLDS: el nivel es el más alto cuyos umbrales se cumplen.
 *
 * @param dna - Scores del usuario (user_skill_scores.scores).
 * @returns SeniorityLevel inferido ('junior' | 'mid' | 'senior').
 */
export function inferFromLevel(dna: Record<string, number>): "junior" | "mid" | "senior" {
  const scores = Object.values(dna);
  if (scores.length === 0) return "junior";

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (average >= SENIORITY_THRESHOLDS.senior) return "senior";
  if (average >= SENIORITY_THRESHOLDS.mid) return "mid";
  return "junior";
}
