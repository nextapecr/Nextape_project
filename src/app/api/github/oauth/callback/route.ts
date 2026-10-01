import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { encryptToken } from "@/lib/server/token-encryption";
import type { GithubToken } from "@/types/github.types";

export const runtime = "nodejs";

/**
 * POST /api/github/oauth/callback
 * 
 * Stores encrypted GitHub OAuth token for authenticated user.
 * 
 * Flow:
 * 1. Client obtains OAuth code from GitHub (via Firebase popup)
 * 2. Client exchanges code for access token (Firebase handles this)
 * 3. Client sends access token + user info to this endpoint
 * 4. Server encrypts token with AES-256-GCM
 * 5. Server stores in github_tokens/{uid}
 * 
 * Security:
 * - Verifies Firebase auth token (verifyRequestUid)
 * - Encrypts token before storage (never stored plaintext)
 * - Server-only collection (client cannot read/write)
 * 
 * Body:
 * {
 *   accessToken: string,      // GitHub OAuth access token
 *   githubUserId: number,     // GitHub numeric ID
 *   githubUsername: string,   // GitHub login
 *   scopes: string[]          // Granted scopes ["user:email", "public_repo"]
 * }
 * 
 * Response:
 * { success: true } | { error: string }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const githubUserId = typeof body?.githubUserId === "number" ? body.githubUserId : 0;
  const githubUsername = typeof body?.githubUsername === "string" ? body.githubUsername.trim() : "";
  const scopes = Array.isArray(body?.scopes) ? body.scopes : [];

  // Validate input
  if (!accessToken) {
    return NextResponse.json({ error: "missing_access_token" }, { status: 400 });
  }
  if (!githubUserId || githubUserId <= 0) {
    return NextResponse.json({ error: "invalid_github_user_id" }, { status: 400 });
  }
  if (!githubUsername) {
    return NextResponse.json({ error: "missing_github_username" }, { status: 400 });
  }

  try {
    // Encrypt token with AES-256-GCM
    const encrypted = encryptToken(accessToken);

    // Store encrypted token in Firestore
    const tokenRef = adminDb().collection("github_tokens").doc(uid);
    
    const tokenData: GithubToken = {
      uid,
      encryptedToken: encrypted.encryptedToken,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      githubUserId,
      githubUsername,
      scopes,
      createdAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
      lastUsedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
      revokedAt: null,
    };

    await tokenRef.set(tokenData);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[github/oauth/callback] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    
    // Don't expose encryption details to client
    if (message.includes("TOKEN_ENCRYPTION_KEY")) {
      return NextResponse.json({ error: "server_configuration_error" }, { status: 500 });
    }
    
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
