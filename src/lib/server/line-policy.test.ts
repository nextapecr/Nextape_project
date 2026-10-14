import { describe, it, expect } from "vitest";
import {
  applyAttemptToDna,
  attemptCooldownHours,
  attemptRule,
  attemptScope,
  isSubmissionLate,
  levelWeight,
  questionFingerprint,
  seenRanks,
  SEEN_MEMORY,
  SUBMIT_GRACE_MS,
  timeLimitMinutesFor,
  updateSeenList,
  weightedScore,
} from "./line-policy";
import { decideRateLimit } from "./rate-limit";

const HOUR = 60 * 60 * 1000;

describe("límite de intentos", () => {
  it("es 1 intento cada 24 h por defecto", () => {
    expect(attemptCooldownHours({})).toBe(24);
    expect(attemptRule(24)).toEqual({ limit: 1, windowMs: 24 * HOUR });
  });

  it("se puede ajustar o desactivar por variable de entorno (para probar en local)", () => {
    expect(attemptCooldownHours({ LINE_ATTEMPT_COOLDOWN_HOURS: "0" })).toBe(0);
    expect(attemptRule(0)).toBeNull();
    expect(attemptCooldownHours({ LINE_ATTEMPT_COOLDOWN_HOURS: "12" })).toBe(12);
    expect(attemptCooldownHours({ LINE_ATTEMPT_COOLDOWN_HOURS: "basura" })).toBe(24);
    expect(attemptCooldownHours({ LINE_ATTEMPT_COOLDOWN_HOURS: "-3" })).toBe(24);
  });

  it("el ámbito es la tecnología (sin nivel) o la vacante", () => {
    expect(attemptScope({ subject: "react" })).toBe("line_practice_react");
    expect(attemptScope({ jobId: "j1", subject: "react" })).toBe("line_job_j1");
  });

  it("un segundo intento dentro de las 24 h se rechaza y se abre al cumplirse", () => {
    const rule = attemptRule(24)!;
    const t0 = 1_000_000;
    const first = decideRateLimit(undefined, rule, t0);
    expect(first.allowed).toBe(true);
    const second = decideRateLimit(first.state, rule, t0 + 23 * HOUR);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBe(HOUR);
    expect(decideRateLimit(first.state, rule, t0 + 24 * HOUR).allowed).toBe(true);
  });
});

describe("tiempo límite", () => {
  it("30 minutos en práctica o si la vacante no lo fija", () => {
    expect(timeLimitMinutesFor(undefined)).toBe(30);
    expect(timeLimitMinutesFor(null)).toBe(30);
    expect(timeLimitMinutesFor("45")).toBe(30);
    expect(timeLimitMinutesFor(0)).toBe(30);
  });

  it("respeta lo que fija el reclutador, acotado a [5, 480]", () => {
    expect(timeLimitMinutesFor(45)).toBe(45);
    expect(timeLimitMinutesFor(2)).toBe(5);
    expect(timeLimitMinutesFor(10_000)).toBe(480);
    expect(timeLimitMinutesFor(12.6)).toBe(13);
  });

  it("acepta el envío hasta el margen de red y lo rechaza después", () => {
    const expiresAt = 1_000_000;
    expect(isSubmissionLate(expiresAt, expiresAt)).toBe(false);
    expect(isSubmissionLate(expiresAt, expiresAt + SUBMIT_GRACE_MS)).toBe(false);
    expect(isSubmissionLate(expiresAt, expiresAt + SUBMIT_GRACE_MS + 1)).toBe(true);
  });

  it("las sesiones de antes del cambio (sin expiresAt) no vencen", () => {
    expect(isSubmissionLate(undefined, Date.now())).toBe(false);
    expect(isSubmissionLate(null, Date.now())).toBe(false);
  });
});

describe("ponderación por nivel", () => {
  it("un 100 % vale 60 en junior, 80 en mid y 100 en senior", () => {
    expect(weightedScore(100, "junior")).toBe(60);
    expect(weightedScore(100, "mid")).toBe(80);
    expect(weightedScore(100, "senior")).toBe(100);
    expect(weightedScore(100, "Senior")).toBe(100);
  });

  it("un nivel desconocido (sesiones antiguas) no se castiga", () => {
    expect(levelWeight(undefined)).toBe(1);
    expect(weightedScore(70, "unknown")).toBe(70);
  });

  it("acota la nota a 0–100", () => {
    expect(weightedScore(150, "senior")).toBe(100);
    expect(weightedScore(-5, "senior")).toBe(0);
  });
});

describe("applyAttemptToDna", () => {
  it("el DNA es el promedio de los intentos ponderados, no el mejor", () => {
    let dna = applyAttemptToDna(undefined, { react: 100 }, { react: "senior" }, "senior", 1);
    expect(dna.scores.react).toBe(100);
    dna = applyAttemptToDna(dna, { react: 40 }, { react: "senior" }, "senior", 2);
    expect(dna.scores.react).toBe(70); // antes se quedaba en 100
  });

  it("conserva solo los últimos 3 intentos", () => {
    let dna = applyAttemptToDna(undefined, { react: 0 }, { react: "senior" }, "senior", 1);
    for (let i = 2; i <= 4; i++) {
      dna = applyAttemptToDna(dna, { react: 90 }, { react: "senior" }, "senior", i);
    }
    expect(dna.history.react).toHaveLength(3);
    expect(dna.scores.react).toBe(90); // el 0 ya salió del promedio
  });

  it("pondera cada skill con el nivel de SUS preguntas", () => {
    const dna = applyAttemptToDna(
      undefined,
      { react: 100, docker: 100 },
      { react: "senior", docker: "junior" },
      "senior",
      1,
    );
    expect(dna.scores).toEqual({ react: 100, docker: 60 });
  });

  it("migra el DNA antiguo como un intento más, sin perderlo de golpe", () => {
    const prev = { scores: { react: 90, python: 80 } };
    const dna = applyAttemptToDna(prev, { react: 50 }, { react: "senior" }, "senior", 5);
    expect(dna.scores.react).toBe(70);
    expect(dna.history.react[0]).toMatchObject({ score: 90, legacy: true });
    expect(dna.scores.python).toBe(80); // las skills no evaluadas no cambian
  });

  it("ignora historial corrupto", () => {
    const prev = { scores: { react: 50 }, history: { react: [{ score: "x" }, null] } };
    const dna = applyAttemptToDna(prev, { react: 100 }, { react: "senior" }, "senior", 1);
    // Sin entradas válidas en el historial, el score anterior entra como legado.
    expect(dna.scores.react).toBe(75);
  });
});

describe("variedad de preguntas", () => {
  it("la huella depende del enunciado, no del id ni de mayúsculas/espacios", () => {
    const a = questionFingerprint({ id: "0", text: "¿Qué hace  useEffect?" });
    const b = questionFingerprint({ id: "7", text: "¿qué hace useEffect?" });
    const c = questionFingerprint({ id: "0", text: "¿Qué hace useMemo?" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("la lista de vistas pone lo nuevo al final, sin duplicados y con tope", () => {
    expect(updateSeenList(["a", "b", "c"], ["b", "d"])).toEqual(["a", "c", "b", "d"]);
    expect(updateSeenList(undefined, ["x"])).toEqual(["x"]);
    const many = Array.from({ length: SEEN_MEMORY + 10 }, (_, i) => `q${i}`);
    expect(updateSeenList([], many)).toHaveLength(SEEN_MEMORY);
  });

  it("más reciente = rango mayor", () => {
    const r = seenRanks(["viejo", "nuevo"]);
    expect(r.get("viejo")).toBeLessThan(r.get("nuevo")!);
    expect(r.get("nunca")).toBeUndefined();
  });
});
