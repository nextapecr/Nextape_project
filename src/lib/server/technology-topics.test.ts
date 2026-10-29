import { describe, it, expect } from "vitest";
import { TECHNOLOGIES } from "@/lib/technologies";
import { MIN_TOPICS, TECHNOLOGY_TOPICS, topicsFor, topicsForCall } from "./technology-topics";
import { ALL_QUESTION_TYPES, BANK_QUESTIONS_PER_TYPE } from "./question-pool";

describe("subtemas por tecnología", () => {
  it(`toda tecnología del catálogo tiene al menos ${MIN_TOPICS} subtemas`, () => {
    const missing = TECHNOLOGIES.filter((t) => topicsFor(t.id).length < MIN_TOPICS).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it("no hay subtemas de tecnologías que no existen (typos en las claves)", () => {
    const ids = new Set(TECHNOLOGIES.map((t) => t.id));
    expect(Object.keys(TECHNOLOGY_TOPICS).filter((k) => !ids.has(k))).toEqual([]);
  });

  it("no repite subtemas dentro de una tecnología", () => {
    for (const [id, topics] of Object.entries(TECHNOLOGY_TOPICS)) {
      expect(new Set(topics).size, id).toBe(topics.length);
    }
  });
});

describe("topicsForCall", () => {
  it("entre los 5 tipos de pregunta se cubren todos los subtemas de la tecnología", () => {
    for (const t of TECHNOLOGIES) {
      const all = topicsFor(t.id);
      const covered = new Set(
        ALL_QUESTION_TYPES.flatMap((type, i) => topicsForCall(all, i, BANK_QUESTIONS_PER_TYPE[type])),
      );
      // 25 preguntas por banco ≥ subtemas de cualquier tecnología.
      expect(covered.size, t.id).toBe(all.length);
    }
  });

  it("devuelve tantos subtemas como preguntas, rotando si hay menos", () => {
    expect(topicsForCall(["a", "b", "c"], 0, 5)).toEqual(["a", "b", "c", "a", "b"]);
    expect(topicsForCall(["a", "b", "c"], 1, 2)).toEqual(["c", "a"]);
    expect(topicsForCall([], 0, 5)).toEqual([]);
  });
});
