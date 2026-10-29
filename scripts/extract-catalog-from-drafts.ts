/**
 * Script auxiliar que extrae todas las skills y rutas desde docs/roadmap-drafts/*.md
 * y genera el código TypeScript para scripts/seed-skill-catalog.ts
 *
 * Ejecutar: npx tsx scripts/extract-catalog-from-drafts.ts
 */

import { SKILL_CATALOG } from "./lib/skill-catalog-seed";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface SkillDef {
  id: string;
  name: string;
  category: string;
  githubDimension: string | null;
  prerequisites: string[];
}

interface RouteDef {
  id: string;
  targetRole: string;
  fromLevel: string;
  toLevel: string;
  displayName: string;
  skillWeights: Record<string, number>;
}

const DRAFT_FILES = [
  "01-backend_mid_to_senior.md",
  "02-frontend_junior_to_mid.md",
  "03-frontend_mid_to_senior.md",
  "04-fullstack_junior_to_mid.md",
  "05-fullstack_mid_to_senior.md",
  "06-devops_junior_to_mid.md",
  "07-devops_mid_to_senior.md",
  "08-mobile_junior_to_mid.md",
  "09-mobile_mid_to_senior.md",
];

/** Una fila `| \`id\` | nombre | categoría | dimensión | prerequisitos |` → skill, o `null`. */
function parseSkillRow(line: string): SkillDef | null {
  if (!line.startsWith("|") || line.includes("----")) return null;
  const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
  if (cols.length < 5 || !cols[0].startsWith("`")) return null;
  const prerequisites = cols[4]
    .split(",")
    .map((p) => p.trim().replace(/[[\]`]/g, ""))
    .filter((p) => p && p !== "(raíz)" && p !== "[]");
  return {
    id: cols[0].replace(/`/g, ""),
    name: cols[1],
    category: cols[2],
    githubDimension: cols[3] === "null" ? null : cols[3],
    prerequisites,
  };
}

function parseMarkdownTable(content: string, startMarker: string): SkillDef[] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.includes(startMarker));
  if (start === -1) return [];

  const skills: SkillDef[] = [];
  for (const line of lines.slice(start + 1)) {
    const skill = parseSkillRow(line);
    if (skill) skills.push(skill);
    if (line.trim() === "") break;
  }
  return skills;
}

function parseSkillWeights(content: string): Record<string, number> {
  const weights: Record<string, number> = {};
  const lines = content.split("\n");
  
  let inBlock = false;
  for (const line of lines) {
    if (line.includes("skillWeights:") || line.includes("```typescript")) {
      inBlock = true;
      continue;
    }
    if (inBlock && line.includes("```")) break;
    if (inBlock && line.includes(":") && line.includes("0.")) {
      const match = /["']([a-z-]+)["']:\s*(0\.\d+)/.exec(line);
      if (match) {
        weights[match[1]] = Number.parseFloat(match[2]);
      }
    }
  }
  
  return weights;
}

function parseRouteMetadata(content: string): Partial<RouteDef> {
  // Primer bloque ```typescript { … } del borrador; cada campo se lee por separado (una sola regex
  // con los 5 campos era demasiado compleja de mantener).
  const block = /```typescript\s*\{([^`]*)/.exec(content)?.[1];
  if (!block) return {};
  const field = (name: string) => new RegExp(String.raw`${name}:\s*"([^"]+)"`).exec(block)?.[1];
  const meta = {
    id: field("id"),
    targetRole: field("targetRole"),
    fromLevel: field("fromLevel"),
    toLevel: field("toLevel"),
    displayName: field("displayName"),
  };
  if (Object.values(meta).some((v) => v === undefined)) return {};
  return meta as Partial<RouteDef>;
}

// Skills ya existentes en backend_junior_to_mid (NO duplicar)
const EXISTING_SKILLS = new Set([
  "git-fundamentals",
  "node-runtime",
  "typescript-basics",
  "sql-fundamentals",
  "http-protocol",
  "unit-testing",
  "api-design-rest",
  "postgresql",
  "orm-basics",
  "auth-jwt",
  "error-handling",
  "integration-testing",
  "environment-config",
  "docker-basics",
  "async-patterns",
  "api-validation",
  "code-documentation",
  "basic-security",
]);

async function main() {
  const allSkills = new Map<string, SkillDef>();
  const allRoutes: RouteDef[] = [];
  
  // Agregar skills existentes (de backend_junior_to_mid, ya en Firestore)
  // Las 18 ya existentes salen del catálogo compartido (antes estaban copiadas aquí a mano).
  const existingSkillDefs: SkillDef[] = SKILL_CATALOG.filter((skill) => EXISTING_SKILLS.has(skill.id));
  
  existingSkillDefs.forEach((s) => allSkills.set(s.id, s));
  
  // Parsear cada draft
  for (const filename of DRAFT_FILES) {
    const path = join(process.cwd(), "docs", "roadmap-drafts", filename);
    const content = readFileSync(path, "utf-8");
    
    // Extraer ruta
    const routeMeta = parseRouteMetadata(content);
    const skillWeights = parseSkillWeights(content);
    
    if (routeMeta.id && Object.keys(skillWeights).length > 0) {
      allRoutes.push({
        id: routeMeta.id!,
        targetRole: routeMeta.targetRole!,
        fromLevel: routeMeta.fromLevel!,
        toLevel: routeMeta.toLevel!,
        displayName: routeMeta.displayName!,
        skillWeights,
      });
    }
    
    // Extraer skills NUEVAS (no existentes)
    const newSkills = parseMarkdownTable(content, "| Skill ID");
    for (const skill of newSkills) {
      if (!EXISTING_SKILLS.has(skill.id) && !allSkills.has(skill.id)) {
        allSkills.set(skill.id, skill);
      }
    }
  }
  
  console.log(`\n📊 CATÁLOGO EXTRAÍDO:`);
  console.log(`   Skills totales: ${allSkills.size}`);
  console.log(`   Skills existentes (ya en Firestore): ${EXISTING_SKILLS.size}`);
  console.log(`   Skills NUEVAS a crear: ${allSkills.size - EXISTING_SKILLS.size}`);
  console.log(`   Rutas totales: ${allRoutes.length + 1} (9 nuevas + 1 existente)`);
  console.log(`\n✅ Extracción completada. Ahora actualizar seed-skill-catalog.ts manualmente.\n`);
  
  // Generar código TypeScript
  const skillsCode = Array.from(allSkills.values())
    .map((s) => {
      const prereqStr = s.prerequisites.length > 0 ? `["${s.prerequisites.join('", "')}"]` : "[]";
      const dimStr = s.githubDimension ? `"${s.githubDimension}"` : "null";
      return `  {\n    id: "${s.id}",\n    name: "${s.name}",\n    category: "${s.category}",\n    githubDimension: ${dimStr},\n    prerequisites: ${prereqStr},\n  }`;
    })
    .join(",\n");
  
  const routesCode = allRoutes
    .map((r) => {
      const weightsStr = Object.entries(r.skillWeights)
        .map(([k, v]) => `    "${k}": ${v}`)
        .join(",\n");
      return `  {\n    id: "${r.id}",\n    targetRole: "${r.targetRole}",\n    fromLevel: "${r.fromLevel}",\n    toLevel: "${r.toLevel}",\n    displayName: "${r.displayName}",\n    skillWeights: {\n${weightsStr}\n    },\n  }`;
    })
    .join(",\n");
  
  console.log("=".repeat(80));
  console.log("SKILLS CODE (copiar a SKILL_CATALOG):");
  console.log("=".repeat(80));
  console.log(skillsCode);
  console.log("\n" + "=".repeat(80));
  console.log("ROUTES CODE (copiar a ALL_ROUTES):");
  console.log("=".repeat(80));
  console.log(routesCode);
  console.log("\n");
  
  // Guardar en archivo temporal
  writeFileSync(
    "scripts/catalog-generated.ts",
    `// Auto-generado por extract-catalog-from-drafts.ts\n// Copiar manualmente a seed-skill-catalog.ts\n\nexport const SKILL_CATALOG = [\n${skillsCode}\n];\n\nexport const ALL_ROUTES = [\n${routesCode}\n];\n`
  );
  
  console.log("✅ Código guardado en scripts/catalog-generated.ts\n");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
