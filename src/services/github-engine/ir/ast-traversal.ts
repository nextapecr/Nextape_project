import type { ASTNode } from '../parsers/language-parser.interface';

/**
 * Recorridos del AST genérico, compartidos por los constructores de IR (`universal-ir-builder.ts` y
 * el legado `typescript-to-ir.ts`), que antes tenían cada uno su copia.
 */

/** Todos los descendientes (incluido el propio nodo) cuyo tipo está en `types`, en orden BFS. */
export function findAll(node: ASTNode, types: Set<string>): ASTNode[] {
  const results: ASTNode[] = [];
  const queue: ASTNode[] = [node];
  while (queue.length) {
    const current = queue.shift()!;
    if (types.has(current.type)) results.push(current);
    for (const child of current.children) queue.push(child);
  }
  return results;
}

/** Primer descendiente (incluido el propio nodo) de un tipo, en orden DFS. `null` si no hay. */
export function findFirst(node: ASTNode, type: string): ASTNode | null {
  if (node.type === type) return node;
  for (const child of node.children) {
    const found = findFirst(child, type);
    if (found) return found;
  }
  return null;
}
