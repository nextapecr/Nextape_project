/**
 * @fileOverview Universal IR Builder para todos los lenguajes soportados.
 *
 * Transforma el AST de Tree-sitter O ESTree de CUALQUIER lenguaje soportado en la
 * representación intermedia universal (EngineeringIR).
 *
 * DUAL FORMAT SUPPORT (Oct 3, 2026):
 * - Tree-sitter format: snake_case node types (function_declaration, class_declaration)
 * - ESTree format: PascalCase node types (FunctionDeclaration, ClassDeclaration)
 *   usado por @typescript-eslint/typescript-estree para TS/JS/TSX
 *
 * PASO 4 — DOCUMENTACIÓN DE CONCEPTOS AUSENTES POR LENGUAJE:
 * - Go y C: NO poseen el concepto de clases orientadas a objetos. El builder
 *   devuelve `classes: []` sin error.
 * - Shell/Bash y HCL (Terraform): NO tienen clases ni funciones con estado.
 *   El builder recopila comandos/funciones y asigna `classes: []`.
 * - C/C++: No tienen `import_statement` nativo, pero capturan `#include` como imports.
 * - Solidity: Utiliza `contract_declaration` que se mapea a `class`.
 */

import type { ASTNode } from '../parsers/language-parser.interface';
import type { FileIR, IRFunction, IRClass, IRImport, IRExport } from './types';

// Nodos que indican funciones o métodos en diversos lenguajes
// Tree-sitter format (snake_case) + ESTree format (PascalCase)
const UNIVERSAL_FUNCTION_NODES = new Set([
  // Tree-sitter
  'function_declaration',
  'function_definition',
  'function_expression',
  'arrow_function',
  'method_definition',
  'method_declaration',
  'function_item',          // Rust
  'method',                 // Ruby
  'singleton_method',       // Ruby
  'generator_function_declaration',
  'generator_function',
  // ESTree (TypeScript/JavaScript)
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'MethodDefinition',
]);

// Nodos que indican clases, estructuras o contratos en diversos lenguajes
// Tree-sitter format (snake_case) + ESTree format (PascalCase)
const UNIVERSAL_CLASS_NODES = new Set([
  // Tree-sitter
  'class_declaration',
  'class_definition',
  'struct_specifier',       // C/C++
  'contract_declaration',   // Solidity
  'interface_declaration',
  'enum_declaration',
  // ESTree (TypeScript/JavaScript)
  'ClassDeclaration',
  'ClassExpression',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSTypeAliasDeclaration',
]);

// Nodos que indican imports o includes
// Tree-sitter format (snake_case) + ESTree format (PascalCase)
const UNIVERSAL_IMPORT_NODES = new Set([
  // Tree-sitter
  'import_statement',
  'import_declaration',
  'import_from_statement',  // Python
  'preproc_include',        // C/C++
  'using_directive',        // C#
  'use_declaration',        // Rust
  'namespace_use_declaration', // PHP
  // ESTree (TypeScript/JavaScript)
  'ImportDeclaration',
  'TSImportEqualsDeclaration',
]);

// Nodos de decisión para complejidad ciclomática universal
// Tree-sitter format (snake_case) + ESTree format (PascalCase)
const UNIVERSAL_COMPLEXITY_NODES = new Set([
  // Tree-sitter
  'if_statement',
  'if_expression',
  'else_clause',
  'elif_clause',
  'for_statement',
  'for_in_statement',
  'for_range_statement',
  'while_statement',
  'while_expression',
  'do_statement',
  'case_clause',
  'switch_case',
  'catch_clause',
  'conditional_expression',
  // ESTree (TypeScript/JavaScript)
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchCase',
  'CatchClause',
  'ConditionalExpression',
]);

function findAll(node: ASTNode, types: Set<string>): ASTNode[] {
  const results: ASTNode[] = [];
  const queue: ASTNode[] = [node];
  while (queue.length) {
    const current = queue.shift()!;
    if (types.has(current.type)) results.push(current);
    for (const child of current.children) queue.push(child);
  }
  return results;
}

function extractName(node: ASTNode): string {
  // ESTree nodes have 'id' property with the identifier
  // Tree-sitter nodes have 'identifier' child nodes
  const nameNode = node.children.find(
    (c) =>
      c.type === 'identifier' ||
      c.type === 'property_identifier' ||
      c.type === 'field_identifier' ||
      c.type === 'type_identifier' ||
      c.type === 'name' ||
      c.type === 'Identifier', // ESTree
  );
  return nameNode ? nameNode.text : '(anonymous)';
}

function calcComplexity(fnNode: ASTNode): number {
  let count = 1;
  const queue: ASTNode[] = [...fnNode.children];
  while (queue.length) {
    const node = queue.shift()!;
    if (UNIVERSAL_COMPLEXITY_NODES.has(node.type)) {
      count++;
    }
    if (!UNIVERSAL_FUNCTION_NODES.has(node.type)) {
      for (const child of node.children) queue.push(child);
    }
  }
  return count;
}

function extractFunctions(root: ASTNode): IRFunction[] {
  const fnNodes = findAll(root, UNIVERSAL_FUNCTION_NODES);
  return fnNodes.map((fn) => {
    const name = extractName(fn);
    const nameLower = name.toLowerCase();
    const isTest =
      nameLower.startsWith('test') ||
      nameLower.endsWith('test') ||
      nameLower.includes('spec') ||
      fn.text.includes('describe(') ||
      fn.text.includes('it(') ||
      fn.text.includes('TEST(') ||
      fn.text.includes('TEST_F(') ||
      fn.text.includes('expect(');

    const hasDoc = fn.text.trimStart().startsWith('/**') || fn.text.trimStart().startsWith('//') || fn.text.trimStart().startsWith('#') || fn.text.trimStart().startsWith('///');

    return {
      name,
      startLine: fn.startLine,
      endLine: fn.endLine,
      cyclomaticComplexity: calcComplexity(fn),
      paramCount: 0,
      hasDoc,
      isTest,
    };
  });
}

function extractClasses(root: ASTNode, language: string): IRClass[] {
  // Go y C no tienen clases -> retornado directo sin buscar
  if (language === 'go' || language === 'c' || language === 'bash' || language === 'hcl') {
    return [];
  }

  const classNodes = findAll(root, UNIVERSAL_CLASS_NODES);
  return classNodes.map((cls) => ({
    name: extractName(cls),
    startLine: cls.startLine,
    endLine: cls.endLine,
    methodCount: findAll(cls, UNIVERSAL_FUNCTION_NODES).length,
    hasDoc: cls.text.trimStart().startsWith('/**') || cls.text.trimStart().startsWith('//') || cls.text.trimStart().startsWith('#'),
  }));
}

function extractImports(root: ASTNode): IRImport[] {
  const importNodes = findAll(root, UNIVERSAL_IMPORT_NODES);
  return importNodes.map((imp) => {
    const sourceNode = imp.children.find((c) => c.type === 'string' || c.type === 'system_lib_string' || c.type === 'path');
    const source = sourceNode ? sourceNode.text.replace(/['"<>]/g, '') : imp.text.slice(0, 30);
    const isExternal = !source.startsWith('.') && !source.startsWith('/');
    return { source, isExternal, isTypeOnly: false };
  });
}

function extractExports(root: ASTNode): IRExport[] {
  const exportNodes = findAll(root, new Set([
    'export_statement',
    'export_directive',
    // ESTree
    'ExportNamedDeclaration',
    'ExportDefaultDeclaration',
    'ExportAllDeclaration',
  ]));
  return exportNodes.map((exp) => ({
    name: extractName(exp),
    kind: 'unknown',
  }));
}

export function buildUniversalIR(
  root: ASTNode,
  filename: string,
  language: string,
  hasParseErrors: boolean,
): FileIR {
  const functions = extractFunctions(root);
  const classes = extractClasses(root, language);
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
