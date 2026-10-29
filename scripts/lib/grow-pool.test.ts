import { describe, it, expect, vi } from "vitest";
import { growPool } from "./grow-pool";
import type { Question } from "@/types/question.types";

const q = (text: string): Question =>
  ({ id: "0", type: "true_false", text, briefing: "b", difficulty: "mid", tag: "react", correct: true }) as Question;

describe("growPool (rondas del seed)", () => {
  it("genera hasta llegar al objetivo y renumera los ids", async () => {
    const generate = vi.fn(async (round: number) => [q(`a${round}`), q(`b${round}`)]);
    const out = await growPool({ start: [], goal: 4, rounds: 3, generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(out.map((x) => x.id)).toEqual(["0", "1", "2", "3"]);
  });

  it("para si una ronda no aporta nada nuevo (todo duplicado)", async () => {
    const generate = vi.fn(async () => [q("misma")]);
    const out = await growPool({ start: [q("misma")], goal: 10, rounds: 3, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
  });

  it("no genera si ya se alcanzó el objetivo", async () => {
    const generate = vi.fn(async () => [q("x")]);
    const out = await growPool({ start: [q("a"), q("b")], goal: 2, rounds: 1, generate });
    expect(generate).not.toHaveBeenCalled();
    expect(out).toHaveLength(2);
  });
});
