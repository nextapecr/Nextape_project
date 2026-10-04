/**
 * @fileOverview Universal Language Parser con estrategia dual:
 * - TypeScript/JavaScript/TSX: @typescript-eslint/typescript-estree (JavaScript puro)
 * - Otros lenguajes: Tree-sitter con @kreuzberg/tree-sitter-language-pack (binarios nativos)
 *
 * STRATEGY CHANGE (Oct 3, 2026):
 * Después de 3 intentos fallidos para instalar tree-sitter Linux native bindings en Netlify,
 * cambiamos TS/JS/TSX a typescript-estree (JavaScript puro, sin dependencias nativas).
 * Ver: TYPESCRIPT_PARSER_FAILURE_COMPLETE_REPORT.md
 *
 * Tree-sitter se mantiene para TODOS los demás lenguajes (Python, Go, Java, Rust, etc.)
 * sin cambios. Este es un cambio quirúrgico solo para los 3 lenguajes que fallaban.
 *
 * Mapea extensiones de archivo a las 20 gramáticas universales soportadas.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Parser from 'tree-sitter';
import type { LanguageParser, ParsedAST, ASTNode } from './language-parser.interface';
import { typescriptESTreeParser } from './typescript-estree-parser';

/** Superficie del paquete nativo que este parser usa. */
interface LanguagePackModule {
  getLanguage?: (lang: string) => unknown;
  configure?: (config: { cacheDir?: string }) => void;
}

export const EXTENSION_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // C / C++
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.c': 'c',
  '.h': 'c',
  // Python
  '.py': 'python',
  '.pyw': 'python',
  // Java / Kotlin / Scala
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  // C#
  '.cs': 'c_sharp',
  // Go
  '.go': 'go',
  '.golang': 'go',
  // PHP
  '.php': 'php',
  // Rust
  '.rs': 'rust',
  // Ruby
  '.rb': 'ruby',
  // Swift
  '.swift': 'swift',
  // Dart
  '.dart': 'dart',
  // Shell / Bash
  '.sh': 'bash',
  '.bash': 'bash',
  // HCL / Terraform
  '.tf': 'hcl',
  '.hcl': 'hcl',
  // Elixir
  '.ex': 'elixir',
  '.exs': 'elixir',
  // Lua
  '.lua': 'lua',
  // Solidity
  '.sol': 'solidity',
};

function convertNode(tsNode: Parser.SyntaxNode, maxDepth = 30, currentDepth = 0): ASTNode {
  const children: ASTNode[] =
    currentDepth < maxDepth
      ? Array.from({ length: tsNode.childCount }, (_, i) => {
          const child = tsNode.child(i);
          return child
            ? convertNode(child, maxDepth, currentDepth + 1)
            : { type: 'null', text: '', startLine: 0, endLine: 0, children: [] };
        })
      : [];

  return {
    type: tsNode.type,
    text: tsNode.text,
    startLine: tsNode.startPosition.row + 1,
    endLine: tsNode.endPosition.row + 1,
    children,
  };
}

class UniversalParserImpl implements LanguageParser {
  readonly language = 'universal';

  private static cacheConfigured = false;

  private readonly ParserClass: typeof Parser = require('tree-sitter');
  private readonly grammarCache: Map<string, unknown> = new Map();
  private readonly parserCache: Map<string, Parser> = new Map();

  /**
   * Apunta la caché de gramáticas a un directorio escribible.
   *
   * El pack DESCARGA cada gramática la primera vez que se pide y la cachea. Por defecto usa
   * `~/.cache/...`, que en un entorno serverless (Netlify Functions corre sobre Lambda) no es
   * escribible: solo lo es el directorio temporal. Sin esto, la primera carga falla en producción
   * con un error de descarga y el parser devuelve null — que es justo el síntoma que parecía
   * "el lenguaje no está soportado en Linux".
   *
   * Se ejecuta una sola vez por proceso; los fallos no son fatales (se cae al comportamiento
   * por defecto del pack).
   */
  private ensureCacheConfigured(langPack: LanguagePackModule): void {
    if (UniversalParserImpl.cacheConfigured) return;
    UniversalParserImpl.cacheConfigured = true;

    try {
      if (typeof langPack.configure === 'function') {
        const dir = process.env.TREE_SITTER_CACHE_DIR
          ?? join(tmpdir(), 'tree-sitter-language-pack');
        langPack.configure({ cacheDir: dir });
      }
    } catch (err) {
      console.warn(
        '[universal-parser] No se pudo fijar el directorio de caché de gramáticas:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** Carga la gramática dinámicamente vía @kreuzberg/tree-sitter-language-pack */
  private loadLanguageGrammar(langKey: string): unknown | null {
    if (this.grammarCache.has(langKey)) {
      return this.grammarCache.get(langKey);
    }

    try {
      const langPack = require('@kreuzberg/tree-sitter-language-pack') as LanguagePackModule;
      
      this.ensureCacheConfigured(langPack);
      
      const grammar = typeof langPack.getLanguage === 'function'
        ? langPack.getLanguage(langKey)
        : null;

      if (grammar) {
        this.grammarCache.set(langKey, grammar);
      }
      return grammar;
    } catch (err) {
      console.error(
        `[universal-parser] Failed to load grammar for "${langKey}":`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  private getParserForLang(langKey: string): Parser | null {
    if (this.parserCache.has(langKey)) {
      return this.parserCache.get(langKey)!;
    }

    const grammar = this.loadLanguageGrammar(langKey);
    if (!grammar) return null;

    const parser = new this.ParserClass();
    parser.setLanguage(grammar);
    this.parserCache.set(langKey, parser);
    return parser;
  }

  canParse(filename: string): boolean {
    const lower = filename.toLowerCase();
    
    // STRATEGY: Route TS/JS/TSX to typescript-estree parser (no native bindings)
    if (typescriptESTreeParser.canParse(filename)) {
      return true;
    }
    
    // All other languages: use tree-sitter as before
    const ext = Object.keys(EXTENSION_MAP).find((e) => lower.endsWith(e));
    if (!ext) {
      return false;
    }
    const langKey = EXTENSION_MAP[ext];
    return this.loadLanguageGrammar(langKey) !== null;
  }

  parse(source: string, filename: string): ParsedAST {
    // STRATEGY: Route TS/JS/TSX to typescript-estree parser (no native bindings)
    if (typescriptESTreeParser.canParse(filename)) {
      return typescriptESTreeParser.parse(source, filename);
    }
    
    // All other languages: use tree-sitter as before
    const lower = filename.toLowerCase();
    const ext = Object.keys(EXTENSION_MAP).find((e) => lower.endsWith(e));
    const langKey = ext ? EXTENSION_MAP[ext] : 'typescript';

    const parser = this.getParserForLang(langKey);
    if (!parser) {
      throw new Error(`Gramática no disponible para ${langKey} (archivo: ${filename})`);
    }

    // tree-sitter usa por defecto un búfer de ~32 KiB y, con un texto mayor, lanza "Invalid argument".
    // El motor descartaba el archivo en silencio y, como la selección prioriza los archivos con más
    // código, se perdían justo los centrales (en rust-lang/mdBook, todos los .rs). El búfer se ajusta
    // al tamaño del archivo.
    const bufferSize = Math.max(32 * 1024, source.length * 4 + 1024);
    const tree: Parser.Tree = parser.parse(source, undefined, { bufferSize });
    const rootNode: Parser.SyntaxNode = tree.rootNode;

    return {
      language: langKey,
      filename,
      root: convertNode(rootNode),
      hasParseErrors: rootNode.hasError,
    };
  }
}

export const universalParser: LanguageParser = new UniversalParserImpl();

