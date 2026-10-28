/**
 * Pre-descarga las gramáticas de Tree-sitter que el GitHub Engine necesita.
 *
 * POR QUÉ EXISTE
 * `@kreuzberg/tree-sitter-language-pack` trae 21 gramáticas nativas y descarga el resto bajo
 * demanda, cacheándolas en disco. En un entorno serverless (Netlify Functions corre sobre Lambda)
 * eso es un problema doble: el sistema de archivos es efímero —cada arranque en frío empieza
 * limpio— y solo el directorio temporal es escribible. Descargar en el camino de la petición
 * significa latencia impredecible y, para el grupo completo (306 gramáticas), un timeout seguro.
 *
 * Este script hace esa descarga UNA vez, antes del despliegue, contra el mismo `cacheDir` que
 * usa el parser en runtime.
 *
 * SIN EJECUTARLO el sistema sigue funcionando: 20 de los 21 lenguajes del mapa de extensiones
 * se resuelven individualmente. El único que no es C# (`c_sharp`), que solo está disponible en
 * el grupo "all"; sus archivos quedan sin analizar y el score de arquitectura sale `null` con
 * explicación explícita, que es el comportamiento correcto y ya implementado.
 *
 * Uso:
 *   npx tsx scripts/predownload-grammars.ts          # solo lo que falte del mapa
 *   npx tsx scripts/predownload-grammars.ts --all    # el grupo completo (incluye C#)
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXTENSION_MAP } from "../src/services/github-engine/parsers/universal-parser";

interface LanguagePack {
  configure: (c: { cacheDir?: string }) => void;
  cacheDir: () => string;
  getLanguage: (l: string) => unknown;
  downloadGroup?: (g: string) => void;
  downloadedLanguages?: () => string[];
}

function main() {
  // Mismo criterio que `universal-parser.ts`: si cambia uno, cambia el otro.
  const cacheDir = process.env.TREE_SITTER_CACHE_DIR ?? join(tmpdir(), "tree-sitter-language-pack");

  const pack = require("@kreuzberg/tree-sitter-language-pack") as LanguagePack;
  pack.configure({ cacheDir });
  console.log(`Directorio de caché: ${pack.cacheDir()}\n`);

  if (process.argv.includes("--all")) {
    console.log("Descargando el grupo completo (incluye C#). Puede tardar y ocupa disco...");
    pack.downloadGroup?.("all");
    console.log(`✅ Gramáticas disponibles: ${pack.downloadedLanguages?.().length ?? "?"}\n`);
    return;
  }

  const languages = [...new Set(Object.values(EXTENSION_MAP))].sort((a, b) => a.localeCompare(b));
  let ok = 0;
  const failed: string[] = [];

  for (const lang of languages) {
    try {
      if (pack.getLanguage(lang)) {
        ok++;
        console.log(`  ✅ ${lang}`);
      } else {
        failed.push(lang);
        console.log(`  ❌ ${lang} (devolvió null)`);
      }
    } catch {
      failed.push(lang);
      console.log(`  ❌ ${lang} (no descargable individualmente)`);
    }
  }

  console.log(`\n${ok}/${languages.length} gramáticas listas.`);
  if (failed.length > 0) {
    console.log(`Sin resolver: ${failed.join(", ")}`);
    console.log("Para incluirlas, vuelve a ejecutar con --all.");
  }
}

main();
