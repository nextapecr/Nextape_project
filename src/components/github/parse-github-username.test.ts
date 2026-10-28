import { describe, it, expect } from "vitest";
import { parseGithubUsername } from "./GithubEvidenceCard";

describe("parseGithubUsername", () => {
  it("extrae el usuario de una URL de GitHub", () => {
    expect(parseGithubUsername("https://github.com/facebook")).toBe("facebook");
    expect(parseGithubUsername("http://github.com/torvalds/")).toBe("torvalds"); // NOSONAR typescript:S5332 — prueba de entrada con http
    expect(parseGithubUsername("github.com/vercel")).toBe("vercel");
  });

  it("ignora la ruta del repositorio y los parámetros", () => {
    expect(parseGithubUsername("https://github.com/facebook/react")).toBe("facebook");
    expect(parseGithubUsername("https://github.com/vercel?tab=repositories")).toBe("vercel");
  });

  it("acepta un usuario suelto", () => {
    expect(parseGithubUsername("sebasq44")).toBe("sebasq44");
    expect(parseGithubUsername("  spaced  ")).toBe("spaced");
  });

  it("devuelve cadena vacía si no hay dato", () => {
    expect(parseGithubUsername(undefined)).toBe("");
    expect(parseGithubUsername(null)).toBe("");
    expect(parseGithubUsername("")).toBe("");
  });
});
