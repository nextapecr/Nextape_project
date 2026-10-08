import type { GithubSkillScores } from "../../types/github.types";

/**
 * Agregación de la evidencia de TODOS los repositorios de un usuario en un único perfil.
 * Función PURA: recibe los resultados por repositorio ya calculados y no toca la red.
 *
 * Criterio (explicable a un reclutador):
 * - Cada repositorio pesa según los archivos que realmente se analizaron. Un repo con 12 archivos
 *   parseados aporta más evidencia que uno con 1, y un repo sin código analizable no puede inclinar
 *   la arquitectura de nadie.
 * - `architecture`, `security` y `maintainability` solo promedian repos con datos de AST. Si ningún
 *   repo los tiene, siguen siendo `null` ("no analizable"): nunca se rellenan con un número.
 * - `testing` y `documentation` salen de señales del repositorio (tests, CI, README), así que todos
 *   los repos cuentan, con peso mínimo 1.
 * - `overall` usa los mismos pesos que el mapper por repositorio, renormalizados sobre las
 *   dimensiones disponibles.
 */

export interface RepoEvidenceSummary {
  fullName: string;
  skillScores: GithubSkillScores;
  filesAnalyzed: number;
  /** Bytes por lenguaje según GitHub (`/languages`). */
  languagesBytes: Record<string, number>;
  /** Archivos parseados por gramática del motor. */
  parsedLanguages: Record<string, number>;
}

export interface AggregatedGithubEvidence {
  skillScores: GithubSkillScores;
  reposAnalyzed: number;
  reposWithCode: number;
  filesAnalyzed: number;
  languagesBytes: Record<string, number>;
  parsedLanguages: Record<string, number>;
}

const OVERALL_WEIGHTS = {
  architecture: 0.25,
  testing: 0.25,
  security: 0.15,
  maintainability: 0.2,
  documentation: 0.15,
} as const;

const DIMENSION_LABELS: Record<keyof typeof OVERALL_WEIGHTS, string> = {
  architecture: "arquitectura",
  testing: "testing",
  security: "seguridad",
  maintainability: "mantenibilidad",
  documentation: "documentación",
};

/** Umbral por debajo del cual una dimensión se reporta como debilidad. */
export const WEAKNESS_THRESHOLD = 60;

function weightedMean(values: Array<{ value: number | null; weight: number }>): number | null {
  let sum = 0;
  let weights = 0;
  for (const { value, weight } of values) {
    if (value === null || !Number.isFinite(value) || weight <= 0) continue;
    sum += value * weight;
    weights += weight;
  }
  return weights > 0 ? Math.round(sum / weights) : null;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number> | undefined) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (Number.isFinite(v)) target[k] = (target[k] ?? 0) + v;
  }
}

/**
 * ¿Mismos scores? Si el agregado no cambió, la lectura de IA anterior sigue siendo válida y no
 * hace falta pagar otra llamada. `topWeaknesses` se deriva de los números, así que no se compara.
 */
export function sameSkillScores(a: GithubSkillScores | null | undefined, b: GithubSkillScores): boolean {
  if (!a) return false;
  return (
    a.architecture === b.architecture &&
    a.testing === b.testing &&
    a.security === b.security &&
    a.maintainability === b.maintainability &&
    a.documentation === b.documentation &&
    a.overall === b.overall &&
    a.hasASTData === b.hasASTData
  );
}

export function aggregateRepoEvidence(repos: RepoEvidenceSummary[]): AggregatedGithubEvidence {
  const withCode = repos.filter((r) => r.skillScores.hasASTData && r.filesAnalyzed > 0);

  const astDim = (dim: "architecture" | "security" | "maintainability") =>
    weightedMean(withCode.map((r) => ({ value: r.skillScores[dim], weight: r.filesAnalyzed })));
  const signalDim = (dim: "testing" | "documentation") =>
    weightedMean(repos.map((r) => ({ value: r.skillScores[dim], weight: Math.max(r.filesAnalyzed, 1) })));

  const architecture = astDim("architecture");
  const security = astDim("security");
  const maintainability = astDim("maintainability");
  const testing = signalDim("testing") ?? 0;
  const documentation = signalDim("documentation") ?? 0;

  const dims = { architecture, testing, security, maintainability, documentation };

  let overallSum = 0;
  let overallWeight = 0;
  for (const [dim, weight] of Object.entries(OVERALL_WEIGHTS) as Array<[keyof typeof OVERALL_WEIGHTS, number]>) {
    const value = dims[dim];
    if (value === null) continue;
    overallSum += value * weight;
    overallWeight += weight;
  }
  const overall = overallWeight > 0 ? Math.round(overallSum / overallWeight) : 0;

  const topWeaknesses: string[] = [];
  for (const dim of Object.keys(OVERALL_WEIGHTS) as Array<keyof typeof OVERALL_WEIGHTS>) {
    const value = dims[dim];
    if (value !== null && value < WEAKNESS_THRESHOLD) {
      const base = dim === "testing" || dim === "documentation" ? repos.length : withCode.length;
      topWeaknesses.push(`${DIMENSION_LABELS[dim]} (${value}/100): promedio de ${base} repositorios`);
    }
  }
  if (repos.length > 0 && withCode.length === 0) {
    topWeaknesses.push("ningún repositorio tiene código analizable en los lenguajes soportados");
  }

  const languagesBytes: Record<string, number> = {};
  const parsedLanguages: Record<string, number> = {};
  for (const r of repos) {
    mergeCounts(languagesBytes, r.languagesBytes);
    mergeCounts(parsedLanguages, r.parsedLanguages);
  }

  return {
    skillScores: {
      architecture,
      testing,
      security,
      maintainability,
      documentation,
      overall,
      topWeaknesses,
      hasASTData: withCode.length > 0,
    },
    reposAnalyzed: repos.length,
    reposWithCode: withCode.length,
    filesAnalyzed: repos.reduce((n, r) => n + r.filesAnalyzed, 0),
    languagesBytes,
    parsedLanguages,
  };
}
