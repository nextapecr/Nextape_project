import { describe, it, expect } from "vitest";
import {
  emptyCandidateProfile,
  isCandidateProfileComplete,
  LIMITS,
  normalizeCandidateProfile,
  normalizeUrl,
  normalizeYearMonth,
  stepErrors,
  summarizeCandidate,
  type CandidateProfile,
} from "./candidate-profile";

const NOW = new Date("2026-10-28T12:00:00Z");

const complete = (): CandidateProfile => ({
  ...emptyCandidateProfile(),
  headline: "Desarrollador frontend",
  yearsOfExperience: "1-3",
  selfLevel: "junior",
  location: "San José, Costa Rica",
  workModes: ["remote"],
  availability: "now",
  work: [
    { company: "Acme", role: "Dev Jr", start: "2023", end: "", current: true, description: "React y Next.js" },
    { company: "Beta", role: "Practicante", start: "2021", end: "2022", current: false, description: "" },
  ],
  education: [{ institution: "UCR", program: "Computación", level: "bachelor", status: "in-progress", year: "2027" }],
  technologies: ["react"],
  completedAt: 1,
});

describe("normalizeCandidateProfile", () => {
  it("descarta basura que el cliente pudiera escribir en users/{uid}", () => {
    const p = normalizeCandidateProfile(
      {
        headline: "  Dev   frontend  ",
        yearsOfExperience: "999",
        selfLevel: "god",
        workModes: ["remote", "remote", "moon"],
        linkedinUrl: "javascript:alert(1)", // NOSONAR typescript:S1523 — se prueba que se RECHAZA
        portfolioUrl: "mi-sitio.dev",
        technologies: ["React", "react", ""],
        work: [{ company: "", role: "" }, { company: "Acme", role: "Dev", start: "1800", current: true, end: "2020" }],
        extra: "no debería quedar",
      },
      NOW,
    );
    expect(p.headline).toBe("Dev frontend");
    expect(p.yearsOfExperience).toBe("");
    expect(p.selfLevel).toBe("");
    expect(p.workModes).toEqual(["remote"]);
    expect(p.linkedinUrl).toBe("");
    expect(p.portfolioUrl).toBe("https://mi-sitio.dev/");
    expect(p.technologies).toEqual(["react"]);
    expect(p.work).toEqual([{ company: "Acme", role: "Dev", start: "", end: "", current: true, description: "" }]);
    expect(p).not.toHaveProperty("extra");
  });

  it("aplica los límites de cantidad y longitud", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ company: `C${i}`, role: "R", start: "2020" }));
    const p = normalizeCandidateProfile({ work: many, headline: "x".repeat(500) }, NOW);
    expect(p.work).toHaveLength(LIMITS.work);
    expect(p.headline).toHaveLength(LIMITS.shortText);
  });

  it("acepta cualquier cosa sin romperse", () => {
    for (const raw of [null, undefined, 3, "x", [], { work: "no" }]) {
      expect(() => normalizeCandidateProfile(raw, NOW)).not.toThrow();
    }
  });
});

describe("fechas y enlaces", () => {
  it("año o año-mes razonables", () => {
    expect(normalizeYearMonth("2023", NOW)).toBe("2023");
    expect(normalizeYearMonth("2023-05", NOW)).toBe("2023-05");
    expect(normalizeYearMonth("2023-13", NOW)).toBe("");
    expect(normalizeYearMonth("2030", NOW)).toBe("");
    expect(normalizeYearMonth("ayer", NOW)).toBe("");
  });

  it("solo http(s)", () => {
    expect(normalizeUrl("linkedin.com/in/vernon")).toBe("https://linkedin.com/in/vernon");
    expect(normalizeUrl("http://a.dev")).toBe("http://a.dev/"); // NOSONAR typescript:S5332 — http se acepta y se prueba
    expect(normalizeUrl("data:text/html,hola")).toBe("");
    expect(normalizeUrl("")).toBe("");
  });
});

describe("stepErrors", () => {
  it("un perfil completo no tiene errores en ningún paso", () => {
    const p = complete();
    for (const s of ["about", "work", "education", "extras"] as const) expect(stepErrors(s, p)).toEqual([]);
    expect(isCandidateProfileComplete(p)).toBe(true);
  });

  it("pide lo mínimo del primer paso", () => {
    expect(stepErrors("about", emptyCandidateProfile())).toHaveLength(3);
  });

  it("la experiencia laboral es opcional, pero si se empieza debe estar completa", () => {
    expect(stepErrors("work", { ...complete(), work: [] })).toEqual([]);
    expect(stepErrors("work", { ...complete(), work: [{ company: "", role: "", start: "", end: "", current: false, description: "" }] })).toHaveLength(2);
  });

  it("detecta fin anterior al inicio", () => {
    const p = { ...complete(), work: [{ company: "A", role: "B", start: "2024", end: "2022", current: false, description: "" }] };
    expect(stepErrors("work", p)[0]).toMatch(/anterior/);
  });

  it("al menos un estudio; autodidacta no necesita institución", () => {
    expect(stepErrors("education", { ...complete(), education: [] })).toHaveLength(1);
    const self = { ...complete(), education: [{ institution: "", program: "", level: "self-taught" as const, status: "" as const, year: "" }] };
    expect(stepErrors("education", self)).toEqual([]);
  });

  it("sin completedAt no cuenta como completo", () => {
    expect(isCandidateProfileComplete({ ...complete(), completedAt: null })).toBe(false);
    expect(isCandidateProfileComplete(undefined)).toBe(false);
  });
});

describe("summarizeCandidate", () => {
  it("resume para la empresa, con el trabajo actual primero y etiquetas legibles", () => {
    const s = summarizeCandidate(complete())!;
    expect(s.headline).toBe("Desarrollador frontend");
    expect(s.yearsOfExperience).toBe("1 a 3 años");
    expect(s.recentWork[0]).toBe("Dev Jr · Acme (2023–actual)");
    expect(s.recentWork[1]).toBe("Practicante · Beta (2021–2022)");
    expect(s.education[0]).toBe("Computación · UCR (En curso)");
    expect(s.languages).toEqual(["Español (Nativo)"]);
    expect(s).not.toHaveProperty("email");
  });

  it("sin datos útiles devuelve null", () => {
    expect(summarizeCandidate(undefined)).toBeNull();
    expect(summarizeCandidate(emptyCandidateProfile())).toBeNull();
  });
});
