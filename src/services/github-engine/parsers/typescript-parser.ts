/**
 * @fileOverview Parser de TypeScript/TSX usando Tree-sitter.
 *
 * ⚠️ RUNTIME RESTRICTION — bindings nativos de Node.js.
 * tree-sitter y tree-sitter-typescript compilan código nativo (N-API) que NO es
 * compatible con Cloudflare Workers / edge runtime.
 *
 * Protecciones en el proyecto:
 *   - next.config.ts → `serverExternalPackages`: Next.js los excluye del bundle.
 *   - open-next.config.ts → `edgeExternals`: esbuild los excluye del Worker.
 *   - Cualquier route handler que importe este módulo (directamente o via el engine)
 *     DEBE declarar `export const runtime = "nodejs"`.
 *
 * Implementa la interfaz LanguageParser — agregar un nuevo lenguaje = un archivo
 * nuevo que implementa la misma interfaz, sin tocar este archivo ni el orquestador.
 */

import type Parser from 'tree-sitter';
import type { LanguageParser, ParsedAST } from './language-parser.interface';
import { convertTreeSitterNode as convertNode } from './tree-sitter-node';

/** Extensiones de archivo que este parser maneja */
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];


/**
 * Implementación de LanguageParser para TypeScript y TSX.
 *
 * Los parsers de TS y TSX se inicializan de forma perezosa (lazy singletons)
 * para reutilizar el objeto Parser entre requests y evitar el coste de
 * inicialización repetida.
 */
class TypeScriptParserImpl implements LanguageParser {
  readonly language = 'typescript';

  // Usamos `require` en lugar de `import` porque tree-sitter se distribuye como
  // CJS y su módulo no tiene un export default compatible con ESM estricto.
  // `serverExternalPackages` en next.config.ts garantiza que este `require` se
  // ejecute en Node.js (nunca en el bundle de Webpack/Cloudflare).
  private readonly ParserClass: typeof Parser = require('tree-sitter');
  private readonly tsLang: { typescript: unknown; tsx: unknown } = require('tree-sitter-typescript');

  private _parserTS: Parser | null = null;
  private _parserTSX: Parser | null = null;

  private getParserTS(): Parser {
    if (!this._parserTS) {
      this._parserTS = new this.ParserClass();
      this._parserTS.setLanguage(this.tsLang.typescript);
    }
    return this._parserTS;
  }

  private getParserTSX(): Parser {
    if (!this._parserTSX) {
      this._parserTSX = new this.ParserClass();
      this._parserTSX.setLanguage(this.tsLang.tsx);
    }
    return this._parserTSX;
  }

  canParse(filename: string): boolean {
    const lower = filename.toLowerCase();
    return TS_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  parse(source: string, filename: string): ParsedAST {
    const isTSX = filename.toLowerCase().endsWith('.tsx');
    const parser = isTSX ? this.getParserTSX() : this.getParserTS();

    const tree: Parser.Tree = parser.parse(source);
    const rootNode: Parser.SyntaxNode = tree.rootNode;

    return {
      language: isTSX ? 'tsx' : 'typescript',
      filename,
      root: convertNode(rootNode),
      // hasError es una propiedad booleana en SyntaxNode (no una función)
      hasParseErrors: rootNode.hasError,
    };
  }
}

/**
 * Singleton exportado del parser de TypeScript/TSX.
 * El orquestador del engine llama `canParse(filename)` para elegir el parser
 * correcto antes de llamar `parse(source, filename)`.
 */
export const typescriptParser: LanguageParser = new TypeScriptParserImpl();
