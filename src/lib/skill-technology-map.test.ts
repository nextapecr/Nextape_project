import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SKILL_TECHNOLOGY_MAP,
  lineEvidenceForSkill,
  practiceTechnologyForSkill,
  technologiesForSkill,
} from "./skill-technology-map";
import { findTechnology } from "./technologies";
import { computeRoadmap } from "./roadmap-engine";
import type { RoadmapRoute, Skill } from "@/types/roadmap.types";

/** Ids del catálogo del roadmap, leídos del seeder (es la fuente de verdad de `skill_catalog`). */
function catalogSkillIds(): Set<string> {
  const catalog = JSON.parse(readFileSync(join(process.cwd(), "scripts/data/skill-catalog.json"), "utf8"));
  return new Set((catalog.skills as { id: string }[]).map((skill) => skill.id));
}

describe("SKILL_TECHNOLOGY_MAP", () => {
  it("todas las claves son skills reales del catálogo del roadmap", () => {
    const catalog = catalogSkillIds();
    expect(catalog.size).toBeGreaterThan(100);
    const unknown = Object.keys(SKILL_TECHNOLOGY_MAP).filter((id) => !catalog.has(id));
    expect(unknown).toEqual([]);
  });

  it("todos los valores son tecnologías reales de The LINE", () => {
    const unknown = Object.values(SKILL_TECHNOLOGY_MAP)
      .flat()
      .filter((tech) => !findTechnology(tech));
    expect(unknown).toEqual([]);
  });

  it("conecta más de la mitad del catálogo (antes: 2 de 112)", () => {
    const catalog = catalogSkillIds();
    const connected = [...catalog].filter((id) => technologiesForSkill(id).length > 0 || findTechnology(id));
    expect(connected.length / catalog.size).toBeGreaterThan(0.5);
  });
});

describe("lineEvidenceForSkill", () => {
  it("usa la mejor nota de las tecnologías relacionadas", () => {
    expect(lineEvidenceForSkill("react-fundamentals", { react: 60, nextjs: 85 })).toEqual({
      score: 85,
      technologies: ["nextjs", "react"],
    });
  });

  it("la coincidencia directa gana (postgresql es skill y tecnología)", () => {
    expect(lineEvidenceForSkill("postgresql", { postgresql: 70, mysql: 95 })).toEqual({
      score: 70,
      technologies: ["postgresql"],
    });
  });

  it("resuelve alias del DNA antiguo (TECH_DEBT A10)", () => {
    expect(lineEvidenceForSkill("react-advanced", { "React.js": 77 })?.score).toBe(77);
  });

  it("sin tecnologías relacionadas en el DNA devuelve null (no inventa un 0)", () => {
    expect(lineEvidenceForSkill("react-fundamentals", { docker: 90 })).toBeNull();
    expect(lineEvidenceForSkill("accessibility-wcag", { react: 90 })).toBeNull();
  });
});

describe("practiceTechnologyForSkill", () => {
  const available = { react: ["junior", "mid"], express: ["senior"] };

  it("ofrece la tecnología relacionada que tiene banco", () => {
    expect(practiceTechnologyForSkill("react-fundamentals", available)).toBe("react");
    expect(practiceTechnologyForSkill("api-design-rest", available)).toBe("express");
  });

  it("null si ninguna relacionada tiene preguntas", () => {
    expect(practiceTechnologyForSkill("docker-basics", available)).toBeNull();
  });
});

describe("computeRoadmap con el DNA real de The LINE", () => {
  const skill = (id: string, category: Skill["category"], prerequisites: string[] = []): Skill => ({
    id,
    name: id,
    category,
    prerequisites,
    githubDimension: null,
  });
  const catalog = [
    skill("react-fundamentals", "language"),
    skill("react-advanced", "language", ["react-fundamentals"]),
    skill("api-design-rest", "api-design"),
    skill("docker-basics", "infrastructure"),
  ];
  const route: RoadmapRoute = {
    id: "fullstack_junior_to_mid",
    targetRole: "fullstack",
    fromLevel: "junior",
    toLevel: "mid",
    skillWeights: { "react-fundamentals": 0.3, "react-advanced": 0.3, "api-design-rest": 0.2, "docker-basics": 0.2 },
    displayName: "Fullstack",
  } as RoadmapRoute;

  it("las skills se miden con el examen de su tecnología", () => {
    // Umbral mid = 70. React 80 → fundamentos y avanzado dominados; Express 40 → gap de APIs.
    const { items } = computeRoadmap({ route, catalog, dna: { react: 80, express: 40 } });
    const byId = Object.fromEntries(items.map((i) => [i.skillId, i]));

    expect(byId["react-fundamentals"]).toMatchObject({ status: "completed", scoreSource: "line", currentScore: 80 });
    expect(byId["react-fundamentals"].evidenceTechnologies).toEqual(["react"]);
    expect(byId["api-design-rest"]).toMatchObject({ status: "gap", scoreSource: "line", currentScore: 40 });
    expect(byId["api-design-rest"].evidenceTechnologies).toEqual(["express"]);
  });

  it("una skill sin tecnología evaluada no se marca como 'gap con 0'", () => {
    const { items } = computeRoadmap({ route, catalog, dna: { react: 80 } });
    const docker = items.find((i) => i.skillId === "docker-basics")!;
    expect(docker.status).toBe("unknown");
    expect(docker.scoreSource).toBe("none");
  });

  it("antes del cambio este DNA no alimentaba ninguna skill; ahora sí", () => {
    const { items } = computeRoadmap({ route, catalog, dna: { react: 80, express: 40 } });
    expect(items.filter((i) => i.scoreSource === "line").length).toBe(3);
  });
});
