import { NextRequest, NextResponse } from "next/server";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { GITHUB_USERNAME_PATTERN } from "@/services/github-engine/evidence-keys";
import { consumeRateLimit, rateLimitedResponse, type RateLimitRule } from "./rate-limit";

/**
 * Entrada común de los endpoints de GitHub que reciben `{ githubUsername }`: autentica con el ID
 * token, valida el usuario de GitHub y consume el rate limit del endpoint. Devuelve la respuesta de
 * error lista para retornar, o el uid y el usuario. (`/api/github/repos` y `/aggregate` tenían cada
 * uno su copia.)
 *
 * Llamar dentro del `try` del handler: un fallo de Firestore al consumir el límite debe acabar en el
 * 500 del handler.
 */
export async function authorizeGithubRequest(
  req: NextRequest,
  rateLimit: { scope: string; rule: RateLimitRule },
): Promise<{ uid: string; githubUsername: string } | NextResponse> {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const githubUsername = typeof body?.githubUsername === "string" ? body.githubUsername.trim() : "";
  if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
    return NextResponse.json({ error: "invalid_github_username" }, { status: 400 });
  }

  const limit = await consumeRateLimit(adminDb(), rateLimit.scope, uid, rateLimit.rule);
  if (!limit.allowed) return rateLimitedResponse(limit);
  return { uid, githubUsername };
}
