/**
 * @fileOverview Interfaz universal LanguageParser.
 * Cada parser de lenguaje implementa esta interfaz. Agregar soporte para
 * un nuevo lenguaje = un archivo nuevo que implementa LanguageParser, sin
 * tocar el resto del motor.
 *
 * IMPORTANTE — runtime: todos los parsers usan bindings nativos (Tree-sitter).
 * NUNCA importar desde archivos que se ejecuten en el edge (Cloudflare Workers).
 * Solo usar en route handlers con `export const runtime = "nodejs"`.
 */

/** Nodo genérico del AST en el formato intermedio que el motor consume */
export interface ASTNode {
  type: string;
  text: string;
  startLine: number;
  endLine: number;
  children: ASTNode[];
}

/** Resultado del parsing de un archivo fuente */
export interface ParsedAST {
  language: string;
  filename: string;
  /** Nodo raíz del AST */
  root: ASTNode;
  /** Si el parser detectó errores de sintaxis */
  hasParseErrors: boolean;
}

/**
 * Interfaz que cada parser de lenguaje debe implementar.
 * La modularidad del motor depende de esta abstracción: el orquestador
 * llama a `canParse()` para seleccionar el parser correcto, luego a `parse()`.
 */
export interface LanguageParser {
  /** Identificador canónico del lenguaje (ej: "typescript", "python") */
  readonly language: string;

  /**
   * Indica si este parser puede manejar el archivo dado.
   * @param filename - Nombre del archivo (con extensión), ej: "index.ts", "main.py"
   */
  canParse(filename: string): boolean;

  /**
   * Parsea el código fuente y devuelve el AST en formato intermedio.
   * @param source   - Código fuente completo como string
   * @param filename - Nombre del archivo (para metadata y mensajes de error)
   * @throws Error si el código no puede ser parseado en absoluto
   */
  parse(source: string, filename: string): ParsedAST;
}
