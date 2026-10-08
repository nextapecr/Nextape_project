import { describe, it, expect } from "vitest";
import { aggregateRepoEvidence, sameSkillScores, type RepoEvidenceSummary } from "./aggregate";
import type { GithubSkillScores } from "../../types/github.types";

const scores = (overrides: Partial<GithubSkillScores>): GithubSkillScores => ({
  architecture: 70,
  testing: 70,
  security: 70,
  maintainability: 70,
  documentation: 70,
  overall: 70,
  topWeaknesses: [],
  hasASTData: true,
  ...overrides,
});

const repo = (
  fullName: string,
  filesAnalyzed: number,
  skillScores: GithubSkillScores,
  languagesBytes: Record<string, number> = {},
  parsedLanguages: Record<string, number> = {}
): RepoEvidenceSummary => ({ fullName, filesAnalyzed, skillScores, languagesBytes, parsedLanguages });

describe("aggregateRepoEvidence", () => {
  it("pondera las dimensiones de AST por archivos analizados", () => {
    const result = aggregateRepoEvidence([
      repo("u/grande", 10, scores({ architecture: 80 })),
      repo("u/pequeño", 2, scores({ architecture: 20 })),
    ]);

    // (80·10 + 20·2) / 12 = 70
    expect(result.skillScores.architecture).toBe(70);
    expect(result.reposAnalyzed).toBe(2);
    expect(result.reposWithCode).toBe(2);
    expect(result.filesAnalyzed).toBe(12);
  });

  it("un repo sin código analizable no mueve arquitectura, seguridad ni mantenibilidad", () => {
    const result = aggregateRepoEvidence([
      repo("u/codigo", 8, scores({ architecture: 90, security: 80, maintainability: 60 })),
      repo(
        "u/docs",
        0,
        scores({ architecture: null, security: null, maintainability: null, hasASTData: false, documentation: 100 })
      ),
    ]);

    expect(result.skillScores.architecture).toBe(90);
    expect(result.skillScores.security).toBe(80);
    expect(result.skillScores.maintainability).toBe(60);
    expect(result.reposWithCode).toBe(1);
    // testing y documentación salen de señales del repo: cuentan todos (peso mínimo 1).
    expect(result.skillScores.documentation).toBe(Math.round((70 * 8 + 100 * 1) / 9));
  });

  it("deja en null (no 0) lo que no se pudo analizar y renormaliza el overall", () => {
    const result = aggregateRepoEvidence([
      repo(
        "u/sin-ast",
        0,
        scores({ architecture: null, security: null, maintainability: null, hasASTData: false, testing: 40, documentation: 80 })
      ),
    ]);

    expect(result.skillScores.architecture).toBeNull();
    expect(result.skillScores.security).toBeNull();
    expect(result.skillScores.maintainability).toBeNull();
    expect(result.skillScores.hasASTData).toBe(false);
    // Solo testing (0.25) y documentación (0.15): (40·0.25 + 80·0.15) / 0.4 = 55
    expect(result.skillScores.overall).toBe(55);
    expect(result.skillScores.topWeaknesses).toContain(
      "ningún repositorio tiene código analizable en los lenguajes soportados"
    );
  });

  it("reporta como debilidad las dimensiones por debajo de 60", () => {
    const result = aggregateRepoEvidence([repo("u/a", 5, scores({ testing: 30 }))]);

    expect(result.skillScores.topWeaknesses).toEqual(["testing (30/100): promedio de 1 repositorios"]);
  });

  it("suma lenguajes de todos los repositorios", () => {
    const result = aggregateRepoEvidence([
      repo("u/a", 3, scores({}), { TypeScript: 1000, Go: 200 }, { typescript: 3 }),
      repo("u/b", 2, scores({}), { TypeScript: 500, Python: 300 }, { python: 2 }),
    ]);

    expect(result.languagesBytes).toEqual({ TypeScript: 1500, Go: 200, Python: 300 });
    expect(result.parsedLanguages).toEqual({ typescript: 3, python: 2 });
  });

  it("sameSkillScores detecta si el agregado cambió (para reutilizar la lectura de IA)", () => {
    const base = scores({ architecture: null });
    expect(sameSkillScores(base, { ...base, topWeaknesses: ["otra redacción"] })).toBe(true);
    expect(sameSkillScores(base, { ...base, overall: base.overall + 1 })).toBe(false);
    expect(sameSkillScores(base, { ...base, architecture: 0 })).toBe(false);
    expect(sameSkillScores(undefined, base)).toBe(false);
  });

  it("sin repositorios devuelve un perfil vacío coherente", () => {
    const result = aggregateRepoEvidence([]);

    expect(result.reposAnalyzed).toBe(0);
    expect(result.skillScores.hasASTData).toBe(false);
    expect(result.skillScores.architecture).toBeNull();
  });
});
