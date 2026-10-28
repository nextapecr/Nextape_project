import { describe, it, expect } from "vitest";
import { MAX_LINE_TECHNOLOGIES, normalizeLineTechnologies, removedTechnologies } from "./line-technologies";
import { removeTechnologiesFromDna } from "./server/dna-removal";

describe("normalizeLineTechnologies", () => {
  it("ids canónicos, sin repetir, sin la teoría y con tope", () => {
    expect(normalizeLineTechnologies(["React", "react", "Node", "software-engineering", "inventada", 3])).toEqual([
      "react",
      "node.js",
    ]);
    const many = ["react", "vue", "angular", "svelte", "python", "java", "go", "rust"];
    expect(normalizeLineTechnologies(many)).toHaveLength(MAX_LINE_TECHNOLOGIES);
    expect(normalizeLineTechnologies("react")).toEqual([]);
  });
});

describe("quitar tecnologías resta sus puntos", () => {
  it("detecta lo quitado", () => {
    expect(removedTechnologies(["python", "react"], ["react"])).toEqual(["python"]);
    expect(removedTechnologies(undefined, ["react"])).toEqual([]);
    expect(removedTechnologies(["react"], ["react", "python"])).toEqual([]);
  });

  it("borra score e historial de lo quitado y deja el resto", () => {
    const dna = {
      scores: { python: 80, react: 60, "software-engineering": 70 },
      history: { python: [{ score: 80 }], react: [{ score: 60 }] },
    };
    const out = removeTechnologiesFromDna(dna, ["python"]);
    expect(out.scores).toEqual({ react: 60, "software-engineering": 70 });
    expect(out.history).toEqual({ react: [{ score: 60 }] });
    expect(out.lost).toEqual({ python: 80 });
    expect(dna.scores.python).toBe(80); // no muta la entrada
  });

  it("quitar algo que nunca se evaluó no pierde nada", () => {
    expect(removeTechnologiesFromDna({ scores: { react: 60 } }, ["python"]).lost).toEqual({});
    expect(removeTechnologiesFromDna(undefined, ["python"]).scores).toEqual({});
  });

  it("borra también las claves antiguas con alias (React.js → react)", () => {
    const out = removeTechnologiesFromDna({ scores: { "React.js": 72, vue: 50 }, history: { "React.js": [] } }, ["react"]);
    expect(out.lost).toEqual({ react: 72 });
    expect(out.scores).toEqual({ vue: 50 });
    expect(out.history).toEqual({});
  });
});
