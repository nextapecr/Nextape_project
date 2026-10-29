/**
 * @fileOverview Script de validación para los 20 lenguajes del Universal Parser.
 *
 * ⚠️ REQUISITO DE ENTORNO:
 * Este script requiere un entorno Linux x64 (Firebase Functions, WSL o Docker)
 * donde los bindings nativos de @kreuzberg/tree-sitter-language-pack estén disponibles.
 *
 * Ejecución:
 *   npx tsx scripts/validate-universal-parser.ts
 */

import './load-env';
import { universalParser } from '../src/services/github-engine/parsers/universal-parser';
import samples from './data/parser-samples.json';

interface LanguageTestCase {
  language: string;
  filename: string;
  snippet: string;
}

/** Un fragmento mínimo por lenguaje soportado (datos en `scripts/data/parser-samples.json`). */
const TEST_CASES: LanguageTestCase[] = samples;

async function main() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🧪 VALIDACIÓN DE 20 LENGUAJES — UNIVERSAL TREE-SITTER PARSER');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    const { language, filename, snippet } = testCase;
    process.stdout.write(`• Probando ${language.padEnd(16)} (${filename.padEnd(16)})... `);

    try {
      const canParse = universalParser.canParse(filename);
      if (!canParse) {
        console.log(`❌ FAIL (canParse retornó false)`);
        failed++;
        continue;
      }

      const ast = universalParser.parse(snippet, filename);
      if (ast.hasParseErrors) {
        console.log(`⚠️ WARN (parseado con errores sintácticos) [root: ${ast.root.type}]`);
      } else {
        console.log(`✅ OK [root: ${ast.root.type}, hijos: ${ast.root.children.length}]`);
      }
      passed++;
    } catch (err: unknown) {
      console.log(`❌ ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`RESUMEN: ${passed} pasaron | ${failed} fallaron de ${TEST_CASES.length} casos totales.`);
  console.log('════════════════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
