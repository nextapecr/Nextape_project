/**
 * Catálogo canónico de tecnologías practicables en **The LINE general** (el modo libre, sin vacante).
 *
 * Es la lista maestra que usan tres sitios:
 *  - el selector de la UI (agrupado por categoría),
 *  - el script de precarga `scripts/seed-question-bank.ts`, que genera un repertorio por
 *    (tecnología × nivel),
 *  - `/api/line/start`, para validar que la tecnología pedida existe.
 *
 * Los `id` coinciden con las claves de `TECHNOLOGY_SOURCES` (`src/lib/server/sources.ts`), de modo
 * que cada tecnología resuelve sus fuentes de referencia sin tabla intermedia. Son también la clave
 * bajo la que se guarda el score en el DNA, así que van **en minúsculas** (invariante del match).
 *
 * Este archivo NO es server-only: la UI lo importa. No debe contener nada sensible.
 */

export const TECH_CATEGORIES = [
  "frontend",
  "backend",
  "languages",
  "mobile",
  "databases",
  "cloud",
  "devops",
  "api",
  "testing",
  "architecture",
] as const;

export type TechCategory = (typeof TECH_CATEGORIES)[number];

/** Etiqueta legible de cada categoría, para agrupar el selector. */
export const CATEGORY_LABELS: Record<TechCategory, string> = {
  frontend: "Frontend",
  backend: "Backend y frameworks",
  languages: "Lenguajes",
  mobile: "Móvil",
  databases: "Bases de datos",
  cloud: "Cloud",
  devops: "DevOps e infraestructura",
  api: "APIs",
  testing: "Testing",
  architecture: "Arquitectura y seguridad",
};

export interface Technology {
  /** Clave estable: id del repertorio y clave del score en el DNA. Siempre en minúsculas. */
  id: string;
  /** Nombre mostrado en la UI. */
  label: string;
  category: TechCategory;
}

export const TECHNOLOGIES: Technology[] = [
  // Frontend
  { id: "react", label: "React", category: "frontend" },
  { id: "nextjs", label: "Next.js", category: "frontend" },
  { id: "angular", label: "Angular", category: "frontend" },
  { id: "vue", label: "Vue", category: "frontend" },
  { id: "svelte", label: "Svelte", category: "frontend" },
  { id: "javascript", label: "JavaScript", category: "frontend" },
  { id: "typescript", label: "TypeScript", category: "frontend" },
  { id: "css", label: "CSS", category: "frontend" },
  { id: "tailwind", label: "Tailwind CSS", category: "frontend" },

  // Backend y frameworks
  { id: "node.js", label: "Node.js", category: "backend" },
  { id: "express", label: "Express", category: "backend" },
  { id: "nestjs", label: "NestJS", category: "backend" },
  { id: "django", label: "Django", category: "backend" },
  { id: "fastapi", label: "FastAPI", category: "backend" },
  { id: "laravel", label: "Laravel", category: "backend" },
  { id: "asp.net", label: "ASP.NET Core", category: "backend" },
  { id: "spring", label: "Spring", category: "backend" },

  // Lenguajes
  { id: "python", label: "Python", category: "languages" },
  { id: "java", label: "Java", category: "languages" },
  { id: "dotnet", label: "C# / .NET", category: "languages" },
  { id: "go", label: "Go", category: "languages" },
  { id: "rust", label: "Rust", category: "languages" },
  { id: "php", label: "PHP", category: "languages" },
  { id: "kotlin", label: "Kotlin", category: "languages" },
  { id: "swift", label: "Swift", category: "languages" },
  { id: "c++", label: "C++", category: "languages" },

  // Móvil
  { id: "android", label: "Android", category: "mobile" },
  { id: "ios", label: "iOS", category: "mobile" },
  { id: "flutter", label: "Flutter", category: "mobile" },
  { id: "react native", label: "React Native", category: "mobile" },

  // Bases de datos
  { id: "postgresql", label: "PostgreSQL", category: "databases" },
  { id: "mysql", label: "MySQL", category: "databases" },
  { id: "sqlserver", label: "SQL Server", category: "databases" },
  { id: "mongodb", label: "MongoDB", category: "databases" },
  { id: "redis", label: "Redis", category: "databases" },
  { id: "elasticsearch", label: "Elasticsearch", category: "databases" },

  // Cloud
  { id: "aws", label: "AWS", category: "cloud" },
  { id: "azure", label: "Azure", category: "cloud" },
  { id: "gcp", label: "Google Cloud", category: "cloud" },

  // DevOps
  { id: "docker", label: "Docker", category: "devops" },
  { id: "kubernetes", label: "Kubernetes", category: "devops" },
  { id: "terraform", label: "Terraform", category: "devops" },
  { id: "git", label: "Git", category: "devops" },
  { id: "ci-cd", label: "CI/CD", category: "devops" },

  // APIs
  { id: "rest", label: "REST / OpenAPI", category: "api" },
  { id: "graphql", label: "GraphQL", category: "api" },
  { id: "grpc", label: "gRPC", category: "api" },

  // Testing
  { id: "testing", label: "Testing (general)", category: "testing" },
  { id: "jest", label: "Jest", category: "testing" },
  { id: "vitest", label: "Vitest", category: "testing" },
  { id: "playwright", label: "Playwright", category: "testing" },
  { id: "cypress", label: "Cypress", category: "testing" },

  // Arquitectura y seguridad
  { id: "microservices", label: "Microservicios", category: "architecture" },
  { id: "architecture", label: "Arquitectura de sistemas", category: "architecture" },
  { id: "security", label: "Seguridad (OWASP)", category: "architecture" },
  // Teoría transversal: no es una tecnología que el candidato elija. Va en TODAS las pruebas
  // combinadas de The LINE (30 %), sea cual sea su stack. Ver THEORY_TECHNOLOGY_ID.
  { id: "software-engineering", label: "Ingeniería de software (SOLID, patrones, arquitectura)", category: "architecture" },
];

/**
 * Id del banco de teoría de ingeniería de software: principios SOLID, patrones de diseño, arquitectura
 * (capas, hexagonal, microservicios vs. monolito), clean code, acoplamiento y cohesión, testing.
 * Se siembra como cualquier otra tecnología (`npm run seed:questions -- --only=software-engineering`).
 */
export const THEORY_TECHNOLOGY_ID = "software-engineering";

/** Tecnologías que el candidato puede elegir para que se le evalúen (todas menos la teoría). */
export function selectableTechnologies(): Technology[] {
  return TECHNOLOGIES.filter((t) => t.id !== THEORY_TECHNOLOGY_ID);
}

const BY_ID = new Map(TECHNOLOGIES.map((t) => [t.id, t]));

/** Busca una tecnología por su id. `undefined` si no está en el catálogo. */
export function findTechnology(id: string | undefined | null): Technology | undefined {
  if (!id) return undefined;
  return BY_ID.get(String(id).trim().toLowerCase());
}

/** Tecnologías agrupadas por categoría, en el orden de `TECH_CATEGORIES`. */
export function technologiesByCategory(): { category: TechCategory; items: Technology[] }[] {
  return TECH_CATEGORIES.map((category) => ({
    category,
    items: TECHNOLOGIES.filter((t) => t.category === category),
  })).filter((group) => group.items.length > 0);
}

/**
 * Alias habituales con los que se escribe una tecnología → id canónico del catálogo.
 *
 * El id canónico es la clave bajo la que The LINE acredita el score en el DNA. Si una vacante pide
 * "Next.js" y la práctica guarda "nextjs", el match nunca los casaba: el candidato tenía el score
 * pero la vacante no lo veía. Resolver aquí mantiene una sola clave en el sistema entero.
 */
const TECHNOLOGY_ALIASES: Record<string, string> = {
  "react.js": "react",
  reactjs: "react",
  "next.js": "nextjs",
  next: "nextjs",
  "vue.js": "vue",
  vuejs: "vue",
  js: "javascript",
  ecmascript: "javascript",
  ts: "typescript",
  node: "node.js",
  nodejs: "node.js",
  "express.js": "express",
  expressjs: "express",
  "nest.js": "nestjs",
  "c#": "dotnet",
  csharp: "dotnet",
  ".net": "dotnet",
  "asp.net core": "asp.net",
  golang: "go",
  cpp: "c++",
  postgres: "postgresql",
  mongo: "mongodb",
  k8s: "kubernetes",
  "google cloud": "gcp",
  "amazon web services": "aws",
  cicd: "ci-cd",
  "ci/cd": "ci-cd",
  reactnative: "react native",
  "react-native": "react native",
  "tailwind css": "tailwind",
  tailwindcss: "tailwind",
  openapi: "rest",
  "rest api": "rest",
  "sql server": "sqlserver",
  mssql: "sqlserver",
  owasp: "security",
  seguridad: "security",
  microservicios: "microservices",
  "system design": "architecture",
  arquitectura: "architecture",
};

/** Id canónico de una tecnología escrita libremente, o `null` si no está en el catálogo. */
export function resolveTechnologyId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  if (BY_ID.has(key)) return key;
  const alias = TECHNOLOGY_ALIASES[key];
  return alias && BY_ID.has(alias) ? alias : null;
}

/**
 * Clave con la que se guarda/lee una skill en el DNA: el id canónico si la tecnología está en el
 * catálogo; si no, el texto en minúsculas (invariante del match).
 */
/**
 * Skills máximas por vacante. La comparten el formulario (cliente) y la composición del repertorio
 * (servidor): si divergieran, el reclutador podría elegir skills que la prueba ignora.
 */
export const MAX_SKILLS_PER_JOB = 8;

export function canonicalSkillKey(raw: string): string {
  return resolveTechnologyId(raw) ?? String(raw).trim().toLowerCase();
}
