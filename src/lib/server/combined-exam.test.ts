import { describe, it, expect } from "vitest";
import {
  combinedPoolDocIds,
  composeCombinedExam,
  lineLevelFromSelfLevel,
  planCombinedExam,
} from "./combined-exam";
import type { MultipleChoiceQuestion, Question } from "@/types/question.types";

const pool = (tag: string, n: number): Question[] =>
  Array.from({ length: n }, (_, i): MultipleChoiceQuestion => ({
    id: String(i),
    tag,
    text: `${tag} pregunta ${i}`,
    briefing: "b",
    difficulty: "junior",
    type: "multiple_choice",
    options: ["a", "b", "c", "d"],
    correctIndex: 0,
  }));

const count = (qs: Question[]) =>
  qs.reduce<Record<string, number>>((acc, q) => ({ ...acc, [q.tag]: (acc[q.tag] ?? 0) + 1 }), {});

describe("nivel y reparto", () => {
  it("el nivel sale del perfil", () => {
    expect(lineLevelFromSelfLevel("trainee")).toBe("junior");
    expect(lineLevelFromSelfLevel("junior")).toBe("junior");
    expect(lineLevelFromSelfLevel("mid")).toBe("mid");
    expect(lineLevelFromSelfLevel("lead")).toBe("senior");
    expect(lineLevelFromSelfLevel("")).toBeNull();
  });

  it("70 % tecnologías / 30 % teoría", () => {
    expect(planCombinedExam(20)).toEqual({ theory: 6, technologies: 14 });
    expect(planCombinedExam(10)).toEqual({ theory: 3, technologies: 7 });
  });

  it("lee cada tecnología y la teoría en el orden de respaldo de niveles", () => {
    expect(combinedPoolDocIds(["react"], "junior")).toEqual([
      "react_junior", "react_mid", "react_senior",
      "software-engineering_junior", "software-engineering_mid", "software-engineering_senior",
    ]);
  });
});

describe("composeCombinedExam", () => {
  const bank = {
    react_junior: pool("react", 25),
    "node.js_junior": pool("node.js", 25),
    "software-engineering_junior": pool("software-engineering", 25),
  };

  it("mezcla las tecnologías del perfil con 30 % de teoría", () => {
    const exam = composeCombinedExam({ technologies: ["react", "node.js"], level: "junior", bank, examSize: 20 });
    expect(exam.questions).toHaveLength(20);
    expect(count(exam.questions)).toEqual({ react: 7, "node.js": 7, "software-engineering": 6 });
    expect(exam.skillLevels).toEqual({ react: "junior", "node.js": "junior", "software-engineering": "junior" });
  });

  it("ids únicos aunque cada banco numere desde 0", () => {
    const exam = composeCombinedExam({ technologies: ["react", "node.js"], level: "junior", bank, examSize: 20 });
    expect(new Set(exam.questions.map((q) => q.id)).size).toBe(20);
  });

  it("una tecnología sin banco no rompe la prueba: se informa y sus preguntas van a las demás", () => {
    const exam = composeCombinedExam({ technologies: ["react", "python"], level: "junior", bank, examSize: 20 });
    expect(exam.coverage).toEqual({ react: "junior", python: null });
    expect(count(exam.questions)).toEqual({ react: 14, "software-engineering": 6 });
  });

  it("sin teoría sembrada, todo es de tecnologías", () => {
    const noTheory = Object.fromEntries(Object.entries(bank).filter(([k]) => k !== "software-engineering_junior"));
    const exam = composeCombinedExam({ technologies: ["react"], level: "junior", bank: noTheory, examSize: 20 });
    expect(exam.theoryLevel).toBeNull();
    expect(count(exam.questions)).toEqual({ react: 20 });
  });

  it("usa otro nivel si el pedido no tiene banco, y lo registra para ponderar", () => {
    const exam = composeCombinedExam({ technologies: ["react"], level: "senior", bank, examSize: 10 });
    expect(exam.coverage.react).toBe("junior");
    expect(exam.skillLevels.react).toBe("junior");
  });

  it("si nada tiene banco, la prueba sale vacía (el handler responde 503)", () => {
    const exam = composeCombinedExam({ technologies: ["python"], level: "junior", bank: {}, examSize: 20 });
    expect(exam.questions).toHaveLength(0);
  });

  it("bancos pequeños: usa lo que hay sin repetir preguntas", () => {
    const small = { react_junior: pool("react", 4), "software-engineering_junior": pool("software-engineering", 3) };
    const exam = composeCombinedExam({ technologies: ["react"], level: "junior", bank: small, examSize: 20 });
    expect(exam.questions).toHaveLength(7);
    expect(new Set(exam.questions.map((q) => q.text)).size).toBe(7);
  });
});
