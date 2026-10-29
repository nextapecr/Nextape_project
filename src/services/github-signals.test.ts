import { describe, it, expect } from "vitest";
import { languageForPath, selectRepresentativeFiles, treeSignals, type RepoTreeEntry } from "./github-signals.service";
import { EXTENSION_MAP } from "./github-engine/parsers/universal-parser";

const blob = (path: string, size: number): RepoTreeEntry => ({ path, type: "blob", size });

describe("languageForPath", () => {
  it("usa el mapa de extensiones del motor", () => {
    expect(languageForPath("src/app.ts")).toBe(EXTENSION_MAP[".ts"]);
    expect(languageForPath("cmd/main.go")).toBe(EXTENSION_MAP[".go"]);
    expect(languageForPath("app/Tool.PY")).toBe(EXTENSION_MAP[".py"]);
  });

  it("descarta declaraciones, minificados y lenguajes no soportados", () => {
    expect(languageForPath("types/index.d.ts")).toBeNull();
    expect(languageForPath("public/vendor.min.js")).toBeNull();
    expect(languageForPath("README.md")).toBeNull();
  });

  it("el motor cubre al menos 20 lenguajes", () => {
    expect(new Set(Object.values(EXTENSION_MAP)).size).toBeGreaterThanOrEqual(20);
  });
});

describe("selectRepresentativeFiles", () => {
  const tree: RepoTreeEntry[] = [
    ...Array.from({ length: 8 }, (_, i) => blob(`src/module${i}.ts`, 5000 - i * 100)),
    blob("cmd/server.go", 3000),
    blob("cmd/worker.go", 2500),
    blob("app/tool.py", 1200),
    blob("node_modules/lib/index.ts", 9000),
    blob("src/tiny.ts", 20),
    blob("src/huge.ts", 10_000_000),
    blob("types/global.d.ts", 4000),
    { path: "src", type: "tree" },
  ];

  it("reparte la selección entre lenguajes en lugar de tomar solo el mayoritario", () => {
    const picked = selectRepresentativeFiles(tree, 6).map((f) => f.path);

    expect(picked).toHaveLength(6);
    expect(picked).toContain("cmd/server.go");
    expect(picked).toContain("cmd/worker.go");
    expect(picked).toContain("app/tool.py");
    // Dentro de un lenguaje, primero los archivos con más código.
    expect(picked).toContain("src/module0.ts");
    expect(picked).not.toContain("src/module7.ts");
  });

  it("excluye dependencias, archivos triviales o enormes y declaraciones", () => {
    const picked = selectRepresentativeFiles(tree, 50).map((f) => f.path);

    expect(picked).not.toContain("node_modules/lib/index.ts");
    expect(picked).not.toContain("src/tiny.ts");
    expect(picked).not.toContain("src/huge.ts");
    expect(picked).not.toContain("types/global.d.ts");
    expect(picked).toHaveLength(11);
  });

  it("devuelve vacío si no hay código soportado", () => {
    expect(selectRepresentativeFiles([blob("README.md", 3000)], 10)).toEqual([]);
  });
});

describe("treeSignals", () => {
  const file = (path: string, size = 100) => blob(path, size);

  it("detecta tests de varios lenguajes, CI y README", () => {
    expect(treeSignals([file("src/app.test.ts")]).hasTests).toBe(true);
    expect(treeSignals([file("pkg/handler_test.go")]).hasTests).toBe(true);
    expect(treeSignals([file("app/test_models.py")]).hasTests).toBe(true);
    expect(treeSignals([file("tests/conftest.py")]).hasTests).toBe(true);
    expect(treeSignals([file(".github/workflows/ci.yml")]).hasCI).toBe(true);
    expect(treeSignals([file("Jenkinsfile")]).hasCI).toBe(true);
    expect(treeSignals([file("README.md", 1234)])).toMatchObject({ hasReadme: true, readmeLength: 1234 });
  });

  it("un repo sin nada de eso queda en falso", () => {
    expect(treeSignals([file("src/index.ts"), file("docs/guide.md")])).toEqual({
      hasTests: false,
      hasCI: false,
      hasReadme: false,
      readmeLength: 0,
    });
  });
});
