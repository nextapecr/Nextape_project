'use client';

import { 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  User,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  linkWithPopup,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { auth } from "./client";

export const signOut = () => firebaseSignOut(auth);
export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInWithGithub = () => signInWithPopup(auth, new GithubAuthProvider());

/**
 * Vincula GitHub a la cuenta con sesión iniciada. Es lo que permite al servidor comprobar que la cuenta
 * de GitHub analizada es del usuario (`identity.verified`). Si ya estaba vinculada no abre popup.
 * Devuelve el usuario de GitHub cuando Firebase lo informa.
 */
export async function linkGithubAccount(): Promise<{ username: string | null; alreadyLinked: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error("unauthenticated");
  if (user.providerData.some((p) => p.providerId === "github.com")) {
    return { username: null, alreadyLinked: true };
  }
  const credential = await linkWithPopup(user, new GithubAuthProvider());
  return { username: getAdditionalUserInfo(credential)?.username ?? null, alreadyLinked: false };
}

/**
 * Connect GitHub with OAuth (Phase 2).
 * Triggers OAuth flow, captures token, and stores it on server.
 * 
 * Scopes requested: user:email, public_repo, repo
 * 
 * @returns GitHub username from OAuth profile
 * @throws Error if popup is closed or OAuth fails
 */
export async function connectGithubOAuth(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("unauthenticated");

  // Configure GitHub provider with required scopes
  const provider = new GithubAuthProvider();
  provider.addScope("user:email");
  provider.addScope("public_repo");
  provider.addScope("repo"); // For future private repo support (Phase 4)

  // Trigger OAuth popup
  const result = await signInWithPopup(auth, provider);
  
  // Extract OAuth token from credential
  const credential = GithubAuthProvider.credentialFromResult(result);
  if (!credential || !credential.accessToken) {
    throw new Error("no_access_token");
  }

  const additionalInfo = getAdditionalUserInfo(result);
  const githubUsername = additionalInfo?.username;
  const githubUserId = result.user.providerData.find(p => p.providerId === "github.com")?.uid;

  if (!githubUsername || !githubUserId) {
    throw new Error("incomplete_profile");
  }

  // Store encrypted token on server
  const { apiPost } = await import("@/lib/api");
  await apiPost("/api/github/oauth/callback", {
    accessToken: credential.accessToken,
    githubUserId: parseInt(githubUserId, 10),
    githubUsername,
    scopes: ["user:email", "public_repo", "repo"],
  });

  return githubUsername;
}

export { signInWithEmailAndPassword, createUserWithEmailAndPassword };

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
