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
  /**
   * Subgrupo dentro de la categoría (p. ej. Backend → "Python", Cloud → "AWS", Bases de datos →
   * "NoSQL"). Solo organiza el selector; no cambia la clave del DNA.
   */
  group: string;
}

export const TECHNOLOGIES: Technology[] = [
  // ── Frontend ──
  { id: "react", label: "React", category: "frontend", group: "Frameworks y librerías" },
  { id: "nextjs", label: "Next.js", category: "frontend", group: "Frameworks y librerías" },
  { id: "angular", label: "Angular", category: "frontend", group: "Frameworks y librerías" },
  { id: "vue", label: "Vue", category: "frontend", group: "Frameworks y librerías" },
  { id: "nuxt", label: "Nuxt", category: "frontend", group: "Frameworks y librerías" },
  { id: "svelte", label: "Svelte", category: "frontend", group: "Frameworks y librerías" },
  { id: "javascript", label: "JavaScript", category: "frontend", group: "Lenguajes y estándares web" },
  { id: "typescript", label: "TypeScript", category: "frontend", group: "Lenguajes y estándares web" },
  { id: "html", label: "HTML y accesibilidad", category: "frontend", group: "Lenguajes y estándares web" },
  { id: "css", label: "CSS", category: "frontend", group: "Estilos" },
  { id: "tailwind", label: "Tailwind CSS", category: "frontend", group: "Estilos" },
  { id: "redux", label: "Redux / Redux Toolkit", category: "frontend", group: "Estado y datos" },
  { id: "tanstack-query", label: "TanStack Query", category: "frontend", group: "Estado y datos" },
  { id: "web-performance", label: "Rendimiento web (Core Web Vitals)", category: "frontend", group: "Calidad" },

  // ── Backend y frameworks (por lenguaje) ──
  { id: "node.js", label: "Node.js", category: "backend", group: "JavaScript / TypeScript" },
  { id: "express", label: "Express", category: "backend", group: "JavaScript / TypeScript" },
  { id: "nestjs", label: "NestJS", category: "backend", group: "JavaScript / TypeScript" },
  { id: "django", label: "Django", category: "backend", group: "Python" },
  { id: "fastapi", label: "FastAPI", category: "backend", group: "Python" },
  { id: "flask", label: "Flask", category: "backend", group: "Python" },
  { id: "spring", label: "Spring", category: "backend", group: "Java / Kotlin" },
  { id: "asp.net", label: "ASP.NET Core", category: "backend", group: "C# / .NET" },
  { id: "laravel", label: "Laravel", category: "backend", group: "PHP" },
  { id: "rails", label: "Ruby on Rails", category: "backend", group: "Ruby" },
  { id: "gin", label: "Gin", category: "backend", group: "Go" },

  // ── Lenguajes ──
  { id: "python", label: "Python", category: "languages", group: "Propósito general y scripting" },
  { id: "php", label: "PHP", category: "languages", group: "Propósito general y scripting" },
  { id: "ruby", label: "Ruby", category: "languages", group: "Propósito general y scripting" },
  { id: "java", label: "Java", category: "languages", group: "JVM y .NET" },
  { id: "kotlin", label: "Kotlin", category: "languages", group: "JVM y .NET" },
  { id: "scala", label: "Scala", category: "languages", group: "JVM y .NET" },
  { id: "dotnet", label: "C# / .NET", category: "languages", group: "JVM y .NET" },
  { id: "go", label: "Go", category: "languages", group: "Sistemas" },
  { id: "rust", label: "Rust", category: "languages", group: "Sistemas" },
  { id: "c", label: "C", category: "languages", group: "Sistemas" },
  { id: "c++", label: "C++", category: "languages", group: "Sistemas" },
  { id: "swift", label: "Swift", category: "languages", group: "Móvil" },
  { id: "dart", label: "Dart", category: "languages", group: "Móvil" },

  // ── Móvil ──
  { id: "android", label: "Android (SDK, ciclo de vida)", category: "mobile", group: "Nativo Android" },
  { id: "jetpack-compose", label: "Jetpack Compose", category: "mobile", group: "Nativo Android" },
  { id: "ios", label: "iOS (UIKit, ciclo de vida)", category: "mobile", group: "Nativo iOS" },
  { id: "swiftui", label: "SwiftUI", category: "mobile", group: "Nativo iOS" },
  { id: "flutter", label: "Flutter", category: "mobile", group: "Multiplataforma" },
  { id: "react native", label: "React Native", category: "mobile", group: "Multiplataforma" },
  { id: "kotlin-multiplatform", label: "Kotlin Multiplatform", category: "mobile", group: "Multiplataforma" },

  // ── Bases de datos ──
  { id: "sql", label: "SQL (consultas y modelado)", category: "databases", group: "Relacionales (SQL)" },
  { id: "postgresql", label: "PostgreSQL", category: "databases", group: "Relacionales (SQL)" },
  { id: "mysql", label: "MySQL", category: "databases", group: "Relacionales (SQL)" },
  { id: "sqlserver", label: "SQL Server", category: "databases", group: "Relacionales (SQL)" },
  { id: "oracle", label: "Oracle Database", category: "databases", group: "Relacionales (SQL)" },
  { id: "sqlite", label: "SQLite", category: "databases", group: "Relacionales (SQL)" },
  { id: "mongodb", label: "MongoDB", category: "databases", group: "NoSQL" },
  { id: "dynamodb", label: "DynamoDB", category: "databases", group: "NoSQL" },
  { id: "firestore", label: "Firestore", category: "databases", group: "NoSQL" },
  { id: "cassandra", label: "Cassandra", category: "databases", group: "NoSQL" },
  { id: "redis", label: "Redis", category: "databases", group: "Caché y búsqueda" },
  { id: "elasticsearch", label: "Elasticsearch", category: "databases", group: "Caché y búsqueda" },

  // ── Cloud (por proveedor y servicio) ──
  { id: "aws", label: "AWS (fundamentos: IAM, VPC, EC2, S3)", category: "cloud", group: "AWS" },
  { id: "aws-serverless", label: "AWS Serverless (Lambda, API Gateway, SQS)", category: "cloud", group: "AWS" },
  { id: "aws-containers", label: "AWS Contenedores (ECS, EKS, Fargate)", category: "cloud", group: "AWS" },
  { id: "azure", label: "Azure (fundamentos: Entra ID, VNet, VMs, Storage)", category: "cloud", group: "Azure" },
  { id: "azure-functions", label: "Azure Functions y App Service", category: "cloud", group: "Azure" },
  { id: "gcp", label: "Google Cloud (fundamentos: IAM, VPC, GCE, GCS)", category: "cloud", group: "Google Cloud" },
  { id: "gcp-cloud-run", label: "Cloud Run y Cloud Functions", category: "cloud", group: "Google Cloud" },
  { id: "firebase", label: "Firebase (Auth, reglas, Functions)", category: "cloud", group: "Firebase" },

  // ── DevOps e infraestructura ──
  { id: "docker", label: "Docker", category: "devops", group: "Contenedores y orquestación" },
  { id: "kubernetes", label: "Kubernetes", category: "devops", group: "Contenedores y orquestación" },
  { id: "terraform", label: "Terraform", category: "devops", group: "Infraestructura como código" },
  { id: "ansible", label: "Ansible", category: "devops", group: "Infraestructura como código" },
  { id: "git", label: "Git", category: "devops", group: "Versionado y CI/CD" },
  { id: "ci-cd", label: "CI/CD", category: "devops", group: "Versionado y CI/CD" },
  { id: "github-actions", label: "GitHub Actions", category: "devops", group: "Versionado y CI/CD" },
  { id: "linux", label: "Linux y shell", category: "devops", group: "Sistemas y operación" },
  { id: "observability", label: "Observabilidad (logs, métricas, trazas)", category: "devops", group: "Sistemas y operación" },

  // ── APIs e integración ──
  { id: "rest", label: "REST / OpenAPI", category: "api", group: "Estilos de API" },
  { id: "graphql", label: "GraphQL", category: "api", group: "Estilos de API" },
  { id: "grpc", label: "gRPC", category: "api", group: "Estilos de API" },
  { id: "websockets", label: "WebSockets y tiempo real", category: "api", group: "Estilos de API" },
  { id: "kafka", label: "Apache Kafka", category: "api", group: "Mensajería y eventos" },
  { id: "rabbitmq", label: "RabbitMQ", category: "api", group: "Mensajería y eventos" },

  // ── Testing ──
  { id: "testing", label: "Testing (general)", category: "testing", group: "Fundamentos" },
  { id: "jest", label: "Jest", category: "testing", group: "Unitarias e integración" },
  { id: "vitest", label: "Vitest", category: "testing", group: "Unitarias e integración" },
  { id: "pytest", label: "pytest", category: "testing", group: "Unitarias e integración" },
  { id: "junit", label: "JUnit", category: "testing", group: "Unitarias e integración" },
  { id: "playwright", label: "Playwright", category: "testing", group: "End-to-end" },
  { id: "cypress", label: "Cypress", category: "testing", group: "End-to-end" },

  // ── Arquitectura y seguridad ──
  { id: "architecture", label: "Arquitectura de sistemas", category: "architecture", group: "Arquitectura" },
  { id: "microservices", label: "Microservicios", category: "architecture", group: "Arquitectura" },
  { id: "security", label: "Seguridad (OWASP)", category: "architecture", group: "Seguridad" },
  { id: "auth", label: "Autenticación y autorización (OAuth, JWT)", category: "architecture", group: "Seguridad" },
  // Teoría transversal: no es una tecnología que el candidato elija. Va en TODAS las pruebas
  // combinadas de The LINE (30 %), sea cual sea su stack. Ver THEORY_TECHNOLOGY_ID.
  {
    id: "software-engineering",
    label: "Ingeniería de software (SOLID, patrones, arquitectura)",
    category: "architecture",
    group: "Teoría",
  },
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

/** Subgrupos de una lista de tecnologías, en el orden en que aparecen en el catálogo. */
export function groupTechnologies(items: Technology[]): { group: string; items: Technology[] }[] {
  const groups = new Map<string, Technology[]>();
  for (const t of items) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return [...groups].map(([group, list]) => ({ group, items: list }));
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
  "ruby on rails": "rails",
  ror: "rails",
  "jetpack compose": "jetpack-compose",
  compose: "jetpack-compose",
  "kotlin multiplatform": "kotlin-multiplatform",
  kmp: "kotlin-multiplatform",
  "react query": "tanstack-query",
  "redux toolkit": "redux",
  html5: "html",
  accesibilidad: "html",
  a11y: "html",
  "aws lambda": "aws-serverless",
  lambda: "aws-serverless",
  serverless: "aws-serverless",
  ecs: "aws-containers",
  eks: "aws-containers",
  "azure functions": "azure-functions",
  "cloud run": "gcp-cloud-run",
  "cloud functions": "gcp-cloud-run",
  "github actions": "github-actions",
  bash: "linux",
  shell: "linux",
  opentelemetry: "observability",
  prometheus: "observability",
  oauth: "auth",
  jwt: "auth",
  websocket: "websockets",
  "apache kafka": "kafka",
  "oracle database": "oracle",
  "amazon dynamodb": "dynamodb",
  "core web vitals": "web-performance",
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
