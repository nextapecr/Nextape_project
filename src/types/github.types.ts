/**
 * @fileOverview Tipos canónicos del GitHub Evaluation Engine.
 * Fuente de verdad para las tres capas: Signals (API), Engine (AST/IR) y Feedback (Mistral).
 * Ver docs/DATABASE.md (colección `github_evidence`) y docs/ARCHITECTURE.md §GitHub Engine.
 */

// ─────────────────────────────────────────────────────────
// CAPA 1 — Señales crudas de la GitHub API
// ─────────────────────────────────────────────────────────

/** Repositorio simplificado devuelto por GET /users/{username}/repos */
export interface GithubRepo {
  name: string;
  fullName: string;        // "owner/repo"
  owner: string;
  isForked: boolean;
  pushedAt: string | null; // ISO 8601
  stargazersCount: number;
  sizeKB: number;
  language: string | null;
  /** Repositorio archivado: se excluye del análisis. */
  archived?: boolean;
  /** Repositorio privado (Phase 4): requiere OAuth con scope 'repo' */
  isPrivate?: boolean;
}

/** Señales brutas extraídas de la GitHub API para un repositorio concreto */
export interface RepoSignals {
  owner: string;
  repo: string;
  lastCommitSHA: string;
  /** Commits propios en los últimos 90 días */
  commitFrequency90d: number;
  /** Mapa de lenguajes → bytes de código */
  languages: Record<string, number>;
  hasTests: boolean;
  hasCI: boolean;
  hasReadme: boolean;
  readmeLength: number;
  sizeKB: number;
  stargazersCount: number;
}

// ─────────────────────────────────────────────────────────
// CAPA 2 — IR Universal + Métricas del motor determinístico
// ─────────────────────────────────────────────────────────

/** Métricas calculadas por los analyzers (valores numéricos 0–100 o razones) */
export interface EngineMetrics {
  /** Complejidad ciclomática media (null si no hay archivos AST analizados) */
  complexityScore: number | null;
  /** Acoplamiento entre módulos (null si no hay archivos AST analizados) */
  couplingScore: number | null;
  /** Proporción de código muerto detectado (null si no hay archivos AST analizados) */
  deadCodeScore: number | null;
  /** Cobertura de tests detectada (score 0-100) */
  testingScore: number;
  /** Presencia y calidad de documentación inline (score 0-100) */
  documentationScore: number;
}

/** Scores finales por skill, calculados por el skill-mapper a partir de EngineMetrics */
export interface GithubSkillScores {
  /** Arquitectura y estructura del código (null si no hay parsers AST para el lenguaje) */
  architecture: number | null;
  /** Calidad y cobertura de tests */
  testing: number;
  /** Seguridad básica detectada en patrones (null si no hay parsers AST para el lenguaje) */
  security: number | null;
  /** Mantenibilidad general (null si no hay parsers AST para el lenguaje) */
  maintainability: number | null;
  /** Documentación del código */
  documentation: number;
  /** Puntuación global ponderada (0-100), calculada dinámicamente sobre métricas disponibles */
  overall: number;
  /** Top debilidades o advertencias para la IA */
  topWeaknesses: string[];
  /** Indica si se pudieron parsear archivos fuente AST */
  hasASTData: boolean;
}

// ─────────────────────────────────────────────────────────
// CAPA 3 — Feedback de Mistral
// ─────────────────────────────────────────────────────────

/** Feedback generado por Mistral a partir de GithubSkillScores (nunca código fuente) */
export interface GithubAIFeedback {
  feedback: string;
  strengths: string[];
  improvements: string[];
}

// ─────────────────────────────────────────────────────────
// Resultado completo — lo que se guarda en github_evidence/{uid}
// ─────────────────────────────────────────────────────────

/**
 * Documento guardado en `github_evidence/{uid}` (server-only, Admin SDK).
 * Cache por SHA: si `lastCommitSHA` no cambia, se devuelve el resultado existente.
 */
export interface GithubEvidence {
  uid: string;
  githubUsername: string;
  analyzedRepo: string;        // "owner/repo"
  lastCommitSHA: string;       // clave de cache
  repoSignals: RepoSignals;
  metrics: EngineMetrics;
  skillScores: GithubSkillScores;
  aiFeedback: GithubAIFeedback | null;
  analyzedAt: FirebaseFirestore.Timestamp | { _seconds: number; _nanoseconds: number };
  /** Versión del motor, para invalidar cache si el algoritmo cambia */
  engineVersion: string;

  // ── Agregado multi-repositorio (presentes desde engine 2.0.0) ──
  /** Repositorios analizados que componen este perfil. */
  reposAnalyzed?: number;
  /** Repositorios con código analizable por el motor. */
  reposWithCode?: number;
  /** Archivos parseados en total. */
  filesAnalyzed?: number;
  /** Bytes por lenguaje sumados en todos los repositorios (fuente: GitHub). */
  languagesBytes?: Record<string, number>;
  /** Archivos parseados por lenguaje del motor. */
  parsedLanguages?: Record<string, number>;
  /** Resumen por repositorio para la UI. */
  repos?: GithubRepoSummary[];
  /** Si la cuenta de GitHub analizada está vinculada al usuario por OAuth. */
  identity?: GithubIdentity;
}

/** Resumen de un repositorio dentro del perfil agregado. */
export interface GithubRepoSummary {
  fullName: string;
  overall: number | null;
  hasASTData: boolean;
  filesAnalyzed: number;
  mainLanguage: string | null;
  /** Repositorio privado (Phase 4) */
  isPrivate?: boolean;
}

/**
 * Vínculo entre la cuenta de NEXTAPE y la cuenta de GitHub analizada.
 * `verified` solo es true cuando el usuario inició sesión con GitHub y el id numérico coincide.
 */
export interface GithubIdentity {
  verified: boolean;
  method: "github_oauth" | null;
  /** Usuario de GitHub vinculado a la sesión cuando NO coincide con el analizado (para ofrecer analizarlo). */
  linkedLogin?: string | null;
}

// ─────────────────────────────────────────────────────────
// GitHub OAuth Token Storage (server-only, Admin SDK)
// ─────────────────────────────────────────────────────────

/**
 * Encrypted GitHub OAuth token stored in `github_tokens/{uid}`.
 * Server-only collection (write:false for clients).
 * 
 * Security:
 * - Token encrypted with AES-256-GCM (key in TOKEN_ENCRYPTION_KEY env var)
 * - IV and authTag ensure uniqueness and integrity
 * - Never exposed to client (Admin SDK only)
 */
export interface GithubToken {
  /** User ID (document ID) */
  uid: string;
  /** AES-256-GCM encrypted OAuth token (base64) */
  encryptedToken: string;
  /** Initialization vector for AES-GCM (base64, unique per token) */
  iv: string;
  /** Authentication tag for GCM integrity check (base64) */
  authTag: string;
  /** GitHub numeric user ID (from OAuth) */
  githubUserId: number;
  /** GitHub username (from OAuth) */
  githubUsername: string;
  /** OAuth scopes granted by user */
  scopes: string[];
  /** When token was first stored */
  createdAt: FirebaseFirestore.Timestamp | { _seconds: number; _nanoseconds: number };
  /** Last time token was used for API request */
  lastUsedAt: FirebaseFirestore.Timestamp | { _seconds: number; _nanoseconds: number };
  /** If user disconnected GitHub, timestamp of revocation */
  revokedAt: FirebaseFirestore.Timestamp | { _seconds: number; _nanoseconds: number } | null;
  /** 
   * Allowlist of private repos user explicitly selected for analysis.
   * Format: ["owner/repo1", "owner/repo2"]
   * Public repos don't need opt-in (always analyzed).
   * Empty array = no private repos selected.
   */
  privateReposAllowlist?: string[];
}

/**
 * Evidencia de UN repositorio: `github_evidence/{uid}/repos/{repoId}` (server-only, Admin SDK).
 * Es la unidad de caché: si `pushedAt` y `lastCommitSHA` no cambian, no se vuelve a analizar.
 */
export interface GithubRepoEvidence {
  uid: string;
  githubUsername: string;
  fullName: string;
  pushedAt: string | null;
  lastCommitSHA: string;
  repoSignals: RepoSignals;
  metrics: EngineMetrics;
  skillScores: GithubSkillScores;
  filesAnalyzed: number;
  parsedLanguages: Record<string, number>;
  analyzedAt: FirebaseFirestore.Timestamp | { _seconds: number; _nanoseconds: number };
  engineVersion: string;
  /** Repositorio privado (Phase 4) */
  isPrivate?: boolean;
}

/** Elemento del listado de POST /api/github/repos. */
export interface GithubRepoListItem {
  name: string;
  fullName: string;
  language: string | null;
  pushedAt: string | null;
  sizeKB: number;
  stargazersCount: number;
  /** Ya analizado y sin cambios desde entonces. */
  analyzed: boolean;
  /** Repositorio privado (Phase 4) */
  isPrivate?: boolean;
}

/** Respuesta de POST /api/github/repos. */
export interface GithubRepoListResponse {
  githubUsername: string;
  /** Como mucho `MAX_REPOS_PER_ANALYSIS`, los de push más reciente. */
  repos: GithubRepoListItem[];
  /** Repositorios analizables de la cuenta antes del tope. */
  totalRepos: number;
}

/** Respuesta de POST /api/github/evaluate (un repositorio). */
export interface GithubRepoEvaluateResponse {
  cached: boolean;
  fullName: string;
  skillScores: GithubSkillScores;
  filesAnalyzed: number;
  parsedLanguages: Record<string, number>;
}

/** Respuesta de POST /api/github/aggregate. */
export interface GithubAggregateResponse {
  reposAnalyzed: number;
  reposWithCode: number;
  filesAnalyzed: number;
  skillScores: GithubSkillScores;
  aiFeedback: GithubAIFeedback | null;
  languagesBytes: Record<string, number>;
  parsedLanguages: Record<string, number>;
  repos: GithubRepoSummary[];
  identity: GithubIdentity;
  analyzedAt: string;
}

