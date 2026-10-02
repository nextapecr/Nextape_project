import { NextRequest, NextResponse } from "next/server";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { GithubSignalsService, getGithubToken } from "@/services/github-signals.service";
import {
  GITHUB_ENGINE_VERSION,
  GITHUB_USERNAME_PATTERN,
  MAX_REPOS_PER_ANALYSIS,
  repoDocId,
} from "@/services/github-engine/evidence-keys";
import { consumeRateLimit, GITHUB_RATE_LIMITS, rateLimitedResponse } from "@/lib/server/rate-limit";
import type { GithubRepoListItem, GithubRepoListResponse } from "@/types/github.types";

export const runtime = "nodejs";

/** Borrados por lote (un batch de Firestore admite 500 operaciones). */
const DELETE_BATCH_SIZE = 400;

/**
 * POST /api/github/repos
 * Lista los repositorios analizables de una cuenta (sin forks, archivados ni vacíos) —los
 * `MAX_REPOS_PER_ANALYSIS` con push más reciente— y marca cuáles ya están analizados y sin cambios,
 * para que el cliente solo reanalice lo necesario.
 *
 * El análisis va repositorio a repositorio (`/api/github/evaluate`) orquestado por el cliente:
 * analizar decenas de repos en una sola petición excede el tiempo de una Netlify Function.
 *
 * También poda la evidencia guardada de repositorios que ya no están en esa lista (borrados,
 * renombrados o fuera del tope). Sin esto, un repo analizado y después borrado seguía sumando en el
 * perfil agregado para siempre, y uno renombrado contaba dos veces.
 *
 * Body: { githubUsername: string }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const githubUsername = typeof body?.githubUsername === "string" ? body.githubUsername.trim() : "";
  if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
    return NextResponse.json({ error: "invalid_github_username" }, { status: 400 });
  }

  try {
    // Listar pagina hasta 10 veces con el GITHUB_TOKEN compartido.
    const limit = await consumeRateLimit(adminDb(), "github_repos", uid, GITHUB_RATE_LIMITS.repos);
    if (!limit.allowed) return rateLimitedResponse(limit);

    const reposRef = adminDb().collection("github_evidence").doc(uid).collection("repos");
    
    // Phase 3: Usar OAuth token del usuario para obtener repos colaborativos también
    const userToken = await getGithubToken(uid);
    
    // Phase 4: Obtener allowlist de repos privados
    let privateReposAllowlist: string[] = [];
    if (userToken) {
      const tokenDoc = await adminDb().collection("github_tokens").doc(uid).get();
      const tokenData = tokenDoc.data();
      privateReposAllowlist = Array.isArray(tokenData?.privateReposAllowlist)
        ? tokenData.privateReposAllowlist
        : [];
    }
    
    const [allRepos, existing] = await Promise.all([
      userToken
        ? GithubSignalsService.getCollaborativeRepos(userToken) // Phase 3: Incluye colaborativos
        : GithubSignalsService.getUserRepos(githubUsername),    // Fallback: Solo propios
      reposRef.get(),
    ]);

    if (allRepos.length === 0) {
      return NextResponse.json({ error: "no_repos_found" }, { status: 404 });
    }

    // Phase 4: Filtrar repos privados que NO están en la allowlist
    // Repos públicos: siempre incluidos
    // Repos privados: solo si están en privateReposAllowlist
    const allowlistSet = new Set(privateReposAllowlist);
    const filteredRepos = allRepos.filter((repo) => {
      if (!repo.isPrivate) return true; // Repos públicos siempre incluidos
      return allowlistSet.has(repo.fullName); // Privados: solo si están en allowlist
    });

    // La API ya ordena por push; se reordena igualmente para que el tope conserve los más recientes.
    const repos = [...filteredRepos]
      .sort((a, b) => String(b.pushedAt ?? "").localeCompare(String(a.pushedAt ?? "")))
      .slice(0, MAX_REPOS_PER_ANALYSIS);
    const current = new Set(repos.map((repo) => repoDocId(repo.fullName)));

    const stale = existing.docs.filter((doc) => !current.has(doc.id));
    for (let i = 0; i < stale.length; i += DELETE_BATCH_SIZE) {
      const batch = adminDb().batch();
      stale.slice(i, i + DELETE_BATCH_SIZE).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    const previous = new Map<string, { pushedAt: string | null; engineVersion?: string }>();
    existing.forEach((doc) => {
      const data = doc.data();
      previous.set(doc.id, { pushedAt: data.pushedAt ?? null, engineVersion: data.engineVersion });
    });

    const items: GithubRepoListItem[] = repos.map((repo) => {
      const prev = previous.get(repoDocId(repo.fullName));
      return {
        name: repo.name,
        fullName: repo.fullName,
        language: repo.language,
        pushedAt: repo.pushedAt,
        sizeKB: repo.sizeKB,
        stargazersCount: repo.stargazersCount,
        analyzed: Boolean(
          prev && prev.engineVersion === GITHUB_ENGINE_VERSION && prev.pushedAt === repo.pushedAt,
        ),
        isPrivate: repo.isPrivate, // Phase 4: Include private flag
      };
    });

    const response: GithubRepoListResponse = { githubUsername, repos: items, totalRepos: allRepos.length };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("no encontrado")) {
      return NextResponse.json({ error: "github_user_not_found" }, { status: 404 });
    }
    console.error("[github/repos] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
