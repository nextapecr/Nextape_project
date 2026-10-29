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

/**
 * Catálogo por categoría → subgrupo → `{ id: etiqueta }`, en el orden en que se muestra.
 * `software-engineering` (Arquitectura → Teoría) no es elegible: va en TODAS las pruebas combinadas
 * de The LINE (30 %), sea cual sea el stack. Ver THEORY_TECHNOLOGY_ID.
 */
const CATALOG: Record<TechCategory, Record<string, Record<string, string>>> = {
  frontend: {
    "Frameworks y librerías": {
      react: "React",
      nextjs: "Next.js",
      angular: "Angular",
      vue: "Vue",
      nuxt: "Nuxt",
      svelte: "Svelte",
    },
    "Lenguajes y estándares web": {
      javascript: "JavaScript",
      typescript: "TypeScript",
      html: "HTML y accesibilidad",
    },
    "Estilos": {
      css: "CSS",
      tailwind: "Tailwind CSS",
    },
    "Estado y datos": {
      redux: "Redux / Redux Toolkit",
      "tanstack-query": "TanStack Query",
    },
    "Calidad": {
      "web-performance": "Rendimiento web (Core Web Vitals)",
    },
  },
  backend: {
    "JavaScript / TypeScript": {
      "node.js": "Node.js",
      express: "Express",
      nestjs: "NestJS",
    },
    "Python": {
      django: "Django",
      fastapi: "FastAPI",
      flask: "Flask",
    },
    "Java / Kotlin": {
      spring: "Spring",
    },
    "C# / .NET": {
      "asp.net": "ASP.NET Core",
    },
    "PHP": {
      laravel: "Laravel",
    },
    "Ruby": {
      rails: "Ruby on Rails",
    },
    "Go": {
      gin: "Gin",
    },
  },
  languages: {
    "Propósito general y scripting": {
      python: "Python",
      php: "PHP",
      ruby: "Ruby",
    },
    "JVM y .NET": {
      java: "Java",
      kotlin: "Kotlin",
      scala: "Scala",
      dotnet: "C# / .NET",
    },
    "Sistemas": {
      go: "Go",
      rust: "Rust",
      c: "C",
      "c++": "C++",
    },
    "Móvil": {
      swift: "Swift",
      dart: "Dart",
    },
  },
  mobile: {
    "Nativo Android": {
      android: "Android (SDK, ciclo de vida)",
      "jetpack-compose": "Jetpack Compose",
    },
    "Nativo iOS": {
      ios: "iOS (UIKit, ciclo de vida)",
      swiftui: "SwiftUI",
    },
    "Multiplataforma": {
      flutter: "Flutter",
      "react native": "React Native",
      "kotlin-multiplatform": "Kotlin Multiplatform",
    },
  },
  databases: {
    "Relacionales (SQL)": {
      sql: "SQL (consultas y modelado)",
      postgresql: "PostgreSQL",
      mysql: "MySQL",
      sqlserver: "SQL Server",
      oracle: "Oracle Database",
      sqlite: "SQLite",
    },
    "NoSQL": {
      mongodb: "MongoDB",
      dynamodb: "DynamoDB",
      firestore: "Firestore",
      cassandra: "Cassandra",
    },
    "Caché y búsqueda": {
      redis: "Redis",
      elasticsearch: "Elasticsearch",
    },
  },
  cloud: {
    "AWS": {
      aws: "AWS (fundamentos: IAM, VPC, EC2, S3)",
      "aws-serverless": "AWS Serverless (Lambda, API Gateway, SQS)",
      "aws-containers": "AWS Contenedores (ECS, EKS, Fargate)",
    },
    "Azure": {
      azure: "Azure (fundamentos: Entra ID, VNet, VMs, Storage)",
      "azure-functions": "Azure Functions y App Service",
    },
    "Google Cloud": {
      gcp: "Google Cloud (fundamentos: IAM, VPC, GCE, GCS)",
      "gcp-cloud-run": "Cloud Run y Cloud Functions",
    },
    "Firebase": {
      firebase: "Firebase (Auth, reglas, Functions)",
    },
  },
  devops: {
    "Contenedores y orquestación": {
      docker: "Docker",
      kubernetes: "Kubernetes",
    },
    "Infraestructura como código": {
      terraform: "Terraform",
      ansible: "Ansible",
    },
    "Versionado y CI/CD": {
      git: "Git",
      "ci-cd": "CI/CD",
      "github-actions": "GitHub Actions",
    },
    "Sistemas y operación": {
      linux: "Linux y shell",
      observability: "Observabilidad (logs, métricas, trazas)",
    },
  },
  api: {
    "Estilos de API": {
      rest: "REST / OpenAPI",
      graphql: "GraphQL",
      grpc: "gRPC",
      websockets: "WebSockets y tiempo real",
    },
    "Mensajería y eventos": {
      kafka: "Apache Kafka",
      rabbitmq: "RabbitMQ",
    },
  },
  testing: {
    "Fundamentos": {
      testing: "Testing (general)",
    },
    "Unitarias e integración": {
      jest: "Jest",
      vitest: "Vitest",
      pytest: "pytest",
      junit: "JUnit",
    },
    "End-to-end": {
      playwright: "Playwright",
      cypress: "Cypress",
    },
  },
  architecture: {
    "Arquitectura": {
      architecture: "Arquitectura de sistemas",
      microservices: "Microservicios",
    },
    "Seguridad": {
      security: "Seguridad (OWASP)",
      auth: "Autenticación y autorización (OAuth, JWT)",
    },
    "Teoría": {
      "software-engineering": "Ingeniería de software (SOLID, patrones, arquitectura)",
    },
  },
};

export const TECHNOLOGIES: Technology[] = TECH_CATEGORIES.flatMap((category) =>
  Object.entries(CATALOG[category]).flatMap(([group, items]) =>
    Object.entries(items).map(([id, label]) => ({ id, label, category, group })),
  ),
);

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
