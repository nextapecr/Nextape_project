import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { classifyRevocation, shouldDeleteEncryptedToken, type RevokeOutcome } from "@/lib/server/github-revoke";

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
 * { success: true, githubRevoked: boolean, reason: "other_app" | "temporary" | null } | { error: string }
 */

export async function POST(req: NextRequest) {
  /**
   * GitHub OAuth token revocation endpoints.
   * Can be changed to /grant to revoke all tokens for this authorization.
   */
  const GITHUB_REVOKE_ENDPOINT = 'token'; // 'token' = single token, 'grant' = all tokens
  
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

    const tokenData = tokenDoc.data();
    if (!tokenData) {
      return NextResponse.json({ error: "invalid_token_data" }, { status: 500 });
    }
    
    // Decrypt token directly (don't use getGithubToken which checks revokedAt)
    // This allows retries after marking as revoked
    let token: string | null = null;
    try {
      const { decryptToken } = await import('@/lib/server/token-encryption');
      token = decryptToken(
        tokenData.encryptedToken,
        tokenData.iv,
        tokenData.authTag
      );
    } catch {
      console.error('[github/oauth/revoke] Failed to decrypt token:', {
        status: 'decryption_error',
        uid,
      });
    }

    // Attempt to revoke on GitHub (best-effort, but we track success)
    const { githubRevoked, reason } = token
      ? await revokeOnGithub(token, uid, GITHUB_REVOKE_ENDPOINT)
      : { githubRevoked: false, reason: null };

    // Mark token as revoked (always, even if GitHub revocation failed)
    const updates: Record<string, unknown> = {
      revokedAt: FieldValue.serverTimestamp(),
    };

    // Only delete encrypted data if GitHub revocation succeeded
    if (shouldDeleteEncryptedToken({ githubRevoked, reason })) {
      updates.encryptedToken = FieldValue.delete();
      updates.iv = FieldValue.delete();
      updates.authTag = FieldValue.delete();
    }

    await tokenRef.update(updates);

    return NextResponse.json({ success: true, githubRevoked, reason });
  } catch {
    console.error("[github/oauth/revoke] error:", {
      status: 'server_error',
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/** Pide a GitHub que revoque el token (check + DELETE). Solo registra códigos HTTP, nunca el token. */
async function revokeOnGithub(token: string, uid: string, endpoint: string): Promise<RevokeOutcome> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { githubRevoked: false, reason: null };

  const url = `https://api.github.com/applications/${clientId}/${endpoint}`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const init = (method: "POST" | "DELETE"): RequestInit => ({
    method,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: token }),
  });

  // Error de red → "network_error": `classifyRevocation` lo trata como temporal.
  const statusOf = (method: "POST" | "DELETE") =>
    fetch(url, init(method)).then(
      (res) => res.status,
      () => "network_error" as const,
    );

  // El check distingue "token de nuestra app" (200) de "otra app o ya revocado" (404).
  const checkStatus = await statusOf("POST");
  const checkOk = typeof checkStatus === "number" && checkStatus >= 200 && checkStatus < 300;
  const deleteStatus = checkOk ? await statusOf("DELETE") : undefined;

  const outcome = classifyRevocation(checkStatus, deleteStatus);
  const log = outcome.githubRevoked ? console.log : console.warn;
  log("[github/oauth/revoke] GitHub revocation:", { checkStatus, deleteStatus, reason: outcome.reason, uid });
  return outcome;
}
