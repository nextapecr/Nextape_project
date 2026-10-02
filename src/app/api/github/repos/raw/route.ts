import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUid } from "@/lib/firebase/admin";
import { GithubSignalsService, getGithubToken } from "@/services/github-signals.service";
import { consumeRateLimit, GITHUB_RATE_LIMITS, rateLimitedResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/github/repos/raw
 * Devuelve TODOS los repos del usuario (públicos y privados) SIN filtrar por allowlist.
 * 
 * Usado por el selector de repos privados para mostrar la lista completa.
 * El endpoint normal /api/github/repos filtra por allowlist, este no.
 * 
 * Body: { uid: string }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const limit = await consumeRateLimit(await import("@/lib/firebase/admin").then(m => m.adminDb()), "github_repos_raw", uid, GITHUB_RATE_LIMITS.repos);
    if (!limit.allowed) return rateLimitedResponse(limit);

    const userToken = await getGithubToken(uid);
    if (!userToken) {
      return NextResponse.json(
        { error: "no_github_token", message: "Connect GitHub first" },
        { status: 401 }
      );
    }

    const allRepos = await GithubSignalsService.getCollaborativeRepos(userToken);

    if (allRepos.length === 0) {
      return NextResponse.json({ repos: [], totalRepos: 0 });
    }

    // Ordenar por push más reciente
    const repos = [...allRepos].sort((a, b) =>
      String(b.pushedAt ?? "").localeCompare(String(a.pushedAt ?? ""))
    );

    return NextResponse.json({
      repos: repos.map((repo) => ({
        name: repo.name,
        fullName: repo.fullName,
        language: repo.language,
        pushedAt: repo.pushedAt,
        sizeKB: repo.sizeKB,
        stargazersCount: repo.stargazersCount,
        isPrivate: repo.isPrivate,
      })),
      totalRepos: repos.length,
    });
  } catch (err) {
    console.error("[github/repos/raw] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
