/**
 * @fileOverview Tipos canónicos del Roadmap Determinístico de NEXTAPE.
 *
 * El roadmap es 100% determinístico — sin IA, sin texto generado.
 * Ver docs/ROADMAP_DETERMINISTIC.md para el diseño completo y los algoritmos.
 *
 * Fuentes de verdad relacionadas:
 * - TargetRole / SeniorityLevel: src/services/github-engine/role-mapping/role-weights.ts
 * - Colecciones Firestore: skill_catalog / roadmap_routes (lectura pública, escritura server-only)
 * - Resultado del algoritmo: computeRoadmap() en src/lib/roadmap-engine.ts
 */

import type { TargetRole, SeniorityLevel } from "@/services/github-engine/role-mapping/role-weights";
import type { FirestoreTimestamp } from "./firebase.types";

// ─────────────────────────────────────────────────────────
// Enumeraciones del Roadmap
// ─────────────────────────────────────────────────────────

/**
 * Estado de una skill en el roadmap del usuario concreto.
 * - 'completed': score >= targetScore
 * - 'gap': score < targetScore con evidencia real (THE LINE, GitHub, o inferencia por categoría)
 * - 'blocked': gap pero con prerequisitos no dominados
 * - 'unknown': sin evidencia suficiente para evaluar (ni THE LINE, ni GitHub, ni inferencia por categoría)
 */
export type RoadmapItemStatus = "completed" | "gap" | "blocked" | "unknown";

/**
 * Nivel de prioridad calculado con la fórmula:
 *   rawPriority = (deficit / 100) × routeWeight
 *
 * 'none' = skill completada (rawPriority = 0).
 */
export type RoadmapPriority = "critical" | "high" | "medium" | "low" | "none";

/**
 * Categoría semántica de una skill para agrupación en UI.
 * Sigue el vocabulario técnico del contexto de NEXTAPE (Node.js / TypeScript / Backend).
 */
export type SkillCategory =
  | "language"
  | "database"
  | "api-design"
  | "infrastructure"
  | "testing"
  | "security"
  | "architecture"
  | "tooling"
  | "observability";

/**
 * Dimensión del GitHub Evaluation Engine de la que una skill puede heredar su score.
 * Exactamente los 5 campos de GithubSkillScores disponibles como proxy.
 * `null` = sin señal del GitHub Engine para esta skill → score = 0 hasta que The LINE la evalúe.
 */
export type SkillDimension =
  | "architecture"
  | "testing"
  | "security"
  | "maintainability"
  | "documentation";

/**
 * Origen del score de una skill en el cómputo del roadmap.
 * Usado para trazabilidad en el resultado final.
 * - 'line': The LINE — nota de la propia skill o de las tecnologías que la evidencian
 *   (`evidenceTechnologies`, mapa en `src/lib/skill-technology-map.ts`)
 * - 'github': GitHub Engine proxy (evidencia por dimensión agregada)
 * - 'category-inferred': inferido del promedio de THE LINE en la misma categoría
 * - 'none': sin evidencia alguna (ni directa, ni proxy, ni inferible)
 */
export type ScoreSource = "line" | "github" | "category-inferred" | "none";

// ─────────────────────────────────────────────────────────
// Colección skill_catalog/{skillId}
// ─────────────────────────────────────────────────────────

/**
 * Skill del catálogo curado. Representa un nodo del grafo de prerequisitos.
 * Colección Firestore: `skill_catalog/{skillId}`.
 * Reglas: lectura autenticada, escritura server-only (Admin SDK).
 */
export interface Skill {
  /** PK. Slug en kebab-case. Estable — no cambia si el nombre cambia. */
  id: string;
  /** Nombre legible para UI, ej: "Unit Testing". */
  name: string;
  /** Agrupación semántica para renderizar el roadmap por sección. */
  category: SkillCategory;
  /**
   * IDs de skills que deben dominarse antes que ésta.
   * Array vacío = skill raíz del grafo (sin prerequisitos).
   */
  prerequisites: string[];
  /**
   * Dimensión del GitHub Engine de la que esta skill hereda el score como proxy.
   * `null` = sin señal del Engine todavía → el score es 0 hasta que The LINE evalúe esta skill.
   */
  githubDimension: SkillDimension | null;
  /** V2: skills relacionadas para sugerencias cruzadas entre rutas. */
  relatedSkills?: string[];
}

// ─────────────────────────────────────────────────────────
// Colección roadmap_routes/{routeId}
// ─────────────────────────────────────────────────────────

/**
 * Ruta curada de progresión de nivel dentro de un rol.
 * Colección Firestore: `roadmap_routes/{routeId}`.
 * Reglas: lectura autenticada, escritura server-only (Admin SDK).
 *
 * Convención de ID: `"{role}_{fromLevel}_to_{toLevel}"`,
 * ej: `"backend_junior_to_mid"`.
 */
export interface RoadmapRoute {
  /** PK. Convención: "{role}_{fromLevel}_to_{toLevel}". */
  id: string;
  /** Rol técnico objetivo. Reutiliza el enum de role-weights.ts. */
  targetRole: TargetRole;
  /** Nivel de inicio. Inferido del DNA del usuario con SENIORITY_THRESHOLDS. */
  fromLevel: SeniorityLevel;
  /** Nivel objetivo. */
  toLevel: SeniorityLevel;
  /**
   * Pesos por skill individual dentro de esta ruta (suma = 1.0).
   * DISTINTO de ROLE_WEIGHTS: ese pondera 5 dimensiones agregadas del GitHub Engine;
   * este pondera N skills individuales para el algoritmo de prioridad del Roadmap.
   */
  skillWeights: Record<string, number>;
  /** Nombre legible para el selector de rutas en UI. */
  displayName: string;
}

// ─────────────────────────────────────────────────────────
// Resultado del algoritmo — RoadmapItem
// ─────────────────────────────────────────────────────────

/**
 * Un elemento del roadmap computado para un usuario concreto.
 * Resultado de computeRoadmap() en src/lib/roadmap-engine.ts.
 *
 * Sin campos de texto largo: sin description, estimatedHours, resources[].
 * Esos son campos del flow de IA deprecado (generate-roadmap-flow.ts).
 */
export interface RoadmapItem {
  /** ID de la skill del catálogo. */
  skillId: string;
  /** Nombre legible. */
  skillName: string;
  /** Categoría semántica. */
  category: SkillCategory;
  /**
   * Estado determinado por el algoritmo para este usuario concreto:
   * - 'completed': score >= targetScore
   * - 'gap': score < targetScore Y todos los prerequisitos dominados Y hay evidencia real
   * - 'blocked': score < targetScore Y al menos un prerequisito no dominado
   * - 'unknown': sin evidencia suficiente para evaluar (no contribuye a la priorización)
   */
  status: RoadmapItemStatus;
  /**
   * Prioridad calculada con rawPriority = (deficit/100) × routeWeight.
   * 'none' solo cuando status = 'completed'.
   */
  priority: RoadmapPriority;
  /** Posición en el resultado después del ordenamiento topológico (1-indexed). */
  order: number;
  /** Score actual del usuario en esta skill (0–100). 0 si sin datos. */
  currentScore: number;
  /** Score objetivo = SENIORITY_THRESHOLDS[route.toLevel]. */
  targetScore: number;
  /** targetScore - currentScore. 0 si status = 'completed'. */
  deficit: number;
  /** IDs de las skills que bloquean a ésta (no dominadas y son prerequisitos). Vacío si no blocked. */
  blockedBy: string[];
  /** IDs de todos los prerequisitos de esta skill (dominados o no). */
  prerequisites: string[];
  /** Origen del score: 'line' (The LINE directo), 'github' (proxy Engine), 'none' (sin datos). */
  scoreSource: ScoreSource;
  /**
   * Con `scoreSource: 'line'`: tecnologías de The LINE de las que sale la nota (la mejor primero).
   * Ej.: la skill `react-fundamentals` se mide con el examen de `react` o de `nextjs`.
   * Ver `src/lib/skill-technology-map.ts`.
   */
  evidenceTechnologies?: string[];
}

// ─────────────────────────────────────────────────────────
// Input para computeRoadmap()
// ─────────────────────────────────────────────────────────

/**
 * Input de la función pura computeRoadmap() en src/lib/roadmap-engine.ts.
 * github_evidence es opcional: si no existe, las skills con githubDimension != null
 * caen al proxy sin señal y usan el score de The LINE si existe, o 0.
 */
export interface ComputeRoadmapInput {
  route: RoadmapRoute;
  catalog: Skill[];
  /** Scores del DNA técnico del usuario (user_skill_scores/{uid}.scores). */
  dna: Record<string, number>;
  /** Scores del GitHub Engine (github_evidence/{uid}.skillScores). Opcional. */
  githubScores?: {
    architecture: number | null;
    testing: number;
    security: number | null;
    maintainability: number | null;
    documentation: number;
  };
}

// ─────────────────────────────────────────────────────────
// Output de computeRoadmap() — con indicador de precisión
// ─────────────────────────────────────────────────────────

/**
 * Nivel de precisión del roadmap según disponibilidad de evidencia GitHub.
 * - 'high': usuario tiene GitHub conectado, el roadmap usa THE LINE + GitHub Engine
 * - 'standard': roadmap basado únicamente en THE LINE (sin GitHub conectado)
 * 
 * Nota: 'standard' NO es penalización — es una invitación a mejorar precisión.
 * El frontend debe mostrar mensaje no alarmista: "Conecta GitHub para ruta más precisa".
 */
export type RoadmapPrecision = "high" | "standard";

/**
 * Resultado de computeRoadmap() con indicador de precisión agregado.
 */
export interface ComputeRoadmapResult {
  /** Items del roadmap ordenados topológicamente con prioridad. */
  items: RoadmapItem[];
  /** 
   * Nivel de precisión: 'high' con GitHub conectado, 'standard' sin GitHub.
   * Se calcula en base a si githubScores está disponible y si hay skills 
   * con scoreSource='none' que tendrían mejor evidencia con GitHub.
   */
  precision: RoadmapPrecision;
}

// ─────────────────────────────────────────────────────────
// Snapshot (reservado para V2 — sin uso activo en MVP)
// ─────────────────────────────────────────────────────────

/**
 * Snapshot persistido en user_roadmaps/{uid}.
 * ⚠️ NO SE USA EN MVP: el roadmap se calcula on-demand y no se cachea en Firestore.
 * Este tipo está definido para V2 (historial de progreso, diff entre versiones).
 * La regla Firestore `write: isOwner` existe pero no tiene uso activo en MVP —
 * ver docs/ROADMAP_DETERMINISTIC.md §7, pregunta abierta #1.
 */
export interface UserRoadmapSnapshot {
  routeId: string;
  targetRole: TargetRole;
  fromLevel: SeniorityLevel;
  toLevel: SeniorityLevel;
  computedAt: FirestoreTimestamp;
  items: RoadmapItem[];
}
