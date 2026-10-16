import { canonicalSkillKey, findTechnology } from "@/lib/technologies";

/**
 * Puente entre las dos taxonomías de NEXTAPE (H6 de la auditoría, 2026-10).
 *
 * - El **DNA** (`user_skill_scores`) guarda una nota por **tecnología** evaluada en The LINE:
 *   `react`, `node.js`, `postgresql`… (ids de `src/lib/technologies.ts`).
 * - El **roadmap** (`skill_catalog`) trabaja con **habilidades conceptuales**: `react-fundamentals`,
 *   `api-design-rest`, `sql-fundamentals`…
 *
 * Antes no había ninguna capa entre las dos: el motor buscaba `dna["react-fundamentals"]`, que
 * nunca existe. Solo 2 de las 112 skills del catálogo coincidían por casualidad con una tecnología,
 * así que el roadmap casi no usaba los resultados reales de The LINE.
 *
 * Este mapa dice, para cada skill del catálogo, qué tecnologías de The LINE la **evidencian**.
 * Criterio: solo relaciones claras (aprobar el examen de esa tecnología exige dominar esa
 * habilidad). Las skills sin ninguna tecnología que las mida (accesibilidad, observabilidad,
 * networking…) se dejan fuera a propósito: es más honesto "sin datos" que inventar una nota.
 *
 * Cómo se usa la nota: la **mejor** de las tecnologías relacionadas que el usuario haya hecho.
 * Si demostró React o Next.js, demostró los fundamentos de React; no se le exige haber hecho
 * todas. Como el DNA ya está ponderado por nivel (junior ×0.6, mid ×0.8, senior ×1), un examen
 * junior no da por dominada una skill avanzada.
 *
 * Mantenimiento: al añadir una skill al catálogo o una tecnología a The LINE, revisar este mapa.
 * `skill-technology-map.test.ts` comprueba que todas las claves existen en el catálogo y todos
 * los valores son tecnologías reales.
 */
export const SKILL_TECHNOLOGY_MAP: Readonly<Record<string, readonly string[]>> = {
  // ── Lenguajes y fundamentos ──
  "css-fundamentals": ["css", "tailwind"],
  "javascript-es6": ["javascript", "typescript"],
  "typescript-basics": ["typescript"],
  "react-fundamentals": ["react", "nextjs", "react native"],
  "react-advanced": ["react", "nextjs"],
  "node-runtime": ["node.js", "express", "nestjs"],
  "async-patterns": ["node.js", "javascript", "typescript"],
  "responsive-design": ["css", "tailwind"],
  "responsive-mobile-design": ["flutter", "react native"],
  "mobile-language-fundamentals": ["kotlin", "swift"],
  "mobile-ui-basics": ["android", "ios", "flutter", "react native"],
  "mobile-lifecycle": ["android", "ios"],
  "async-programming-mobile": ["kotlin", "swift"],
  "native-features-advanced": ["android", "ios"],

  // ── Arquitectura ──
  "component-architecture": ["react", "angular", "vue", "svelte"],
  "state-management": ["react", "angular", "vue", "svelte"],
  "nextjs-ssr": ["nextjs"],
  "system-design": ["architecture", "microservices"],
  "distributed-systems": ["microservices", "architecture"],
  "event-driven-architecture": ["microservices"],
  "mobile-state-management": ["flutter", "react native"],
  "mobile-architecture-advanced": ["android", "ios"],
  "multi-cloud-architecture": ["aws", "azure", "gcp"],
  "platform-engineering": ["kubernetes", "terraform"],

  // ── Infraestructura ──
  "docker-basics": ["docker"],
  "kubernetes-basics": ["kubernetes"],
  "kubernetes-advanced": ["kubernetes"],
  terraform: ["terraform"],
  "cloud-fundamentals": ["aws", "azure", "gcp"],
  "cloud-storage": ["aws", "azure", "gcp"],
  "caching-strategies": ["redis"],

  // ── Testing ──
  "unit-testing": ["testing", "jest", "vitest"],
  "component-testing": ["testing", "jest", "vitest"],
  "integration-testing": ["testing"],
  "e2e-testing": ["playwright", "cypress"],

  // ── APIs ──
  // Los frameworks de backend cuentan: su examen es, en buena parte, diseñar y servir APIs REST.
  "api-design-rest": ["rest", "express", "nestjs", "fastapi", "django", "laravel", "asp.net", "spring"],
  "api-integration": ["rest", "graphql"],
  "api-validation": ["rest", "fastapi", "nestjs"],
  "api-versioning": ["rest"],
  "graphql-client": ["graphql"],
  "http-protocol": ["rest", "node.js", "express"],

  // ── Herramientas y prácticas ──
  "git-fundamentals": ["git"],
  "ci-cd-pipelines": ["ci-cd"],
  "ci-cd-advanced": ["ci-cd"],
  gitops: ["ci-cd"],
  "react-routing": ["react", "nextjs"],
  "frontend-performance": ["react", "nextjs", "angular", "vue"],
  "css-modules": ["css"],
  "error-boundaries": ["react", "nextjs"],
  "form-validation": ["react", "angular", "vue"],
  "seo-optimization": ["nextjs"],
  "error-handling": ["node.js", "express", "nestjs", "fastapi"],

  // ── Bases de datos ──
  postgresql: ["postgresql"],
  "sql-fundamentals": ["postgresql", "mysql", "sqlserver"],
  "database-performance": ["postgresql", "mysql", "sqlserver", "mongodb", "elasticsearch"],
  "orm-basics": ["django", "laravel", "spring", "asp.net", "nestjs"],

  // ── Seguridad ──
  "auth-jwt": ["security", "express", "nestjs"],
  "basic-security": ["security"],
  "basic-security-infra": ["security"],
  "web-security-frontend": ["security"],
  "secrets-management": ["security"],
  "zero-trust-security": ["security"],
};

/** Tecnologías de The LINE que evidencian una skill del catálogo (vacío si ninguna). */
export function technologiesForSkill(skillId: string): readonly string[] {
  return SKILL_TECHNOLOGY_MAP[skillId] ?? [];
}

export interface LineEvidence {
  score: number;
  /** Tecnologías del DNA de las que sale la nota (la de mejor nota primero). */
  technologies: string[];
}

/**
 * Nota de The LINE para una skill del catálogo, o `null` si no hay ninguna evidencia.
 *
 * 1. Coincidencia directa: el DNA tiene una entrada con el id de la skill (p. ej. `postgresql`,
 *    `terraform`), también por alias (`"Next.js"` → `nextjs`, TECH_DEBT A10).
 * 2. Tecnologías relacionadas según `SKILL_TECHNOLOGY_MAP`: la mejor nota de las que el usuario
 *    haya hecho.
 */
export function lineEvidenceForSkill(
  skillId: string,
  dna: Record<string, number>,
): LineEvidence | null {
  // Índice del DNA por clave canónica: el DNA antiguo puede tener "react.js" o "Next.js".
  const byKey = new Map<string, number>();
  for (const [raw, value] of Object.entries(dna)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const key = canonicalSkillKey(raw);
    byKey.set(key, Math.max(byKey.get(key) ?? 0, value));
  }

  const direct = byKey.get(canonicalSkillKey(skillId));
  if (direct !== undefined) return { score: direct, technologies: [canonicalSkillKey(skillId)] };

  const hits = technologiesForSkill(skillId)
    .filter((tech) => byKey.has(tech))
    .map((tech) => ({ tech, score: byKey.get(tech)! }))
    .sort((a, b) => b.score - a.score);

  if (hits.length === 0) return null;
  return { score: hits[0].score, technologies: hits.map((h) => h.tech) };
}

/**
 * Tecnología que conviene practicar en The LINE para mejorar una skill: la primera relacionada
 * que tenga banco de preguntas (`available`, de `/api/line/catalog`). `null` si ninguna lo tiene.
 */
export function practiceTechnologyForSkill(
  skillId: string,
  available: Record<string, string[]>,
): string | null {
  if (available[skillId]?.length) return skillId;
  return technologiesForSkill(skillId).find((tech) => available[tech]?.length) ?? null;
}

/** Nombre legible de una tecnología para la UI ("node.js" → "Node.js"). */
export function technologyLabel(id: string): string {
  return findTechnology(id)?.label ?? id;
}
