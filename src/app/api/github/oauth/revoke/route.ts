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
 * 2. Server attempts to revoke token on GitHub's side (DELETE /applications/{client_id}/token)
 * 3. If GitHub revocation succeeds (204 or 404), delete encrypted data from Firestore
 * 4. Mark token as revoked in Firestore (always, even if GitHub fails)
 * 5. Return success status and whether GitHub revocation succeeded
 * 
 * Security:
 * - Verifies Firebase auth token (verifyRequestUid)
 * - Only user can revoke their own token
 * - Deletes encrypted data only after confirmed GitHub revocation
 * - Logs only HTTP status codes (not error messages with potential secrets)
 * 
 * Response:
 * { success: true, githubRevoked: boolean } | { error: string }
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

    // Attempt to revoke on GitHub (best-effort, but we track success)
    let githubRevoked = false;
    try {
      const token = await getGithubToken(uid);
      if (token && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        const basicAuth = Buffer.from(
          `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
        ).toString('base64');
        
        const response = await fetch(`https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: token }),
        });

        // 204 = successfully revoked, 404 = already revoked (both OK)
        if (response.status === 204 || response.status === 404) {
          githubRevoked = true;
          console.log('[github/oauth/revoke] GitHub revocation successful:', {
            status: response.status,
            uid,
          });
        } else {
          console.warn('[github/oauth/revoke] GitHub revocation failed:', {
            status: response.status,
            uid,
          });
        }
      }
    } catch {
      // Network or fetch error
      console.warn('[github/oauth/revoke] GitHub revocation error:', {
        status: 'network_error',
        uid,
      });
    }

    // Mark token as revoked (always, even if GitHub revocation failed)
    const updates: Record<string, unknown> = {
      revokedAt: FieldValue.serverTimestamp(),
    };

    // Only delete encrypted data if GitHub revocation succeeded
    if (githubRevoked) {
      updates.encryptedToken = FieldValue.delete();
      updates.iv = FieldValue.delete();
      updates.authTag = FieldValue.delete();
    }

    await tokenRef.update(updates);

    return NextResponse.json({ success: true, githubRevoked });
  } catch {
    console.error("[github/oauth/revoke] error:", {
      status: 'server_error',
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
