import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // JSX "automatic" como en Next: permite testear componentes .tsx sin `import React`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // scripts/lib: lógica pura de los scripts de terminal, testeable sin Firestore.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },
});
