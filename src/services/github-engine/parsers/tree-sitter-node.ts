import type Parser from 'tree-sitter';
import type { ASTNode } from './language-parser.interface';

/**
 * Convierte un SyntaxNode de Tree-sitter al ASTNode genérico del IR. Lo usan los parsers basados
 * en Tree-sitter (`universal-parser.ts` y el legado `typescript-parser.ts`), que antes tenían cada
 * uno su copia.
 *
 * La profundidad se limita para evitar stack overflows en archivos muy grandes o con anidamiento
 * extremo: el IR solo necesita la estructura a nivel de declaraciones.
 */
export function convertTreeSitterNode(tsNode: Parser.SyntaxNode, maxDepth = 30, currentDepth = 0): ASTNode {
  const children: ASTNode[] =
    currentDepth < maxDepth
      ? Array.from({ length: tsNode.childCount }, (_, i) => {
          const child = tsNode.child(i);
          // child() puede devolver null según las typings, aunque Tree-sitter garantiza no-null
          // para índices válidos (0..childCount-1).
          return child
            ? convertTreeSitterNode(child, maxDepth, currentDepth + 1)
            : { type: 'null', text: '', startLine: 0, endLine: 0, children: [] };
        })
      : [];

  return {
    type: tsNode.type,
    text: tsNode.text,
    startLine: tsNode.startPosition.row + 1, // Tree-sitter es 0-indexed; el IR usa 1-indexed
    endLine: tsNode.endPosition.row + 1,
    children,
  };
}
