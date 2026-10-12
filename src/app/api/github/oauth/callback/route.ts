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
 * 3. Client sends access token to this endpoint
 * 4. Server validates token against GitHub API (GET /user)
 * 5. Server derives id, login, and scopes from GitHub response
 * 6. Server verifies GitHub ID matches Firebase provider data
 * 7. Server encrypts token with AES-256-GCM
 * 8. Server stores in github_tokens/{uid}
 * 
 * Security:
 * - Verifies Firebase auth token (verifyRequestUid)
 * - Validates token against GitHub API (not trusting client data)
 * - Verifies GitHub ID matches Firebase provider
 * - Encrypts token before storage (never stored plaintext)
 * - Server-only collection (client cannot read/write)
 * 
 * Body:
 * {
 *   accessToken: string,      // GitHub OAuth access token from Firebase
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

  // Validate input
  if (!accessToken) {
    return NextResponse.json({ error: "missing_access_token" }, { status: 400 });
  }

  try {
    // Phase: Token Hardening - Validate token against GitHub API
    // Call GET https://api.github.com/user to derive id, login, and scopes from server
    const githubUserResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "NEXTAPE-OAuth",
      },
    });

    if (!githubUserResponse.ok) {
      console.error("[github/oauth/callback] GitHub API validation failed:", {
        status: githubUserResponse.status,
      });
      return NextResponse.json(
        { error: "github_token_invalid", message: "GitHub rejected the token" },
        { status: 403 }
      );
    }

    const githubUser = await githubUserResponse.json();
    const githubUserId = typeof githubUser.id === "number" ? githubUser.id : 0;
    const githubUsername = typeof githubUser.login === "string" ? githubUser.login.trim() : "";
    
    // Extract scopes from X-OAuth-Scopes header (comma-separated list)
    const scopesHeader = githubUserResponse.headers.get("X-OAuth-Scopes") || "";
    const scopes = scopesHeader
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!githubUserId || !githubUsername) {
      return NextResponse.json({ error: "incomplete_github_profile" }, { status: 400 });
    }

    // Phase: Token Hardening - Verify GitHub ID matches Firebase provider data
    const { adminAuth } = await import("@/lib/firebase/admin");
    const userRecord = await adminAuth().getUser(uid);
    const githubProvider = userRecord.providerData.find((p) => p.providerId === "github.com");
    
    if (githubProvider) {
      // Provider exists: verify numeric ID matches
      const firebaseGithubId = githubProvider.uid; // This is the numeric GitHub ID as string
      if (firebaseGithubId !== String(githubUserId)) {
        console.error("[github/oauth/callback] GitHub ID mismatch:", {
          status: 403,
          firebaseId: firebaseGithubId,
          githubId: String(githubUserId),
        });
        return NextResponse.json(
          { error: "github_id_mismatch", message: "Token does not match your linked GitHub account" },
          { status: 403 }
        );
      }
    }
    // If no GitHub provider linked, we allow connection (first-time link)

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
