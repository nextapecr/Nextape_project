import { describe, it, expect } from "vitest";
import { generateDeterministicFeedback } from "./generate-github-feedback-flow";

const base = {
  architecture: 60,
  testing: 60,
  security: 60,
  maintainability: 60,
  documentation: 60,
  overall: 60,
  topWeaknesses: ["a", "b", "c", "d"],
};

describe("generateDeterministicFeedback (fallback sin IA)", () => {
  it("marca la fuente y limita las mejoras a 3", () => {
    const out = generateDeterministicFeedback(base);
    expect(out.source).toBe("deterministic");
    expect(out.improvements).toEqual(["a", "b", "c"]);
  });

  it("solo cuenta como fortaleza lo que llega a 70, ignorando dimensiones sin medir (null)", () => {
    const out = generateDeterministicFeedback({ ...base, testing: 70, security: null, architecture: 95 });
    expect(out.strengths).toEqual([
      "Buenas prácticas de testing y CI detectadas",
      "Arquitectura bien diseñada con bajo acoplamiento",
    ]);
  });

  it("sin fortalezas, el mensaje depende del overall", () => {
    expect(generateDeterministicFeedback({ ...base, overall: 55 }).strengths).toEqual([
      "Fundamentos técnicos presentes en el código analizado",
    ]);
    expect(generateDeterministicFeedback({ ...base, overall: 30 }).strengths).toEqual([
      "Oportunidades de mejora identificadas en múltiples áreas",
    ]);
  });

  it("el resumen cambia en 75 y 50, y sin debilidades da mejoras genéricas", () => {
    expect(generateDeterministicFeedback({ ...base, overall: 75 }).feedback).toMatch(/^Perfil técnico sólido/);
    expect(generateDeterministicFeedback({ ...base, overall: 50 }).feedback).toMatch(/^Fundamentos técnicos/);
    expect(generateDeterministicFeedback({ ...base, overall: 49 }).feedback).toMatch(/^Perfil en desarrollo/);
    expect(generateDeterministicFeedback({ ...base, topWeaknesses: [] }).improvements).toHaveLength(2);
  });
});
