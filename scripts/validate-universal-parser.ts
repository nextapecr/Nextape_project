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

interface LanguageTestCase {
  language: string;
  filename: string;
  snippet: string;
}

const TEST_CASES: LanguageTestCase[] = [
  {
    language: 'TypeScript',
    filename: 'example.ts',
    snippet: `interface User { id: string; name: string; }\nexport function greet(u: User): string { return \`Hello \${u.name}\`; }`,
  },
  {
    language: 'TSX',
    filename: 'Component.tsx',
    snippet: `export function MyButton({ label }: { label: string }) { return <button className="btn">{label}</button>; }`,
  },
  {
    language: 'JavaScript',
    filename: 'app.js',
    snippet: `function calculateTotal(items) { return items.reduce((acc, item) => acc + item.price, 0); }\nmodule.exports = { calculateTotal };`,
  },
  {
    language: 'Python',
    filename: 'service.py',
    snippet: `class DataService:\n    def __init__(self, db_url: str):\n        self.db_url = db_url\n\n    def fetch_records(self, limit: int = 10):\n        return []\n`,
  },
  {
    language: 'Java',
    filename: 'Application.java',
    snippet: `package com.nextape;\npublic class Application {\n    public static void main(String[] args) {\n        System.out.println("Ready");\n    }\n}`,
  },
  {
    language: 'C++',
    filename: 'engine.cpp',
    snippet: `#include <iostream>\n#include <vector>\n\nclass Engine {\npublic:\n    void start() { std::cout << "Engine started\\n"; }\n};`,
  },
  {
    language: 'C',
    filename: 'utils.c',
    snippet: `#include <stdio.h>\n\nint add(int a, int b) {\n    return a + b;\n}`,
  },
  {
    language: 'C#',
    filename: 'Program.cs',
    snippet: `using System;\n\nnamespace Nextape {\n    public class Program {\n        public static void Main(string[] args) {\n            Console.WriteLine("C# Active");\n        }\n    }\n}`,
  },
  {
    language: 'Go',
    filename: 'server.go',
    snippet: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Server running")\n}`,
  },
  {
    language: 'PHP',
    filename: 'index.php',
    snippet: `<?php\nnamespace App;\n\nclass Router {\n    public function dispatch(string $path): void {\n        echo $path;\n    }\n}`,
  },
  {
    language: 'Rust',
    filename: 'lib.rs',
    snippet: `pub struct Config {\n    pub port: u16,\n}\n\npub fn init_server(config: Config) -> bool {\n    config.port > 0\n}`,
  },
  {
    language: 'Ruby',
    filename: 'user.rb',
    snippet: `class User\n  attr_accessor :name, :email\n\n  def initialize(name, email)\n    @name = name\n    @email = email\n  end\nend`,
  },
  {
    language: 'Kotlin',
    filename: 'User.kt',
    snippet: `package com.nextape.model\n\ndata class User(val id: String, val name: String) {\n    fun isValid(): Boolean = id.isNotBlank()\n}`,
  },
  {
    language: 'Scala',
    filename: 'Main.scala',
    snippet: `package com.nextape\n\nobject Main extends App {\n  def greet(name: String): String = s"Hello, $name"\n  println(greet("Scala"))\n}`,
  },
  {
    language: 'Swift',
    filename: 'Network.swift',
    snippet: `import Foundation\n\npublic struct Endpoint {\n    public let url: URL\n    public func request() -> URLRequest { return URLRequest(url: url) }\n}`,
  },
  {
    language: 'Dart',
    filename: 'model.dart',
    snippet: `class Candidate {\n  final String id;\n  final String name;\n\n  Candidate({required this.id, required this.name});\n}`,
  },
  {
    language: 'Bash/Shell',
    filename: 'deploy.sh',
    snippet: `#!/usr/bin/env bash\nset -euo pipefail\n\nfunction deploy() {\n    echo "Deploying application..."\n}\ndeploy`,
  },
  {
    language: 'HCL/Terraform',
    filename: 'main.tf',
    snippet: `resource "aws_s3_bucket" "b" {\n  bucket = "my-tf-test-bucket"\n  tags = {\n    Name        = "My bucket"\n    Environment = "Dev"\n  }\n}`,
  },
  {
    language: 'Elixir',
    filename: 'math.ex',
    snippet: `defmodule Math do\n  def sum(a, b) do\n    a + b\n  end\nend`,
  },
  {
    language: 'Lua',
    filename: 'config.lua',
    snippet: `local M = {}\n\nfunction M.setup(options)\n    local timeout = options.timeout or 5000\n    return timeout\nend\n\nreturn M`,
  },
  {
    language: 'Solidity',
    filename: 'Token.sol',
    snippet: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract SimpleToken {\n    string public name = "SimpleToken";\n    mapping(address => uint256) public balances;\n}`,
  },
];

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
