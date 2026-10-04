/**
 * @fileOverview TypeScript/JavaScript parser usando @typescript-eslint/typescript-estree
 *
 * STRATEGY CHANGE (Oct 3, 2026):
 * Después de 3 intentos fallidos con tree-sitter native bindings en Netlify
 * (ver TYPESCRIPT_PARSER_FAILURE_COMPLETE_REPORT.md), cambiamos a typescript-estree
 * para TS/JS/TSX: JavaScript puro, sin binarios nativos, sin fallos de instalación.
 *
 * Este parser genera AST en formato ESTree (estándar), no Tree-sitter.
 * Los nombres de nodos son distintos: Program, FunctionDeclaration, ClassDeclaration, etc.
 * El universal-ir-builder.ts debe mapearlo al mismo EngineeringIR de salida.
 */

import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { LanguageParser, ParsedAST, ASTNode } from './language-parser.interface';

/**
 * Convierte un nodo ESTree al formato ASTNode genérico que el motor consume.
 * ESTree tiene una estructura distinta a Tree-sitter:
 * - No tiene text directo (lo extraemos del source)
 * - loc.start.line/end.line son 1-indexed (perfecto)
 * - children no es un array explícito, están en propiedades typed
 */
function convertESTreeNode(
  node: TSESTree.Node,
  source: string,
  maxDepth = 30,
  currentDepth = 0,
): ASTNode {
  // Extraer texto del source usando range
  const text = node.range ? source.slice(node.range[0], node.range[1]) : '';

  // Recolectar children de propiedades del nodo
  const children: ASTNode[] = [];
  
  if (currentDepth < maxDepth) {
    // ESTree nodes tienen children en propiedades específicas, no en un array
    // Iteramos todas las propiedades y convertimos los que son nodos
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') {
        continue; // Skip metadata
      }
      
      const value = (node as unknown as Record<string, unknown>)[key];
      
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          // Array de nodos (ej: body: Statement[])
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              children.push(convertESTreeNode(item as TSESTree.Node, source, maxDepth, currentDepth + 1));
            }
          }
        } else if ('type' in value) {
          // Nodo individual (ej: expression: Expression)
          children.push(convertESTreeNode(value as TSESTree.Node, source, maxDepth, currentDepth + 1));
        }
      }
    }
  }

  return {
    type: node.type,
    text,
    startLine: node.loc?.start.line ?? 0,
    endLine: node.loc?.end.line ?? 0,
    children,
  };
}

class TypeScriptESTreeParser implements LanguageParser {
  readonly language = 'typescript'; // Identificador genérico para TS/JS/TSX

  private readonly SUPPORTED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.mts', '.cts',
    '.js', '.jsx', '.mjs', '.cjs',
  ]);

  canParse(filename: string): boolean {
    const lower = filename.toLowerCase();
    return Array.from(this.SUPPORTED_EXTENSIONS).some((ext) => lower.endsWith(ext));
  }

  parse(source: string, filename: string): ParsedAST {
    const lower = filename.toLowerCase();
    
    // Determinar si es TSX/JSX por extensión
    const isTSX = lower.endsWith('.tsx');
    const isJSX = lower.endsWith('.jsx');
    
    // Determinar lenguaje específico para metadata
    let language = 'javascript';
    if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
      language = 'typescript';
    } else if (isTSX) {
      language = 'tsx';
    }

    try {
      const ast = parse(source, {
        // typescript-estree options
        jsx: isTSX || isJSX, // Enable JSX parsing for .tsx/.jsx
        loc: true,           // Include location info (line/column)
        range: true,         // Include range info (start/end byte offsets)
        tokens: false,       // No necesitamos tokens individuales
        comment: false,      // No necesitamos comentarios
        // Tolerant parsing: intenta parsear incluso con errores
        errorOnUnknownASTType: false,
        errorOnTypeScriptSyntacticAndSemanticIssues: false,
      });

      return {
        language,
        filename,
        root: convertESTreeNode(ast, source),
        hasParseErrors: false, // typescript-estree no expone parse errors directamente
      };
    } catch (err) {
      console.error(
        `[typescript-estree-parser] Parse error for "${filename}":`,
        err instanceof Error ? err.message : err,
      );
      
      // En caso de error, devolver un AST vacío pero válido
      return {
        language,
        filename,
        root: {
          type: 'Program',
          text: '',
          startLine: 0,
          endLine: 0,
          children: [],
        },
        hasParseErrors: true,
      };
    }
  }
}

export const typescriptESTreeParser: LanguageParser = new TypeScriptESTreeParser();
