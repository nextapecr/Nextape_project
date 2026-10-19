import { describe, it, expect } from "vitest";
import { EXTENSION_MAP, universalParser } from "./universal-parser";

// La gramática se carga del language pack nativo; sin él (p. ej. un entorno sin binarios) se salta.
const grammarAvailable = (() => {
  try {
    return universalParser.canParse("probe.ts");
  } catch {
    return false;
  }
})();

describe.skipIf(!grammarAvailable)("universalParser con archivos grandes", () => {
  it("parsea archivos de más de 32 KiB (antes tree-sitter lanzaba 'Invalid argument')", () => {
    const fn = (i: number) =>
      `export function handler${i}(input: number): number {\n  const doubled = input * 2;\n  return doubled + ${i};\n}\n`;
    const source = Array.from({ length: 900 }, (_, i) => fn(i)).join("\n");
    expect(source.length).toBeGreaterThan(64 * 1024);

    const ast = universalParser.parse(source, "big-module.ts");

    expect(ast.language).toBe(EXTENSION_MAP[".ts"]);
    expect(ast.hasParseErrors).toBe(false);
  });
});

describe.skipIf(!grammarAvailable)("universalParser: integración con AST → IR → Engine", () => {
  it("analiza repositorio TypeScript completo con AST, IR y skillScores", async () => {
    const { buildUniversalIR } = await import("@/services/github-engine/ir/universal-ir-builder");
    const { analyzeRepositorySources } = await import("@/services/github-engine");

    const sampleCode = `
import { getDocById, setDocById } from '@/lib/firebase/firestore';
import type { UserProfile } from '@/types/user.types';

export async function fetchUser(uid: string): Promise<UserProfile | null> {
  if (!uid) {
    throw new Error('UID es requerido');
  }
  return getDocById<UserProfile>('users', uid);
}

export class UserService {
  async save(uid: string, data: Partial<UserProfile>): Promise<void> {
    if (!uid || !data) return;
    await setDocById('users', uid, data);
  }
}

describe('UserService Test', () => {
  it('should fetch user', async () => {
    expect(true).toBe(true);
  });
});
`;

    // 1. Parse con universal-parser (usa typescript-estree para .ts)
    const parsedAST = universalParser.parse(sampleCode, "users.service.ts");
    expect(parsedAST.language).toBe("typescript");
    expect(parsedAST.hasParseErrors).toBe(false);
    expect(parsedAST.root).toBeDefined();

    // 2. AST → IR
    const fileIR = buildUniversalIR(
      parsedAST.root,
      "users.service.ts",
      parsedAST.language,
      parsedAST.hasParseErrors,
    );
    expect(fileIR.functions.length).toBeGreaterThanOrEqual(1);
    expect(fileIR.classes.length).toBeGreaterThanOrEqual(1);
    expect(fileIR.imports.length).toBeGreaterThanOrEqual(1);
    expect(fileIR.exports.length).toBeGreaterThanOrEqual(1);
    expect(fileIR.testCount).toBeGreaterThanOrEqual(1);

    // 3. Engine orchestrator con analyzers
    const mockSignals = {
      owner: "nextape",
      repo: "Nextape_project",
      lastCommitSHA: "a1b2c3d4e5f6",
      commitFrequency90d: 42,
      languages: { TypeScript: 120000, HTML: 5000 },
      hasTests: true,
      hasCI: true,
      hasReadme: true,
      readmeLength: 1500,
      sizeKB: 450,
      stargazersCount: 12,
    };

    const result = analyzeRepositorySources(
      [{ filename: "src/services/users.service.ts", content: sampleCode }],
      mockSignals,
    );

    expect(result.skillScores.overall).toBeGreaterThan(0);
    expect(result.skillScores.architecture).toBeGreaterThan(0);
    expect(result.skillScores.testing).toBeGreaterThan(0);
    expect(result.skillScores.security).toBeGreaterThan(0);
    expect(result.skillScores.maintainability).toBeGreaterThan(0);
    expect(result.skillScores.documentation).toBeGreaterThan(0);
    expect(Array.isArray(result.skillScores.topWeaknesses)).toBe(true);
  });
});

describe("universalParser: soporte Python", () => {
  it.skipIf(process.platform === "win32")("parsea código Python y falla si gramática no disponible (Linux-only)", () => {
    // En Linux: si la gramática de Python no está disponible, el test DEBE fallar explícitamente
    // Sin try/catch que oculte el problema
    const pythonCode = `
def greet(name: str) -> str:
    """Returns a greeting message."""
    return f"Hello, {name}!"

def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

class Calculator:
    def add(self, a: int, b: int) -> int:
        return a + b
`;

    const ast = universalParser.parse(pythonCode, "math.py");

    // Assertions: si la gramática no está disponible, parse() lanzará error
    // y el test fallará (comportamiento deseado en Linux)
    expect(ast.language).toBe(EXTENSION_MAP[".py"]);
    expect(ast.root).toBeDefined();
    expect(ast.root.type).toBeTruthy();
  });
});
