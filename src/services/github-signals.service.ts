/**
 * @fileOverview Capa 1 — GitHub Signals Service.
 * Sin IA, sin parsers, interactúa directamente con GitHub REST API v3.
 * Extrae datos del perfil del usuario, estadísticas de repositorios y señales estructurales.
 */

import type { GithubRepo, RepoSignals, GithubToken } from '../types/github.types';
import { EXTENSION_MAP } from './github-engine/parsers/universal-parser';

/**
 * Enhanced error class for GitHub API calls.
 * Preserves HTTP status, stage, and endpoint for precise diagnosis.
 */
export class GithubApiError extends Error {
  constructor(
    message: string,
    public httpStatus: number,
    public endpoint: string,
    public stage: string
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

const GITHUB_API_BASE = 'https://api.github.com';

/** Archivos por repositorio que se descargan para el motor. */
export const MAX_FILES_PER_REPO = 12;
/** Páginas de 100 repositorios que se recorren como máximo (1 000 repos). */
const MAX_REPO_PAGES = 10;
/** Descargas de archivos en paralelo por repositorio. */
const FILE_FETCH_CONCURRENCY = 6;
/** Rango de tamaño útil: fuera quedan archivos vacíos, minificados y generados enormes. */
const MIN_FILE_BYTES = 200;
const MAX_FILE_BYTES = 150_000;
const EXCLUDED_PATH_PARTS = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  "vendor/",
  "third_party/",
  "third-party/",
  "coverage/",
  "generated/",
  "__generated__/",
  "target/",
  "bin/",
  "obj/",
];

export interface RepoTreeEntry {
  path: string;
  type: string;
  size?: number;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const EXTENSIONS_LONGEST_FIRST = Object.keys(EXTENSION_MAP).sort((a, b) => b.length - a.length);

/** Lenguaje del motor para una ruta, o null si no es un lenguaje soportado. */
export function languageForPath(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".d.ts") || lower.includes(".min.")) return null;
  const ext = EXTENSIONS_LONGEST_FIRST.find((e) => lower.endsWith(e));
  return ext ? EXTENSION_MAP[ext] : null;
}

/**
 * Elige archivos representativos de un repositorio, repartidos ENTRE LENGUAJES.
 *
 * Antes se tomaban los 8 primeros archivos del árbol en orden alfabético: en facebook/folly eso
 * fueron 6 cabeceras y 2 scripts de shell, sin un solo .cpp. Ahora se agrupa por lenguaje, dentro de
 * cada lenguaje se priorizan los archivos con más código, y se toma por turnos empezando por el
 * lenguaje con más volumen. Un repositorio políglota aporta evidencia de cada uno de sus lenguajes.
 */
export function selectRepresentativeFiles(
  tree: RepoTreeEntry[],
  max = MAX_FILES_PER_REPO,
): RepoTreeEntry[] {
  console.log(`[github-signals] 🔍 DIAGNOSTIC: selectRepresentativeFiles() with ${tree.length} total files`);
  
  const groups = new Map<string, RepoTreeEntry[]>();
  for (const item of tree) {
    if (item.type !== "blob") continue;
    const lower = item.path.toLowerCase();
    if (EXCLUDED_PATH_PARTS.some((part) => lower.includes(part))) continue;
    const size = item.size ?? 0;
    if (size < MIN_FILE_BYTES || size > MAX_FILE_BYTES) continue;
    const language = languageForPath(item.path);
    if (!language) continue;
    groups.set(language, [...(groups.get(language) ?? []), item]);
  }

  console.log(`[github-signals] 📊 DIAGNOSTIC: Grouped into ${groups.size} languages:`, Array.from(groups.keys()));
  for (const [lang, items] of groups.entries()) {
    console.log(`[github-signals]   - ${lang}: ${items.length} files`);
  }

  const ordered = [...groups.values()]
    .map((items) => ({
      bytes: items.reduce((n, i) => n + (i.size ?? 0), 0),
      items: [...items].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const picked: RepoTreeEntry[] = [];
  for (let round = 0; picked.length < max; round++) {
    let tookAny = false;
    for (const group of ordered) {
      if (picked.length >= max) break;
      const item = group.items[round];
      if (item) {
        picked.push(item);
        tookAny = true;
      }
    }
    if (!tookAny) break;
  }
  
  console.log(`[github-signals] ✅ DIAGNOSTIC: Selected ${picked.length} files for analysis`);
  picked.forEach((f, idx) => {
    const lang = languageForPath(f.path);
    console.log(`[github-signals]   ${idx + 1}. ${f.path} (${lang}, ${f.size} bytes)`);
  });
  
  return picked;
}

export const GithubSignalsService = {
  /**
   * Todos los repositorios accesibles con el token OAuth del usuario (Phase 3).
   * 
   * Incluye repos propios, colaborativos y de organizaciones usando
   * affiliation=collaborator,organization_member,owner.
   * 
   * El filtro por autoría se aplicará después sobre los commits individuales,
   * no aquí — este método simplemente lista TODO lo que el usuario puede ver.
   * 
   * @param token - OAuth token del usuario
   * @returns Todos los repos accesibles (sin forks ni archivados)
   */
  async getCollaborativeRepos(token: string): Promise<GithubRepo[]> {
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'NEXTAPE-GitHub-Engine',
      Authorization: `Bearer ${token}`,
    };
    const raw: Array<Record<string, unknown>> = [];

    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const res = await fetch(
        `${GITHUB_API_BASE}/user/repos?affiliation=collaborator,organization_member,owner&sort=pushed&per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) {
        throw new Error(`Error en GitHub API (${res.status}): ${res.statusText}`);
      }
      const data: Array<Record<string, unknown>> = await res.json();
      raw.push(...data);
      if (data.length < 100) break;
    }

    return raw
      .filter((repo) => !repo.fork && !repo.archived && Number(repo.size ?? 0) > 0)
      .map((repo) => ({
        name: String(repo.name),
        fullName: String(repo.full_name),
        owner: String((repo.owner as Record<string, unknown>)?.login ?? ''),
        isForked: false,
        archived: false,
        pushedAt: repo.pushed_at ? String(repo.pushed_at) : null,
        stargazersCount: Number(repo.stargazers_count ?? 0),
        sizeKB: Number(repo.size ?? 0),
        language: repo.language ? String(repo.language) : null,
        isPrivate: Boolean(repo.private), // Phase 4: Include private repos
      }));
  },

  /**
   * Obtiene commits de un usuario específico en un repositorio (Phase 3).
   * 
   * Filtra el historial por autoría usando author={username}, lo que da la señal
   * real de "qué escribió esta persona" en ese repo, sin importar si es dueño o colaborador.
   * 
   * @param owner - Dueño del repositorio
   * @param repo - Nombre del repositorio
   * @param username - GitHub username para filtrar commits
   * @param token - OAuth token (opcional, usa shared PAT si no se proporciona)
   * @returns Lista de commits del usuario con archivos modificados
   */
  async getUserCommitsInRepo(
    owner: string,
    repo: string,
    username: string,
    token?: string,
  ): Promise<Array<{ sha: string; files: string[] }>> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'NEXTAPE-GitHub-Engine',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const commits: Array<{ sha: string; files: string[] }> = [];
    
    // Últimos 90 días de commits del usuario
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    
    try {
      const res = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?author=${encodeURIComponent(username)}&since=${since}&per_page=100`,
        { headers },
      );
      
      if (!res.ok) {
        const status = res.status;
        console.warn(`[github-signals] No se pudieron obtener commits de ${username} en ${owner}/${repo} (status ${status})`);
        
        // Don't throw - return empty array, but log the HTTP status for diagnosis
        if (status === 403 || status === 401) {
          console.error(`[github-signals] PERMISSION ERROR getting commits for ${owner}/${repo}: HTTP ${status}`);
        }
        return [];
      }
      
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      
      for (const commit of data) {
        // Obtener detalles del commit para ver qué archivos tocó
        const detailRes = await fetch(
          `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${commit.sha}`,
          { headers },
        );
        
        if (detailRes.ok) {
          const detail = await detailRes.json();
          const files = Array.isArray(detail.files) 
            ? detail.files.map((f: { filename?: string }) => f.filename || '').filter(Boolean)
            : [];
          
          commits.push({ sha: commit.sha, files });
        }
      }
      
      return commits;
    } catch (err) {
      console.error(
        `[github-signals] Error obteniendo commits de ${username} en ${owner}/${repo}:`,
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  /** Id numérico de una cuenta de GitHub (para verificar el vínculo con el login por OAuth). */
  async getUserId(username: string): Promise<number | null> {
    const res = await fetch(`${GITHUB_API_BASE}/users/${encodeURIComponent(username)}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'NEXTAPE-GitHub-Engine',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.id === "number" ? data.id : null;
  },

  /** Usuario actual de una cuenta a partir de su id numérico (el que guarda Firebase al vincular GitHub). */
  async getLoginById(id: string): Promise<string | null> {
    if (!/^\d{1,20}$/.test(id)) return null;
    const res = await fetch(`${GITHUB_API_BASE}/user/${id}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'NEXTAPE-GitHub-Engine',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.login === "string" ? data.login : null;
  },

  /**
   * Obtiene SOLO el SHA del último commit de un repo (Phase 5).
   * 
   * Llamada ligera (1 commit) para verificar si el cache está actualizado
   * antes de hacer el análisis completo. Evita ~5 llamadas innecesarias a GitHub API
   * y ejecución del motor si no hay commits nuevos.
   * 
   * @param owner - Dueño del repositorio
   * @param repo - Nombre del repositorio
   * @param token - Token OAuth (requerido para acceso autenticado)
   * @returns SHA del último commit o null si hay error
   */
  async getLatestCommitSHA(owner: string, repo: string, token?: string): Promise<string | null> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'NEXTAPE-GitHub-Engine',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const res = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`,
        { headers },
      );
      
      if (!res.ok) {
        const status = res.status;
        console.warn(`[github-signals] No se pudo obtener último commit de ${owner}/${repo} (status ${status})`);
        
        // Log permission errors for diagnosis
        if (status === 403 || status === 401) {
          console.error(`[github-signals] PERMISSION ERROR getting latest commit for ${owner}/${repo}: HTTP ${status}`);
        }
        return null;
      }
      
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      
      return data[0]?.sha || null;
    } catch (err) {
      console.error(
        `[github-signals] Error obteniendo último commit SHA de ${owner}/${repo}:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  },

  /**
   * Señales y árbol de un repositorio en una sola pasada.
   *
   * Las tres consultas independientes van en paralelo, y el árbol se devuelve para reutilizarlo al
   * elegir archivos: antes se pedía dos veces. Mantiene cada análisis dentro del tiempo de una
   * Netlify Function.
   * 
   * @param owner - Dueño del repositorio
   * @param repo - Nombre del repositorio
   * @param token - OAuth token opcional (recomendado para evitar rate limiting)
   */
  async getRepoSnapshot(
    owner: string,
    repo: string,
    token?: string,
  ): Promise<{ signals: RepoSignals; tree: RepoTreeEntry[]; pushedAt: string | null; isPrivate: boolean }> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'NEXTAPE-GitHub-Engine',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [repoRes, langRes, commitsRes] = await Promise.all([
      fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers }),
      fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/languages`, { headers }),
      fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?since=${since}&per_page=100`, { headers }),
    ]);

    if (!repoRes.ok) {
      const status = repoRes.status;
      const endpoint = `/repos/${owner}/${repo}`;
      console.warn(`[github-signals] Error al obtener ${owner}/${repo} (status ${status})`);
      
      // Preserve HTTP status and stage for classification
      throw new GithubApiError(
        `No se pudo obtener información del repositorio ${owner}/${repo} (HTTP ${status})`,
        status,
        endpoint,
        'get_repo_info'
      );
    }
    const repoData = await repoRes.json();

    let languages: Record<string, number> = {};
    if (langRes.ok) languages = await langRes.json();
    else console.warn(`[github-signals] /languages falló para ${owner}/${repo} (status ${langRes.status})`);

    let lastCommitSHA = "";
    let commitFrequency90d = 0;
    if (commitsRes.ok) {
      const commits = await commitsRes.json();
      if (Array.isArray(commits) && commits.length > 0) {
        lastCommitSHA = commits[0].sha ?? "";
        commitFrequency90d = commits.length;
      }
    } else {
      console.warn(`[github-signals] /commits falló para ${owner}/${repo} (status ${commitsRes.status})`);
    }

    // Sin commits en 90 días no hay SHA reciente: se toma la cabeza de la rama por defecto para
    // que la caché por SHA también funcione en repositorios inactivos.
    if (!lastCommitSHA && repoData.default_branch) {
      const branchRes = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${encodeURIComponent(String(repoData.default_branch))}`,
        { headers },
      );
      if (branchRes.ok) lastCommitSHA = (await branchRes.json())?.commit?.sha ?? "";
    }

    let tree: RepoTreeEntry[] = [];
    const treeRes = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${lastCommitSHA || "HEAD"}?recursive=1`,
      { headers },
    );
    if (treeRes.ok) {
      const data = await treeRes.json();
      tree = Array.isArray(data.tree) ? data.tree : [];
    } else {
      console.warn(`[github-signals] /git/trees falló para ${owner}/${repo} (status ${treeRes.status})`);
    }

    let hasTests = false;
    let hasCI = false;
    let hasReadme = false;
    let readmeLength = 0;

    for (const item of tree) {
      const p = item.path.toLowerCase();
      // Convenciones de test de los lenguajes soportados, no solo las de JavaScript: sin esto un
      // repositorio de Python (test_*.py, tests/) o de Go (_test.go) salía siempre "sin tests".
      if (
        p.includes(".test.") ||
        p.includes(".spec.") ||
        p.includes("__tests__/") ||
        p.startsWith("tests/") ||
        p.startsWith("test/") ||
        p.includes("/tests/") ||
        p.includes("/test/") ||
        p.endsWith("_test.go") ||
        p.endsWith("_test.py") ||
        /(^|\/)test_[^/]+\.py$/.test(p) ||
        p.endsWith("test.java") ||
        p.endsWith("tests.cs") ||
        p.endsWith("_spec.rb")
      ) {
        hasTests = true;
      }
      if (
        p.startsWith(".github/workflows/") ||
        p === ".gitlab-ci.yml" ||
        p === ".circleci/config.yml" ||
        p === "jenkinsfile" ||
        p === "azure-pipelines.yml"
      ) {
        hasCI = true;
      }
      if (p === "readme.md" || p === "readme" || p === "readme.rst") {
        hasReadme = true;
        readmeLength = item.size ?? 0;
      }
    }

    return {
      signals: {
        owner,
        repo,
        lastCommitSHA,
        commitFrequency90d,
        languages,
        hasTests,
        hasCI,
        hasReadme,
        readmeLength,
        sizeKB: Number(repoData.size ?? 0),
        stargazersCount: Number(repoData.stargazers_count ?? 0),
      },
      tree,
      // Clave de caché del listado de repos: si no cambia, no hace falta reanalizar.
      pushedAt: repoData.pushed_at ? String(repoData.pushed_at) : null,
      isPrivate: Boolean(repoData.private), // Phase 4: Include private flag
    };
  },

  /** Compatibilidad con los scripts existentes: solo las señales. */
  async getRepoSignals(owner: string, repo: string, token?: string): Promise<RepoSignals> {
    return (await GithubSignalsService.getRepoSnapshot(owner, repo, token)).signals;
  },

  /**
   * Descarga archivos representativos (máx. MAX_FILES_PER_REPO), repartidos entre lenguajes.
   *
   * Se leen de raw.githubusercontent.com —no consume cuota de la API ni requiere decodificar base64—
   * y en paralelo; si raw falla se intenta la API de contenidos. Si se pasa el árbol ya descargado
   * (de `getRepoSnapshot`), no se vuelve a pedir.
   * 
   * Phase 3: Si se proporciona userTouchedFiles, prioriza archivos que el usuario modificó en sus
   * propios commits (cruza contra la selección de "archivos centrales" existente).
   * 
   * @param token - OAuth token opcional (recomendado para evitar rate limiting)
   */
  async fetchCentralSourceFiles(
    owner: string,
    repo: string,
    commitSHA: string,
    tree?: RepoTreeEntry[],
    userTouchedFiles?: string[],
    token?: string,
  ): Promise<Array<{ filename: string; content: string }>> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'NEXTAPE-GitHub-Engine',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const ref = commitSHA || "HEAD";
    let entries = tree;

    if (!entries) {
      const treeRes = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
        { headers },
      );
      if (!treeRes.ok) {
        const status = treeRes.status;
        console.warn(`[github-signals] No se pudo leer el árbol de ${owner}/${repo} (status ${status})`);
        
        // If permission error, throw to propagate for diagnosis
        if (status === 403 || status === 401) {
          throw new GithubApiError(
            `No se pudo acceder al árbol del repositorio ${owner}/${repo} (HTTP ${status})`,
            status,
            `/repos/${owner}/${repo}/git/trees/${ref}`,
            'get_tree'
          );
        }
        return [];
      }
      const data = await treeRes.json();
      entries = Array.isArray(data.tree) ? data.tree : [];
    }

    const selected = selectRepresentativeFiles(entries ?? []);
    if (selected.length === 0) {
      console.warn(`[github-signals] ${owner}/${repo} no tiene archivos en los lenguajes soportados.`);
      return [];
    }

    // Phase 3: Priorizar archivos que el usuario modificó en sus commits
    let prioritized = selected;
    if (userTouchedFiles && userTouchedFiles.length > 0) {
      const userTouchedSet = new Set(userTouchedFiles.map(f => f.toLowerCase()));
      const userFiles = selected.filter(f => userTouchedSet.has(f.path.toLowerCase()));
      const otherFiles = selected.filter(f => !userTouchedSet.has(f.path.toLowerCase()));
      
      // Priorizar archivos del usuario, luego rellenar con otros hasta MAX_FILES_PER_REPO
      prioritized = [...userFiles, ...otherFiles].slice(0, MAX_FILES_PER_REPO);
      
      if (userFiles.length > 0) {
        console.log(
          `[github-signals] Priorizando ${userFiles.length} archivos modificados por el usuario en ${owner}/${repo}`
        );
      }
    }

    const files = await mapWithConcurrency(prioritized, FILE_FETCH_CONCURRENCY, async (file) => {
      const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
      try {
        const rawRes = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodedPath}`,
          { headers },
        );
        if (rawRes.ok) return { filename: file.path, content: await rawRes.text() };

        const apiRes = await fetch(
          `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${ref}`,
          { headers },
        );
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data.content && data.encoding === "base64") {
            return {
              filename: file.path,
              content: Buffer.from(data.content, "base64").toString("utf8"),
            };
          }
        }
        console.warn(`[github-signals] No se pudo descargar ${owner}/${repo}/${file.path}`);
      } catch (err) {
        console.warn(`[github-signals] Error descargando ${file.path}:`, err instanceof Error ? err.message : err);
      }
      return null;
    });

    return files.filter((f): f is { filename: string; content: string } => f !== null);
  },
};

/**
 * Retrieve and decrypt a user's GitHub OAuth token (server-only).
 * 
 * Returns the decrypted token if:
 * - Token document exists in github_tokens/{uid}
 * - Token is not revoked
 * - Decryption succeeds
 * 
 * Returns null if:
 * - No token stored for user
 * - Token is revoked
 * - Decryption fails (corrupted data, wrong key)
 * 
 * OAuth is now mandatory for GitHub analysis (Phase 2). If this returns null,
 * the user must connect their GitHub account via OAuth first.
 * 
 * @param uid - User ID
 * @returns Decrypted OAuth token or null
 * 
 * @example
 * const token = await getGithubToken(uid);
 * if (!token) {
 *   return NextResponse.json({ error: "no_github_token" }, { status: 401 });
 * }
 * const repos = await GithubSignalsService.getCollaborativeRepos(token);
 */
export async function getGithubToken(uid: string): Promise<string | null> {
  // Only import Admin SDK when running in server context
  // This function should only be called from route handlers
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const { decryptToken } = await import('@/lib/server/token-encryption');
    
    const tokenDoc = await adminDb().collection('github_tokens').doc(uid).get();
    
    if (!tokenDoc.exists) {
      return null;
    }
    
    const tokenData = tokenDoc.data() as GithubToken;
    
    // Check if token is revoked
    if (tokenData.revokedAt) {
      console.warn(`[github-signals] Token for user ${uid} is revoked`);
      return null;
    }
    
    // Decrypt token
    try {
      const decrypted = decryptToken(
        tokenData.encryptedToken,
        tokenData.iv,
        tokenData.authTag
      );
      return decrypted;
    } catch (err) {
      console.error(
        `[github-signals] Failed to decrypt token for user ${uid}:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  } catch (err) {
    console.error(
      `[github-signals] Error retrieving token for user ${uid}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
