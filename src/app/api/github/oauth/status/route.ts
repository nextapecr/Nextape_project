import { NextRequest, NextResponse } from "next/server";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import type { GithubToken } from "@/types/github.types";

export const runtime = "nodejs";

/**
 * GET /api/github/oauth/status
 * 
 * Check if user has active GitHub OAuth token.
 * 
 * Returns:
 * {
 *   hasToken: boolean,
 *   githubUsername: string | null,
 *   scopes: string[]
 * }
 * 
 * Security:
 * - Verifies Firebase auth token (verifyRequestUid)
 * - Never returns actual token value (only metadata)
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const tokenDoc = await adminDb().collection("github_tokens").doc(uid).get();

    if (!tokenDoc.exists) {
      return NextResponse.json({
        hasToken: false,
        githubUsername: null,
        scopes: [],
      });
    }

    const tokenData = tokenDoc.data() as GithubToken;

    // Check if token is revoked
    if (tokenData.revokedAt) {
      return NextResponse.json({
        hasToken: false,
        githubUsername: null,
        scopes: [],
      });
    }

    return NextResponse.json({
      hasToken: true,
      githubUsername: tokenData.githubUsername,
      scopes: tokenData.scopes,
    });
  } catch (err) {
    console.error("[github/oauth/status] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
