/**
 * @fileOverview Mapper Matemático Determinístico de Skills (Sin IA).
 * Sigue el mismo patrón determinístico que src/lib/match.ts.
 * Transforma los resultados numéricos de los analyzers en las 5 habilidades canónicas:
 * architecture, testing, security, maintainability, documentation, overall, y topWeaknesses.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * FÓRMULA OFICIAL DE PONDERACIÓN DE OVERALL SCORE
 * ════════════════════════════════════════════════════════════════════════════
 * Cuando existen datos AST (archivos parseados), la puntuación global se calcula como:
 *
 *   overall = (architecture  * 0.25) +
 *             (testing       * 0.25) +
 *             (security      * 0.15) +
 *             (maintainability * 0.20) +
 *             (documentation * 0.15)
 *
 * Suma total de pesos = 0.25 + 0.25 + 0.15 + 0.20 + 0.15 = 1.00 (100%)
 *
 * Ejemplo de cálculo (astryx: 100, 100, 100, 100, 50):
 *   (100 * 0.25) + (100 * 0.25) + (100 * 0.15) + (100 * 0.20) + (50 * 0.15)
 *   = 25 + 25 + 15 + 20 + 7.5 = 92.5 -> Math.round(92.5) = 93
 *
 * Cuando NO existen datos AST (0 archivos parseables por el motor actual):
 *   architecture, security y maintainability se marcan como NULL (no evaluables).
 *   overall se calcula proporcionalmente sobre las métricas disponibles:
 *   testing (62.5%) + documentation (37.5%).
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { EngineMetrics, GithubSkillScores } from '../../../types/github.types';
import type { ComplexityAnalysisResult } from '../analyzers/complexity.analyzer';
import type { CouplingAnalysisResult } from '../analyzers/coupling.analyzer';
import type { DeadCodeAnalysisResult } from '../analyzers/dead-code.analyzer';
import type { TestingAnalysisResult } from '../analyzers/testing.analyzer';
import type { DocumentationAnalysisResult } from '../analyzers/documentation.analyzer';

export interface AnalyzerResults {
  complexity: ComplexityAnalysisResult;
  coupling: CouplingAnalysisResult;
  deadCode: DeadCodeAnalysisResult;
  testing: TestingAnalysisResult;
  documentation: DocumentationAnalysisResult;
}

export function mapSkills(results: AnalyzerResults): { metrics: EngineMetrics; skillScores: GithubSkillScores } {
  // `deadCode` ya no entra en la condición: su analizador está sin implementar y devuelve null,
  // así que exigirlo dejaría cualquier repositorio como "no analizable".
  const hasASTData =
    results.coupling.score !== null && results.complexity.score !== null;

  const metrics: EngineMetrics = {
    complexityScore: results.complexity.score,
    couplingScore: results.coupling.score,
    deadCodeScore: results.deadCode.score,
    testingScore: results.testing.score,
    documentationScore: results.documentation.score,
  };

  const testing = results.testing.score;
  const documentation = results.documentation.score;

  let architecture: number | null = null;
  let security: number | null = null;
  let maintainability: number | null = null;
  let overall = 0;
  const weaknesses: string[] = [];

  if (hasASTData) {
    const cPlx = results.complexity.score!;
    const cCpl = results.coupling.score!;
    architecture = Math.round(cCpl * 0.6 + cPlx * 0.4);
    // Se reparte el peso que tenía `deadCode` entre las dos señales que SÍ se miden, en lugar de
    // rellenarlo con un valor fijo. Los pesos siguen sumando 1.00 en cada fórmula.
    security = Math.round(cPlx * 0.625 + cCpl * 0.375);
    maintainability = Math.round(cPlx * 0.575 + cCpl * 0.425);

    // Ponderación estándar (pesos suman 1.00)
    overall = Math.round(
      architecture * 0.25 +
        testing * 0.25 +
        security * 0.15 +
        maintainability * 0.2 +
        documentation * 0.15,
    );

    const candidates = [
      { name: 'architecture', score: architecture, reason: 'Bajo desacoplamiento modular o arquitectura compleja' },
      { name: 'testing', score: testing, reason: 'Falta de suites de prueba automáticas o integración continua (CI)' },
      { name: 'security', score: security, reason: 'Riesgos de mantenibilidad y patrones de complejidad elevados' },
      { name: 'maintainability', score: maintainability, reason: 'Elevada complejidad ciclomática o código muerto presente' },
      { name: 'documentation', score: documentation, reason: 'Escasa documentación en código (JSDoc) o README incompleto' },
    ];

    candidates.sort((a, b) => a.score - b.score);
    candidates
      .filter((w) => w.score < 80)
      .slice(0, 3)
      .forEach((w) => weaknesses.push(`${w.name} (${w.score}/100): ${w.reason}`));
  } else {
    // Si no hay datos AST (0 archivos parseados por el lenguaje actual):
    // Ponderación proporcional sobre métricas disponibles (testing 25%, doc 15% -> 62.5% y 37.5%)
    overall = Math.round(testing * 0.625 + documentation * 0.375);
    weaknesses.push('no se pudo analizar arquitectura: lenguaje no soportado por el parser actual');
    if (testing < 80) {
      weaknesses.push(`testing (${testing}/100): Falta de suites de prueba automáticas o integración continua (CI)`);
    }
    if (documentation < 80) {
      weaknesses.push(`documentation (${documentation}/100): Escasa documentación o README incompleto`);
    }
  }

  const skillScores: GithubSkillScores = {
    architecture,
    testing,
    security,
    maintainability,
    documentation,
    overall,
    topWeaknesses: weaknesses.length > 0 ? weaknesses : ['Sin debilidades críticas detectadas.'],
    hasASTData,
  };

  return { metrics, skillScores };
}
