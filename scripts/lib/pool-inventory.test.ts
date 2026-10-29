import { describe, it, expect } from "vitest";
import { analyzeInventory, toPool } from "./pool-inventory";
import { TECHNOLOGIES } from "@/lib/technologies";

describe("inventario del banco de preguntas", () => {
  it("resume un documento sin tocar enunciados: tipos, nivel y tecnología", () => {
    const pool = toPool("react_mid", {
      questions: [{ type: "multiple_choice" }, { type: "multiple_choice" }, { type: "ordering" }, {}],
      generator: "seed-question-bank@v2",
    });
    expect(pool).toEqual({
      docId: "react_mid",
      subject: "react",
      level: "mid",
      count: 4,
      byType: { multiple_choice: 2, ordering: 1, desconocido: 1 },
      generator: "seed-question-bank@v2",
    });
    expect(toPool("node.js_senior", { key: "node.js", level: "senior", count: 25 }).subject).toBe("node.js");
  });

  it("calcula faltantes, tecnologías vacías y huérfanos respecto al catálogo", () => {
    const inv = analyzeInventory([
      toPool("react_junior", { count: 25 }),
      toPool("react_mid", { count: 25 }),
      toPool("cobol_senior", { count: 10 }),
    ]);
    expect(inv.expected).toBe(TECHNOLOGIES.length * 3);
    expect(inv.totalQuestions).toBe(60);
    expect(inv.missing).toContain("react_senior");
    expect(inv.missing).not.toContain("react_mid");
    expect(inv.emptyTech).not.toContain("react");
    expect(inv.emptyTech).toContain("vue");
    expect(inv.orphans.map((o) => o.docId)).toEqual(["cobol_senior"]);
    expect(inv.countOf("react", "mid")).toBe(25);
  });
});
