/**
 * Catálogo de **fuentes técnicas de referencia** de NEXTAPE.
 *
 * Es el corpus sobre el que se apoyan las preguntas de The LINE: documentación oficial,
 * estándares de seguridad, material de arquitectura y blogs de ingeniería de empresas que operan
 * a escala real.
 *
 * ⚠️ **Estado actual — leer antes de usarlo.** Hoy estas URLs se le pasan al modelo como *anclaje*
 * del prompt: se le pide que sitúe el escenario en las prácticas documentadas por estas fuentes y
 * que declare cuál corresponde. Eso **no es RAG y no es verificación**: el modelo no lee las
 * páginas, así que el campo `source` de una pregunta es una *atribución del modelo*, no una cita
 * comprobada. Sirve para (a) dirigir la generación hacia tecnología real y no genérica, y (b)
 * dejar el pipeline listo para la recuperación de verdad.
 *
 * Cuando exista retrieval (BGE-M3 → índice → `retrieve()`), este catálogo pasa a ser la lista de
 * ingesta y `source` se convierte en una cita verificable. Ver `docs/HARNESS.md §6`.
 */

export type SourceCategory =
  | "frontend"
  | "backend"
  | "mobile"
  | "languages"
  | "databases"
  | "cloud"
  | "devops"
  | "security"
  | "architecture"
  | "roadmap"
  | "api"
  | "testing"
  | "engineering";

/** Catálogo por categoría (definido por el equipo). */
export const SOURCE_CATALOG: Record<SourceCategory, string[]> = {
  frontend: [
    "https://react.dev",
    "https://nextjs.org/docs",
    "https://angular.dev",
    "https://vuejs.org/guide",
    "https://svelte.dev/docs",
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    "https://developer.mozilla.org/en-US/docs/Web/CSS",
    "https://www.typescriptlang.org/docs",
  ],
  backend: [
    "https://nodejs.org/docs/latest/api",
    "https://expressjs.com",
    "https://docs.nestjs.com",
    "https://docs.djangoproject.com",
    "https://fastapi.tiangolo.com",
    "https://laravel.com/docs",
    "https://learn.microsoft.com/aspnet/core",
    "https://docs.spring.io",
    "https://go.dev/doc",
  ],
  mobile: [
    "https://developer.android.com/docs",
    "https://kotlinlang.org/docs",
    "https://developer.apple.com/documentation",
    "https://docs.flutter.dev",
    "https://reactnative.dev/docs/getting-started",
  ],
  languages: [
    "https://docs.python.org/3",
    "https://docs.oracle.com/en/java",
    "https://learn.microsoft.com/dotnet",
    "https://go.dev/doc",
    "https://doc.rust-lang.org/book",
    "https://www.php.net/docs.php",
    "https://kotlinlang.org/docs",
    "https://developer.apple.com/documentation/swift",
    "https://en.cppreference.com",
  ],
  databases: [
    "https://www.postgresql.org/docs",
    "https://dev.mysql.com/doc",
    "https://learn.microsoft.com/sql",
    "https://www.mongodb.com/docs",
    "https://redis.io/docs",
    "https://www.elastic.co/guide",
  ],
  cloud: [
    "https://docs.aws.amazon.com",
    "https://learn.microsoft.com/azure",
    "https://cloud.google.com/docs",
  ],
  devops: [
    "https://docs.docker.com",
    "https://kubernetes.io/docs",
    "https://developer.hashicorp.com/terraform/docs",
    "https://git-scm.com/doc",
    "https://docs.github.com",
  ],
  security: [
    "https://owasp.org/www-project-top-ten",
    "https://attack.mitre.org",
    "https://cve.mitre.org",
    "https://cwe.mitre.org",
    "https://csrc.nist.gov/publications",
  ],
  architecture: [
    "https://github.com/donnemartin/system-design-primer",
    "https://microservices.io",
    "https://martinfowler.com",
    "https://refactoring.guru",
    "https://12factor.net",
  ],
  roadmap: ["https://roadmap.sh"],
  api: [
    "https://spec.openapis.org/oas/latest.html",
    "https://graphql.org/learn",
    "https://grpc.io/docs",
  ],
  testing: [
    "https://jestjs.io/docs",
    "https://vitest.dev/guide",
    "https://playwright.dev/docs",
    "https://docs.cypress.io",
    "https://junit.org/junit5/docs/current/user-guide",
  ],
  engineering: [
    "https://netflixtechblog.com",
    "https://github.blog/engineering",
    "https://blog.cloudflare.com",
    "https://stripe.com/blog/engineering",
    "https://engineering.fb.com",
    "https://opensource.googleblog.com",
    "https://www.uber.com/blog/engineering",
  ],
};

/**
 * Fuentes específicas por tecnología. La clave es el término tal y como lo escribe un reclutador
 * en `requiredSkills` (siempre en minúsculas); se aceptan alias comunes.
 *
 * Existe además del catálogo por categoría porque la precisión importa: para una vacante de
 * `postgresql` conviene apuntar a la documentación de Postgres, no a las seis de `databases`.
 */
const TECHNOLOGY_SOURCES: Record<string, string[]> = {
  // Frontend
  react: ["https://react.dev", "https://developer.mozilla.org/en-US/docs/Web/JavaScript"],
  "react.js": ["https://react.dev"],
  nextjs: ["https://nextjs.org/docs", "https://react.dev"],
  "next.js": ["https://nextjs.org/docs", "https://react.dev"],
  angular: ["https://angular.dev"],
  vue: ["https://vuejs.org/guide"],
  "vue.js": ["https://vuejs.org/guide"],
  svelte: ["https://svelte.dev/docs"],
  javascript: ["https://developer.mozilla.org/en-US/docs/Web/JavaScript"],
  js: ["https://developer.mozilla.org/en-US/docs/Web/JavaScript"],
  css: ["https://developer.mozilla.org/en-US/docs/Web/CSS"],
  tailwind: ["https://developer.mozilla.org/en-US/docs/Web/CSS"],
  typescript: ["https://www.typescriptlang.org/docs"],
  nuxt: ["https://nuxt.com/docs", "https://vuejs.org/guide"],
  html: ["https://developer.mozilla.org/en-US/docs/Web/HTML", "https://www.w3.org/WAI/standards-guidelines/wcag"],
  redux: ["https://redux.js.org", "https://redux-toolkit.js.org"],
  "tanstack-query": ["https://tanstack.com/query/latest/docs"],
  "web-performance": ["https://web.dev/articles/vitals", "https://developer.mozilla.org/en-US/docs/Web/Performance"],
  ts: ["https://www.typescriptlang.org/docs"],

  // Backend
  node: ["https://nodejs.org/docs/latest/api"],
  "node.js": ["https://nodejs.org/docs/latest/api"],
  nodejs: ["https://nodejs.org/docs/latest/api"],
  express: ["https://expressjs.com", "https://nodejs.org/docs/latest/api"],
  nestjs: ["https://docs.nestjs.com"],
  django: ["https://docs.djangoproject.com", "https://docs.python.org/3"],
  fastapi: ["https://fastapi.tiangolo.com", "https://docs.python.org/3"],
  laravel: ["https://laravel.com/docs", "https://www.php.net/docs.php"],
  "asp.net": ["https://learn.microsoft.com/aspnet/core"],
  spring: ["https://docs.spring.io", "https://docs.oracle.com/en/java"],
  flask: ["https://flask.palletsprojects.com", "https://docs.python.org/3"],
  rails: ["https://guides.rubyonrails.org", "https://www.ruby-lang.org/en/documentation"],
  gin: ["https://gin-gonic.com/docs", "https://go.dev/doc"],

  // Lenguajes
  python: ["https://docs.python.org/3"],
  java: ["https://docs.oracle.com/en/java"],
  dotnet: ["https://learn.microsoft.com/dotnet"],
  "c#": ["https://learn.microsoft.com/dotnet"],
  go: ["https://go.dev/doc"],
  golang: ["https://go.dev/doc"],
  rust: ["https://doc.rust-lang.org/book"],
  php: ["https://www.php.net/docs.php"],
  kotlin: ["https://kotlinlang.org/docs"],
  swift: ["https://developer.apple.com/documentation/swift"],
  "c++": ["https://en.cppreference.com"],
  ruby: ["https://www.ruby-lang.org/en/documentation"],
  scala: ["https://docs.scala-lang.org"],
  c: ["https://en.cppreference.com/w/c"],
  dart: ["https://dart.dev/guides"],

  // Móvil
  android: ["https://developer.android.com/docs", "https://kotlinlang.org/docs"],
  ios: ["https://developer.apple.com/documentation"],
  flutter: ["https://docs.flutter.dev"],
  "react native": ["https://reactnative.dev/docs/getting-started", "https://react.dev"],
  "jetpack-compose": ["https://developer.android.com/develop/ui/compose/documentation"],
  swiftui: ["https://developer.apple.com/documentation/swiftui"],
  "kotlin-multiplatform": ["https://kotlinlang.org/docs/multiplatform.html"],

  // Datos
  postgresql: ["https://www.postgresql.org/docs"],
  postgres: ["https://www.postgresql.org/docs"],
  mysql: ["https://dev.mysql.com/doc"],
  sqlserver: ["https://learn.microsoft.com/sql"],
  mongodb: ["https://www.mongodb.com/docs"],
  redis: ["https://redis.io/docs"],
  elasticsearch: ["https://www.elastic.co/guide"],
  sql: ["https://www.postgresql.org/docs/current/sql.html", "https://use-the-index-luke.com"],
  oracle: ["https://docs.oracle.com/en/database"],
  sqlite: ["https://www.sqlite.org/docs.html"],
  dynamodb: ["https://docs.aws.amazon.com/amazondynamodb"],
  firestore: ["https://firebase.google.com/docs/firestore"],
  cassandra: ["https://cassandra.apache.org/doc/latest"],

  // Cloud / DevOps
  aws: ["https://docs.aws.amazon.com"],
  azure: ["https://learn.microsoft.com/azure"],
  gcp: ["https://cloud.google.com/docs"],
  "aws-serverless": ["https://docs.aws.amazon.com/lambda", "https://docs.aws.amazon.com/apigateway", "https://docs.aws.amazon.com/sqs"],
  "aws-containers": ["https://docs.aws.amazon.com/ecs", "https://docs.aws.amazon.com/eks"],
  "azure-functions": ["https://learn.microsoft.com/azure/azure-functions", "https://learn.microsoft.com/azure/app-service"],
  "gcp-cloud-run": ["https://cloud.google.com/run/docs", "https://cloud.google.com/functions/docs"],
  firebase: ["https://firebase.google.com/docs", "https://firebase.google.com/docs/rules"],
  ansible: ["https://docs.ansible.com"],
  "github-actions": ["https://docs.github.com/actions"],
  linux: ["https://man7.org/linux/man-pages", "https://www.gnu.org/software/bash/manual"],
  observability: ["https://opentelemetry.io/docs", "https://prometheus.io/docs", "https://sre.google/sre-book/monitoring-distributed-systems"],
  docker: ["https://docs.docker.com"],
  kubernetes: ["https://kubernetes.io/docs"],
  k8s: ["https://kubernetes.io/docs"],
  terraform: ["https://developer.hashicorp.com/terraform/docs"],
  git: ["https://git-scm.com/doc"],
  "ci-cd": ["https://docs.github.com", "https://12factor.net"],
  cicd: ["https://docs.github.com", "https://12factor.net"],

  // API
  openapi: ["https://spec.openapis.org/oas/latest.html"],
  rest: ["https://spec.openapis.org/oas/latest.html"],
  graphql: ["https://graphql.org/learn"],
  grpc: ["https://grpc.io/docs"],
  websockets: ["https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API", "https://www.rfc-editor.org/rfc/rfc6455"],
  kafka: ["https://kafka.apache.org/documentation"],
  rabbitmq: ["https://www.rabbitmq.com/docs"],

  // Testing
  jest: ["https://jestjs.io/docs"],
  vitest: ["https://vitest.dev/guide"],
  playwright: ["https://playwright.dev/docs"],
  cypress: ["https://docs.cypress.io"],
  pytest: ["https://docs.pytest.org"],
  junit: ["https://junit.org/junit5/docs/current/user-guide"],
  testing: SOURCE_CATALOG.testing,

  // Seguridad / arquitectura
  security: SOURCE_CATALOG.security,
  seguridad: SOURCE_CATALOG.security,
  owasp: ["https://owasp.org/www-project-top-ten", "https://cwe.mitre.org"],
  microservices: ["https://microservices.io", "https://martinfowler.com"],
  auth: ["https://oauth.net/2", "https://www.rfc-editor.org/rfc/rfc7519", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"],
  // Teoría de ingeniería de software (SOLID, patrones, arquitectura, clean code).
  "software-engineering": [
    "https://refactoring.guru/design-patterns",
    "https://martinfowler.com/architecture",
    "https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html",
    "https://refactoring.guru/refactoring",
    "https://12factor.net",
  ],
  microservicios: ["https://microservices.io", "https://martinfowler.com"],
  arquitectura: SOURCE_CATALOG.architecture,
  architecture: SOURCE_CATALOG.architecture,
};

/**
 * Fuentes transversales: aplican a cualquier escenario técnico de nivel senior, sea cual sea el
 * stack. Se usan como respaldo cuando la skill no está en el índice y para completar hueco.
 */
export const UNIVERSAL_SOURCES: string[] = [
  "https://github.com/donnemartin/system-design-primer",
  "https://martinfowler.com",
  "https://12factor.net",
  "https://owasp.org/www-project-top-ten",
  "https://netflixtechblog.com",
];

/**
 * Devuelve las fuentes más relevantes para una skill.
 *
 * Estrategia: coincidencia exacta → coincidencia parcial (`"react hooks"` cae en `react`) →
 * fuentes transversales. Nunca devuelve una lista vacía, para que el prompt siempre tenga anclaje.
 */
export function resolveSourcesForSkill(skill: string, max = 4): string[] {
  const key = skill.trim().toLowerCase();
  if (!key) return UNIVERSAL_SOURCES.slice(0, max);

  const exact = TECHNOLOGY_SOURCES[key];
  if (exact) return dedupe([...exact, ...UNIVERSAL_SOURCES]).slice(0, max);

  // Coincidencia parcial solo con claves de 3+ letras: con "c" (lenguaje C) o "go", cualquier
  // texto que contenga esa letra caía en sus fuentes ("brainfuck" → C).
  const partialKey = Object.keys(TECHNOLOGY_SOURCES).find(
    (k) => k.length >= 3 && key.length >= 3 && (key.includes(k) || k.includes(key))
  );
  if (partialKey) {
    return dedupe([...TECHNOLOGY_SOURCES[partialKey], ...UNIVERSAL_SOURCES]).slice(0, max);
  }

  return UNIVERSAL_SOURCES.slice(0, max);
}

/** Todas las URLs del catálogo, sin repetir. Es la lista de ingesta para el futuro RAG. */
export function allSources(): string[] {
  return dedupe(Object.values(SOURCE_CATALOG).flat());
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls)];
}
