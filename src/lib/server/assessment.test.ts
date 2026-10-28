import { describe, it, expect } from "vitest";
import {
  gradeAnswers,
  gradeQuestion,
  stripAnswerKey,
  isValidAnswerSet,
  isValidAnswerFor,
  dedupeQuestions,
  pickRandomQuestions,
  normalizeSimulationParams,
  normalizeStoredQuestions,
  countByType,
  LEVELS,
  SPECIALTY_STACKS,
  shuffleQuestionOptions,
} from "./assessment";
import type {
  MultipleChoiceQuestion,
  MultiSelectQuestion,
  OrderingQuestion,
  Question,
  TrueFalseQuestion,
  CodeOutputQuestion,
} from "@/types/question.types";

const base = { briefing: "b", difficulty: "senior" };

const mc = (id: string, tag: string, correctIndex: number, text = "t"): MultipleChoiceQuestion => ({
  ...base,
  id,
  tag,
  text,
  type: "multiple_choice",
  options: ["0", "1", "2", "3"],
  correctIndex,
});

const tf = (id: string, tag: string, correct: boolean, text = "tf"): TrueFalseQuestion => ({
  ...base,
  id,
  tag,
  text,
  type: "true_false",
  correct,
});

const ms = (id: string, tag: string, correctIndexes: number[], text = "ms"): MultiSelectQuestion => ({
  ...base,
  id,
  tag,
  text,
  type: "multi_select",
  options: ["a", "b", "c", "d", "e"],
  correctIndexes,
});

const ord = (id: string, tag: string, correctOrder: number[], text = "ord"): OrderingQuestion => ({
  ...base,
  id,
  tag,
  text,
  type: "ordering",
  items: ["p0", "p1", "p2", "p3"],
  correctOrder,
});

const code = (id: string, tag: string, correctIndex: number, text = "co"): CodeOutputQuestion => ({
  ...base,
  id,
  tag,
  text,
  type: "code_output",
  code: "const x = 1;",
  language: "typescript",
  options: ["0", "1", "2", "3"],
  correctIndex,
});

/** Repertorio de `n` preguntas de opción múltiple de un mismo tag, con enunciados distintos. */
const poolOf = (tag: string, n: number): Question[] =>
  Array.from({ length: n }, (_, i) => mc(`${tag}-${i}`, tag, 0, `${tag} pregunta ${i}`));

describe("gradeQuestion — corrección determinista por tipo", () => {
  it("opción múltiple y código: acierto binario", () => {
    expect(gradeQuestion(mc("1", "react", 2), 2)).toBe(1);
    expect(gradeQuestion(mc("1", "react", 2), 0)).toBe(0);
    expect(gradeQuestion(code("1", "react", 3), 3)).toBe(1);
  });

  it("verdadero/falso: distingue el booleano correcto", () => {
    expect(gradeQuestion(tf("1", "react", true), true)).toBe(1);
    expect(gradeQuestion(tf("1", "react", true), false)).toBe(0);
    expect(gradeQuestion(tf("1", "react", false), false)).toBe(1);
  });

  it("selección múltiple: crédito parcial", () => {
    const q = ms("1", "react", [0, 2]);
    expect(gradeQuestion(q, [0, 2])).toBe(1); // ambas correctas
    expect(gradeQuestion(q, [0])).toBe(0.5); // media
    expect(gradeQuestion(q, [])).toBe(0);
  });

  it("selección múltiple: marcarlo todo NO garantiza el máximo", () => {
    const q = ms("1", "react", [0, 2]);
    // 2 aciertos y 3 fallos → (2-3)/2 < 0, se recorta a 0.
    expect(gradeQuestion(q, [0, 1, 2, 3, 4])).toBe(0);
  });

  it("ordenar: crédito por posiciones acertadas", () => {
    const q = ord("1", "react", [2, 0, 3, 1]);
    expect(gradeQuestion(q, [2, 0, 3, 1])).toBe(1);
    expect(gradeQuestion(q, [2, 0, 1, 3])).toBe(0.5); // 2 de 4 posiciones
    expect(gradeQuestion(q, [1, 3, 0, 2])).toBe(0);
  });

  it("una respuesta nula nunca puntúa", () => {
    expect(gradeQuestion(mc("1", "react", 0), null)).toBe(0);
    expect(gradeQuestion(tf("1", "react", true), null)).toBe(0);
    expect(gradeQuestion(ord("1", "react", [0, 1, 2, 3]), null)).toBe(0);
  });
});

describe("gradeAnswers", () => {
  it("puntúa por tag y global mezclando tipos", () => {
    const questions = [mc("1", "react", 0), tf("2", "react", true), mc("3", "docker", 2)];
    // react: acierta la 1, falla la 2 → 50; docker: acierta → 100
    const { skillScores, overall } = gradeAnswers(questions, [0, false, 2]);
    expect(skillScores.react).toBe(50);
    expect(skillScores.docker).toBe(100);
    expect(overall).toBe(67); // 2/3
  });

  it("agrega el crédito parcial al score del tag", () => {
    const { skillScores } = gradeAnswers([ms("1", "react", [0, 2])], [[0]]);
    expect(skillScores.react).toBe(50);
  });

  it("maneja examen vacío", () => {
    expect(gradeAnswers([], []).overall).toBe(0);
  });

  it("normaliza el tag a minúsculas", () => {
    const { skillScores } = gradeAnswers([mc("1", "React", 0)], [0]);
    expect(skillScores.react).toBe(100);
  });
});

describe("isValidAnswerFor — la forma debe coincidir con el tipo", () => {
  it("rechaza formas cruzadas entre tipos", () => {
    expect(isValidAnswerFor(mc("1", "r", 0), true)).toBe(false);
    expect(isValidAnswerFor(tf("1", "r", true), 1)).toBe(false);
    expect(isValidAnswerFor(ms("1", "r", [0]), 0)).toBe(false);
    expect(isValidAnswerFor(ord("1", "r", [0, 1, 2, 3]), 0)).toBe(false);
  });

  it("acepta las formas correctas", () => {
    expect(isValidAnswerFor(mc("1", "r", 0), 3)).toBe(true);
    expect(isValidAnswerFor(tf("1", "r", true), false)).toBe(true);
    expect(isValidAnswerFor(ms("1", "r", [0]), [1, 4])).toBe(true);
    expect(isValidAnswerFor(ord("1", "r", [0, 1, 2, 3]), [3, 2, 1, 0])).toBe(true);
  });

  it("rechaza índices fuera de rango o repetidos", () => {
    expect(isValidAnswerFor(mc("1", "r", 0), 4)).toBe(false);
    expect(isValidAnswerFor(mc("1", "r", 0), -1)).toBe(false);
    expect(isValidAnswerFor(ms("1", "r", [0]), [1, 1])).toBe(false);
  });

  it("ordenar exige una permutación completa", () => {
    expect(isValidAnswerFor(ord("1", "r", [0, 1, 2, 3]), [0, 1, 2])).toBe(false);
    expect(isValidAnswerFor(ord("1", "r", [0, 1, 2, 3]), [0, 0, 1, 2])).toBe(false);
  });
});

describe("isValidAnswerSet", () => {
  const questions = [mc("1", "react", 0), tf("2", "docker", true)];

  it("acepta un set completo y bien formado", () => {
    expect(isValidAnswerSet(questions, [3, false])).toBe(true);
  });

  it("rechaza un set incompleto (antes puntuaba en silencio)", () => {
    expect(isValidAnswerSet(questions, [3])).toBe(false);
  });

  it("rechaza un set más largo que el examen", () => {
    expect(isValidAnswerSet(questions, [0, true, 1])).toBe(false);
  });

  it("acepta el examen vacío con respuestas vacías", () => {
    expect(isValidAnswerSet([], [])).toBe(true);
  });
});

describe("stripAnswerKey — invariante I1", () => {
  it("elimina la clave de CADA tipo de pregunta", () => {
    const questions: Question[] = [
      mc("1", "react", 2),
      code("2", "react", 1),
      ms("3", "react", [0, 2]),
      tf("4", "react", true),
      ord("5", "react", [2, 0, 3, 1]),
    ];
    const stripped = stripAnswerKey(questions);
    const serialized = JSON.stringify(stripped);

    for (const key of ["correctIndex", "correctIndexes", "correct", "correctOrder", "source"]) {
      expect(serialized.includes(`"${key}"`)).toBe(false);
    }
  });

  it("conserva lo que el candidato necesita para responder", () => {
    const [stripped] = stripAnswerKey([code("1", "react", 1)]);
    expect(stripped.type).toBe("code_output");
    expect("options" in stripped && stripped.options).toHaveLength(4);
    expect("code" in stripped && stripped.code).toBe("const x = 1;");
  });

  it("no filtra la fuente atribuida por el modelo", () => {
    const conFuente = { ...mc("1", "react", 2), source: "https://react.dev" };
    expect("source" in stripAnswerKey([conFuente])[0]).toBe(false);
  });
});

describe("normalizeStoredQuestions — compatibilidad con repertorios antiguos", () => {
  it("asume opción múltiple si falta el tipo", () => {
    const legacy = {
      id: "1",
      briefing: "b",
      text: "t",
      tag: "react",
      difficulty: "senior",
      options: ["a", "b", "c", "d"],
      correctIndex: 1,
    } as unknown as Question;

    const [fixed] = normalizeStoredQuestions([legacy]);
    expect(fixed.type).toBe("multiple_choice");
    expect(gradeQuestion(fixed, 1)).toBe(1);
  });

  it("respeta el tipo cuando ya existe", () => {
    expect(normalizeStoredQuestions([tf("1", "react", true)])[0].type).toBe("true_false");
  });
});

describe("dedupeQuestions", () => {
  it("elimina enunciados repetidos ignorando mayúsculas y espacios", () => {
    const questions = [
      mc("1", "react", 0, "¿Cómo resuelves el N+1?"),
      mc("2", "react", 1, "  ¿CÓMO   resuelves el N+1?  "),
      mc("3", "docker", 2, "¿Cómo reduces el tamaño de la imagen?"),
    ];
    const out = dedupeQuestions(questions);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("descarta preguntas sin enunciado", () => {
    expect(dedupeQuestions([mc("1", "react", 0, "   ")])).toHaveLength(0);
  });
});

describe("pickRandomQuestions", () => {
  const pool = [...poolOf("react", 10), ...poolOf("docker", 10)];

  it("devuelve exactamente la cantidad pedida", () => {
    expect(pickRandomQuestions(pool, 5)).toHaveLength(5);
  });

  it("nunca repite una pregunta dentro del mismo examen", () => {
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomQuestions(pool, 8);
      expect(new Set(picked.map((p) => p.id)).size).toBe(8);
    }
  });

  it("estratifica por tag: reparte el examen entre las skills", () => {
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomQuestions(pool, 4);
      expect(picked.filter((p) => p.tag === "react")).toHaveLength(2);
    }
  });

  it("estratifica también por TIPO de pregunta", () => {
    // Un solo tag, cuatro tipos con 5 preguntas cada uno: un examen de 4 debe traer uno de cada.
    const mixto: Question[] = [
      ...Array.from({ length: 5 }, (_, i) => mc(`mc${i}`, "react", 0, `mc ${i}`)),
      ...Array.from({ length: 5 }, (_, i) => tf(`tf${i}`, "react", true, `tf ${i}`)),
      ...Array.from({ length: 5 }, (_, i) => ms(`ms${i}`, "react", [0], `ms ${i}`)),
      ...Array.from({ length: 5 }, (_, i) => ord(`or${i}`, "react", [0, 1, 2, 3], `or ${i}`)),
    ];
    for (let i = 0; i < 20; i++) {
      const counts = countByType(pickRandomQuestions(mixto, 4));
      expect(counts.multiple_choice).toBe(1);
      expect(counts.true_false).toBe(1);
      expect(counts.multi_select).toBe(1);
      expect(counts.ordering).toBe(1);
    }
  });

  it("no se queda corto si un grupo tiene menos preguntas que su turno", () => {
    const desigual = [...poolOf("react", 1), ...poolOf("docker", 9)];
    expect(pickRandomQuestions(desigual, 5)).toHaveLength(5);
  });

  it("devuelve todo el repertorio si es menor o igual que el examen", () => {
    expect(pickRandomQuestions(poolOf("react", 3), 5)).toHaveLength(3);
  });

  it("maneja repertorio vacío y cantidades no positivas", () => {
    expect(pickRandomQuestions([], 5)).toEqual([]);
    expect(pickRandomQuestions(pool, 0)).toEqual([]);
  });

  it("varía el examen entre candidatos (el sorteo es real)", () => {
    const firmas = new Set(
      Array.from({ length: 30 }, () =>
        pickRandomQuestions(pool, 5)
          .map((p) => p.id)
          .sort((a, b) => a.localeCompare(b))
          .join("|")
      )
    );
    expect(firmas.size).toBeGreaterThan(1);
  });
});

describe("normalizeSimulationParams", () => {
  it("acepta las especialidades históricas", () => {
    expect(normalizeSimulationParams("backend", "junior")).toEqual({
      subject: "backend",
      kind: "specialty",
      level: "junior",
    });
  });

  it("acepta cualquier tecnología del catálogo", () => {
    expect(normalizeSimulationParams("postgresql", "mid")).toEqual({
      subject: "postgresql",
      kind: "technology",
      level: "mid",
    });
    expect(normalizeSimulationParams("rust", "junior")).toEqual({
      subject: "rust",
      kind: "technology",
      level: "junior",
    });
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(normalizeSimulationParams("DevOps", "MID")).toEqual({
      subject: "devops",
      kind: "specialty",
      level: "mid",
    });
    expect(normalizeSimulationParams("  React  ", "SENIOR")).toEqual({
      subject: "react",
      kind: "technology",
      level: "senior",
    });
  });

  it("'master' ya no es un nivel válido: senior es el techo", () => {
    expect(LEVELS).toEqual(["junior", "mid", "senior"]);
    expect(normalizeSimulationParams("react", "master")).toEqual({
      subject: "react",
      kind: "technology",
      level: "senior",
    });
  });

  it("cae a valores por defecto ante entradas inventadas (evita bancos infinitos)", () => {
    expect(normalizeSimulationParams("no-existe", "ultra")).toEqual({
      subject: "frontend",
      kind: "specialty",
      level: "senior",
    });
    expect(normalizeSimulationParams(undefined, null)).toEqual({
      subject: "frontend",
      kind: "specialty",
      level: "senior",
    });
  });
});

describe("SPECIALTY_STACKS", () => {
  it("define los stacks esperados", () => {
    expect(SPECIALTY_STACKS.frontend).toContain("react");
    expect(SPECIALTY_STACKS.backend).toContain("postgresql");
    expect(SPECIALTY_STACKS.devops).toContain("kubernetes");
  });
});

describe("H1 — sin responder, preferencia por lo no visto y opciones barajadas", () => {
  it("acepta null como 'sin responder' y lo corrige como fallada", () => {
    const questions = [mc("1", "react", 3), tf("2", "react", false)];
    expect(isValidAnswerSet(questions, [3, null])).toBe(true);
    expect(isValidAnswerSet(questions, [null, null])).toBe(true);
    expect(gradeAnswers(questions, [3, null]).overall).toBe(50);
  });

  it("prioriza las preguntas que el usuario no ha visto", () => {
    const pool = Array.from({ length: 25 }, (_, i) => mc(String(i), "react", 0, `q${i}`));
    const seen = new Set(pool.slice(0, 20).map((q) => q.id));
    // Las 20 primeras ya se vieron (rango = su índice); las 5 últimas nunca.
    const recency = (q: Question) => (seen.has(q.id) ? Number(q.id) : undefined);
    for (let run = 0; run < 20; run++) {
      const picked = pickRandomQuestions(pool, 10, recency);
      const ids = new Set(picked.map((q) => q.id));
      for (const fresh of ["20", "21", "22", "23", "24"]) expect(ids.has(fresh)).toBe(true);
      // Las 5 restantes son las vistas hace más tiempo (ids 0–4).
      const old = picked.filter((q) => seen.has(q.id)).map((q) => Number(q.id));
      expect(Math.max(...old)).toBeLessThan(5);
    }
  });

  it("sin historial sigue sorteando igual que antes", () => {
    const pool = Array.from({ length: 25 }, (_, i) => mc(String(i), "react", 0, `q${i}`));
    expect(pickRandomQuestions(pool, 20)).toHaveLength(20);
  });
});

describe("shuffleQuestionOptions", () => {
  const answerText = (q: Question): unknown => {
    switch (q.type) {
      case "multiple_choice":
      case "code_output":
        return q.options[q.correctIndex];
      case "multi_select":
        return q.correctIndexes.map((i) => q.options[i]).sort((a, b) => a.localeCompare(b));
      case "ordering":
        return q.correctOrder.map((i) => q.items[i]);
      case "true_false":
        return q.correct;
    }
  };

  it("cambia el orden pero la respuesta correcta sigue siendo la misma", () => {
    const originals: Question[] = [
      mc("1", "react", 2),
      ms("2", "react", [0, 3]),
      ord("3", "react", [2, 0, 3, 1]),
      tf("4", "react", true),
    ];
    let moved = false;
    for (let run = 0; run < 50; run++) {
      for (const q of originals) {
        const s = shuffleQuestionOptions(q);
        expect(answerText(s)).toEqual(answerText(q));
        if (s.type === "multiple_choice" && q.type === "multiple_choice" && s.correctIndex !== q.correctIndex) {
          moved = true;
        }
      }
    }
    expect(moved).toBe(true);
  });

  it("corregir la copia barajada da la nota correcta", () => {
    const q = shuffleQuestionOptions(ord("1", "react", [2, 0, 3, 1]));
    if (q.type !== "ordering") throw new Error("tipo");
    expect(gradeQuestion(q, q.correctOrder)).toBe(1);
  });

  it("no baraja si una opción depende de su posición", () => {
    const q: MultipleChoiceQuestion = {
      ...mc("1", "react", 3),
      options: ["useMemo", "useEffect", "useRef", "Todas las anteriores"],
    };
    for (let run = 0; run < 20; run++) expect(shuffleQuestionOptions(q)).toBe(q);
  });

  it("no muta la pregunta original", () => {
    const q = mc("1", "react", 2);
    const before = JSON.stringify(q);
    shuffleQuestionOptions(q);
    expect(JSON.stringify(q)).toBe(before);
  });
});
