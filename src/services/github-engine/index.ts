/**
 * @fileOverview GitHub Deterministic Analysis Engine Barrel & Orchestrator.
 *
 * ⚠️ RUNTIME Node.js Exclusivo.
 * Orquesta: Parser (Tree-sitter AST) -> EngineeringIR -> Analyzers -> Skill Mapper.
 * Selecciona máximo 5-8 archivos centrales por repo.
 */

import { universalParser } from './parsers/universal-parser';
import { buildUniversalIR } from './ir/universal-ir-builder';
import type { EngineeringIR, FileIR } from './ir/types';
import type { RepoSignals, EngineMetrics, GithubSkillScores } from '../../types/github.types';
import { analyzeComplexity } from './analyzers/complexity.analyzer';
import { analyzeCoupling } from './analyzers/coupling.analyzer';
import { analyzeDeadCode } from './analyzers/dead-code.analyzer';
import { analyzeTesting } from './analyzers/testing.analyzer';
import { analyzeDocumentation } from './analyzers/documentation.analyzer';
import { mapSkills } from './skill-mapping/skill-mapper';

export interface SourceFile {
  filename: string;
  content: string;
}

export interface EngineAnalysisResult {
  ir: EngineeringIR;
  metrics: EngineMetrics;
  skillScores: GithubSkillScores;
}

/**
 * Selecciona los 5 a 8 archivos de mayor centralidad a partir del IR preliminar o lista de archivos.
 */
function selectCentralFiles(fileIRs: FileIR[], maxFiles = 8): FileIR[] {
  if (fileIRs.length <= maxFiles) return fileIRs;

  // Puntuación de centralidad por cantidad de imports/exports + líneas de código
  return [...fileIRs]
    .sort((a, b) => {
      const scoreA = a.imports.length + a.exports.length + a.functions.length;
      const scoreB = b.imports.length + b.exports.length + b.functions.length;
      return scoreB - scoreA;
    })
    .slice(0, maxFiles);
}

/** Parsea un archivo a IR; `null` si el lenguaje no está soportado o el parser falla. */
function parseToIR(file: SourceFile): FileIR | null {
  if (!universalParser.canParse(file.filename)) return null;
  try {
    const parsedAST = universalParser.parse(file.content, file.filename);
    return buildUniversalIR(parsedAST.root, file.filename, parsedAST.language, parsedAST.hasParseErrors);
  } catch (err) {
    console.warn(`[github-engine] Fallo al parsear ${file.filename}:`, err);
    return null;
  }
}

/** Totales de funciones, clases, tests, complejidad, documentación e imports externos. */
function sumFileMetrics(files: FileIR[]) {
  const totals = { totalFunctions: 0, totalClasses: 0, totalTests: 0, totalCyclomatic: 0, documentedFnCount: 0 };
  const externalImports = new Set<string>();
  for (const f of files) {
    totals.totalFunctions += f.functions.length;
    totals.totalClasses += f.classes.length;
    totals.totalTests += f.testCount;
    for (const fn of f.functions) {
      totals.totalCyclomatic += fn.cyclomaticComplexity;
      if (fn.hasDoc) totals.documentedFnCount++;
    }
    for (const imp of f.imports) {
      if (imp.isExternal) externalImports.add(imp.source);
    }
  }
  return { ...totals, externalImports };
}

/**
 * Ejecuta el motor determinístico sobre una lista de archivos fuentes recuperados de un repositorio.
 */
export function analyzeRepositorySources(
  files: SourceFile[],
  signals?: RepoSignals,
): EngineAnalysisResult {
  const fileIRs = files.map(parseToIR).filter((ir): ir is FileIR => ir !== null);

  // Seleccionar máximo 5-8 archivos centrales
  const centralFiles = selectCentralFiles(fileIRs, 8);

  const { totalFunctions, totalClasses, totalTests, totalCyclomatic, documentedFnCount, externalImports } =
    sumFileMetrics(centralFiles);

  const avgCyclomaticComplexity =
    totalFunctions > 0 ? totalCyclomatic / totalFunctions : 1;
  const docCoverageRatio =
    totalFunctions > 0 ? documentedFnCount / totalFunctions : 0;

  const ir: EngineeringIR = {
    files: centralFiles,
    totalFunctions,
    totalClasses,
    totalExternalImports: externalImports.size,
    totalTests,
    avgCyclomaticComplexity: Math.round(avgCyclomaticComplexity * 10) / 10,
    docCoverageRatio: Math.round(docCoverageRatio * 100) / 100,
  };

  const complexityRes = analyzeComplexity(ir);
  const couplingRes = analyzeCoupling(ir);
  const deadCodeRes = analyzeDeadCode(ir);
  const testingRes = analyzeTesting(ir, signals);
  const docRes = analyzeDocumentation(ir, signals);

  const { metrics, skillScores } = mapSkills({
    complexity: complexityRes,
    coupling: couplingRes,
    deadCode: deadCodeRes,
    testing: testingRes,
    documentation: docRes,
  });

  return { ir, metrics, skillScores };
}
