/**
 * @fileOverview Conversor de AST de TypeScript (Tree-sitter) → EngineeringIR.
 *
 * Este módulo es el "adaptador" de TypeScript para el IR universal.
 * Cuando se añada un nuevo lenguaje, se crea un nuevo archivo (ej: python-to-ir.ts)
 * sin tocar este ni el resto del motor.
 *
 * IMPORTANTE — runtime Node.js exclusivo.
 * Recibe ASTNode (ya convertidos por typescript-parser.ts), no depende directamente
 * de tree-sitter en tiempo de ejecución. El import de ASTNode es solo de tipos.
 */

import type { ASTNode } from '../parsers/language-parser.interface';
import type { FileIR, IRFunction, IRClass, IRImport, IRExport } from './types';
import { findAll, findFirst } from './ast-traversal';

// ─────────────────────────────────────────────────────────
// Nodos de Tree-sitter que generan un punto de decisión
// (para cálculo de complejidad ciclomática)
// ─────────────────────────────────────────────────────────
const COMPLEXITY_NODES = new Set([
  'if_statement',
  'else_clause',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'switch_case',
  'catch_clause',
  'conditional_expression', // ternario: a ? b : c
  'binary_expression',      // &&, || (se filtra por operador abajo)
]);

const COMPLEXITY_OPERATORS = new Set(['&&', '||', '??']);

// ─────────────────────────────────────────────────────────
// Nodos que representan funciones o métodos
// ─────────────────────────────────────────────────────────
const FUNCTION_NODES = new Set([
  'function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'generator_function_declaration',
  'generator_function',
]);

// ─────────────────────────────────────────────────────────
// Utilidades de traversal
// ─────────────────────────────────────────────────────────



/** Extrae el texto de un nodo identificador o nombre */
function extractName(node: ASTNode): string {
  // El nombre suele ser un child con type 'identifier' o 'property_identifier'
  const nameNode = node.children.find(
    (c) => c.type === 'identifier' || c.type === 'property_identifier',
  );
  return nameNode?.text ?? '(anonymous)';
}

// ─────────────────────────────────────────────────────────
// Cálculo de complejidad ciclomática
// ─────────────────────────────────────────────────────────

/** Punto de decisión: if/for/case/ternario…, y `&&`/`||`/`??` (no cualquier binary_expression). */
function isDecisionPoint(node: ASTNode): boolean {
  if (!COMPLEXITY_NODES.has(node.type)) return false;
  if (node.type !== 'binary_expression') return true;
  const op = node.children.find(
    (c) => c.type === 'binary_operator' || c.type === '&&' || c.type === '||' || c.type === '??',
  );
  return op !== undefined && COMPLEXITY_OPERATORS.has(op.text);
}

/**
 * Calcula la complejidad ciclomática de un nodo función.
 * Fórmula simplificada: 1 + número de puntos de decisión.
 */
function calcCyclomaticComplexity(fnNode: ASTNode): number {
  let count = 1; // base complexity

  const queue: ASTNode[] = [...fnNode.children];
  while (queue.length) {
    const node = queue.shift()!;

    if (isDecisionPoint(node)) count++;

    // No entrar recursivamente a funciones anidadas (tendrían su propia complejidad)
    if (!FUNCTION_NODES.has(node.type)) {
      for (const child of node.children) queue.push(child);
    }
  }

  return count;
}

// ─────────────────────────────────────────────────────────
// Extracción de funciones
// ─────────────────────────────────────────────────────────

function extractFunctions(root: ASTNode): IRFunction[] {
  const fnNodes = findAll(root, FUNCTION_NODES);
  return fnNodes.map((fn): IRFunction => {
    // Nombre: para arrow_function el nombre puede estar en el padre (variable_declarator)
    const name = extractName(fn);

    // Parámetros: nodo 'formal_parameters'
    const paramsNode = findFirst(fn, 'formal_parameters') ?? findFirst(fn, 'parameters');
    const paramCount = paramsNode
      ? paramsNode.children.filter(
          (c) => c.type === 'identifier' || c.type === 'required_parameter' || c.type === 'optional_parameter' || c.type === 'rest_pattern',
        ).length
      : 0;

    // Doc: buscamos un comentario justo antes (en el texto del nodo padre)
    // Simplificación: se considera documentada si la línea anterior a startLine
    // contiene "/**" o "//"
    const hasDoc = fn.text.trimStart().startsWith('/**') || fn.text.trimStart().startsWith('//');

    // Es test: nombre contiene "test", "spec", o el tipo de nodo padre es "call_expression" a describe/it
    const nameLower = name.toLowerCase();
    const isTest =
      nameLower.includes('test') ||
      nameLower.includes('spec') ||
      nameLower.startsWith('it') ||
      nameLower.startsWith('describe') ||
      fn.text.includes('describe(') ||
      fn.text.includes('it(') ||
      fn.text.includes('test(') ||
      fn.text.includes('expect(');

    return {
      name,
      startLine: fn.startLine,
      endLine: fn.endLine,
      cyclomaticComplexity: calcCyclomaticComplexity(fn),
      paramCount,
      hasDoc,
      isTest,
    };
  });
}

// ─────────────────────────────────────────────────────────
// Extracción de clases
// ─────────────────────────────────────────────────────────

function extractClasses(root: ASTNode): IRClass[] {
  const classNodes = findAll(root, new Set(['class_declaration', 'class_expression']));
  return classNodes.map((cls): IRClass => {
    const name = extractName(cls);
    const methodCount = findAll(cls, new Set(['method_definition'])).length;
    const hasDoc = cls.text.trimStart().startsWith('/**') || cls.text.trimStart().startsWith('//');
    return {
      name,
      startLine: cls.startLine,
      endLine: cls.endLine,
      methodCount,
      hasDoc,
    };
  });
}

// ─────────────────────────────────────────────────────────
// Extracción de imports
// ─────────────────────────────────────────────────────────

function extractImports(root: ASTNode): IRImport[] {
  const importNodes = findAll(root, new Set(['import_statement']));
  return importNodes.map((imp): IRImport => {
    // El source suele ser el último child de tipo 'string'
    const sourceNode = imp.children.filter((c) => c.type === 'string').pop();
    const source = sourceNode ? sourceNode.text.replace(/['"]/g, '') : '';
    const isExternal = source.length > 0 && !source.startsWith('.') && !source.startsWith('/');
    const isTypeOnly = imp.text.includes('import type');
    return { source, isExternal, isTypeOnly };
  });
}

// ─────────────────────────────────────────────────────────
// Extracción de exports
// ─────────────────────────────────────────────────────────

function extractExports(root: ASTNode): IRExport[] {
  const exportNodes = findAll(root, new Set(['export_statement']));
  return exportNodes.flatMap((exp): IRExport[] => {
    // export function foo → function_declaration child
    const fnChild = exp.children.find((c) => c.type === 'function_declaration' || c.type === 'generator_function_declaration');
    if (fnChild) {
      return [{ name: extractName(fnChild), kind: 'function' }];
    }
    // export class Foo
    const clsChild = exp.children.find((c) => c.type === 'class_declaration');
    if (clsChild) {
      return [{ name: extractName(clsChild), kind: 'class' }];
    }
    // export const/let/var foo
    const declChild = exp.children.find((c) => c.type === 'lexical_declaration' || c.type === 'variable_declaration');
    if (declChild) {
      const varDecl = findFirst(declChild, 'variable_declarator');
      const name = varDecl ? extractName(varDecl) : '(unknown)';
      return [{ name, kind: 'variable' }];
    }
    // export type Foo / export interface Foo
    const typeChild = exp.children.find((c) => c.type === 'type_alias_declaration' || c.type === 'interface_declaration');
    if (typeChild) {
      return [{ name: extractName(typeChild), kind: 'type' }];
    }
    return [];
  });
}

// ─────────────────────────────────────────────────────────
// Función principal: AST → FileIR
// ─────────────────────────────────────────────────────────

/**
 * Convierte el ASTNode raíz de un archivo TypeScript/TSX en un FileIR.
 *
 * @param root     - Nodo raíz del AST (producido por typescript-parser.ts)
 * @param filename - Nombre del archivo (incluye extensión)
 * @param language - "typescript" | "tsx"
 * @param hasParseErrors - Si el parser detectó errores de sintaxis
 */
export function typescriptToIR(
  root: ASTNode,
  filename: string,
  language: string,
  hasParseErrors: boolean,
): FileIR {
  const functions = extractFunctions(root);
  const classes = extractClasses(root);
  const imports = extractImports(root);
  const exports = extractExports(root);

  const linesOfCode = root.endLine;
  const testCount = functions.filter((f) => f.isTest).length;

  return {
    filename,
    language,
    linesOfCode,
    functions,
    classes,
    imports,
    exports,
    testCount,
    hasParseErrors,
  };
}
