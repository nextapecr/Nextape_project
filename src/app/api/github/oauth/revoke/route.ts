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
 * 2. Server checks if token belongs to our app (POST /applications/{client_id}/token)
 * 3. If token is valid and ours, revoke it (DELETE /applications/{client_id}/token)
 * 4. If revocation succeeds (204), delete encrypted data from Firestore
 * 5. If check returns 404, cannot confirm ownership → keep encrypted data
 * 6. Mark token as revoked in Firestore (always, even if GitHub fails)
 * 7. Return success status and whether GitHub revocation succeeded
 * 
 * Security:
 * - Verifies Firebase auth token (verifyRequestUid)
 * - Only user can revoke their own token
 * - Uses POST /token to verify token belongs to our app before DELETE
 * - 404 on check may mean "different app" or "already revoked" → conservative
 * - Deletes encrypted data only after confirmed 204 from DELETE
 * - Logs only HTTP status codes (not error messages with potential secrets)
 * 
 * Source: https://docs.github.com/en/rest/apps/oauth-applications#check-a-token
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
        
        // First, check if token belongs to our app (POST /applications/{client_id}/token)
        // This distinguishes "already revoked by us" (404) from "token from another app" (404)
        const checkResponse = await fetch(`https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: token }),
        });

        if (checkResponse.status === 404) {
          // Token doesn't belong to our app (different app or already revoked)
          // Cannot confirm it's safe to delete encrypted data
          console.warn('[github/oauth/revoke] Token check returned 404 (not our app or already revoked):', {
            status: 404,
            uid,
          });
        } else if (checkResponse.ok) {
          // Token belongs to our app and is valid, proceed with revocation
          const deleteResponse = await fetch(`https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${basicAuth}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ access_token: token }),
          });

          if (deleteResponse.status === 204) {
            githubRevoked = true;
            console.log('[github/oauth/revoke] GitHub revocation successful:', {
              status: 204,
              uid,
            });
          } else {
            console.warn('[github/oauth/revoke] GitHub revocation failed:', {
              status: deleteResponse.status,
              uid,
            });
          }
        } else {
          console.warn('[github/oauth/revoke] Token check failed:', {
            status: checkResponse.status,
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
