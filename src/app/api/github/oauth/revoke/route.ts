import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { getGithubToken } from "@/services/github-signals.service";

export const runtime = "nodejs";

/**
 * POST /api/github/oauth/revoke
 * 
 * Revokes user's GitHub OAuth token.
 * 
 * Flow:
 * 1. Client requests token revocation
 * 2. Server marks token as revoked in Firestore
 * 3. Server optionally revokes token on GitHub's side
 * 4. Future API requests will not use revoked token
 * 
 * Security:
 * - Verifies Firebase auth token (verifyRequestUid)
 * - Only user can revoke their own token
 * 
 * Response:
 * { success: true } | { error: string }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const tokenRef = adminDb().collection("github_tokens").doc(uid);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return NextResponse.json({ error: "no_token_found" }, { status: 404 });
    }

    // Mark token as revoked (soft delete)
    await tokenRef.update({
      revokedAt: FieldValue.serverTimestamp(),
    });

    // Optional: Revoke token on GitHub's side
    // This requires GitHub App client_id + client_secret
    // For now, we just mark it as revoked locally
    // Future implementation can call:
    // DELETE https://api.github.com/applications/{client_id}/token
    // with basic auth (client_id:client_secret) and body { access_token }
    
    // Attempt to revoke on GitHub (best-effort, don't fail if this fails)
    try {
      const token = await getGithubToken(uid);
      if (token && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        const basicAuth = Buffer.from(
          `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
        ).toString('base64');
        
        await fetch('https://api.github.com/applications/{client_id}/token', {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: token }),
        });
      }
    } catch (err) {
      // Best-effort revocation on GitHub side
      // If it fails, local revocation is still effective
      console.warn('[github/oauth/revoke] Failed to revoke on GitHub:', err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[github/oauth/revoke] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
