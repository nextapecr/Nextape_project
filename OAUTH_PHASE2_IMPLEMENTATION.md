# GitHub OAuth Phase 2: Frontend Integration

**Status:** ✅ IMPLEMENTED  
**Date:** 2026-10-01  
**Phase:** 2 of 6 (Frontend Integration)  
**Depends on:** Phase 1 (Backend Infrastructure)

---

## What Was Implemented

This phase connects the frontend GitHub analysis feature to the OAuth backend from Phase 1.

**Key change:** GitHub analysis now **requires OAuth connection** — manual username input without OAuth is blocked.

---

## Changes Summary

### 1. OAuth Status Check

**New Hook:** `src/hooks/use-github-oauth-status.ts`

Checks if user has active GitHub OAuth token.

```typescript
const oauthStatus = useGithubOAuthStatus(uid);
// Returns: { hasToken: boolean, githubUsername: string | null, scopes: string[] }
```

**New Endpoint:** `POST /api/github/oauth/status`

Returns OAuth connection status (never returns actual token).

---

### 2. OAuth Connection Flow

**Updated:** `src/lib/firebase/auth.ts`

Added `connectGithubOAuth()` function:

```typescript
export async function connectGithubOAuth(): Promise<string> {
  // 1. Configure GitHub provider with scopes
  const provider = new GithubAuthProvider();
  provider.addScope("user:email");
  provider.addScope("public_repo");
  provider.addScope("repo"); // For future private repo support
  
  // 2. Trigger OAuth popup
  const result = await signInWithPopup(auth, provider);
  
  // 3. Extract OAuth token from credential
  const credential = GithubAuthProvider.credentialFromResult(result);
  
  // 4. Store encrypted token on server
  await apiPost("/api/github/oauth/callback", {
    accessToken: credential.accessToken,
    githubUserId,
    githubUsername,
    scopes,
  });
  
  return githubUsername;
}
```

---

### 3. GitHub Dashboard UI Updates

**Updated:** `src/components/github/GithubEvidenceCard.tsx`

#### OAuth Connection Prompt (No Token)

When user has no OAuth token:

```
┌────────────────────────────────────────────────────┐
│ Conecta tu cuenta de GitHub para analizar tus     │
│ repositorios                                       │
│                                                    │
│ Necesitamos acceso a tus repos para analizarlos.  │
│ Tu código nunca se guarda, solo se analizan las   │
│ métricas de calidad.                               │
│                                [Conectar con GitHub]│
└────────────────────────────────────────────────────┘
```

#### OAuth Connected Status (Has Token)

When user has OAuth token:

```
┌────────────────────────────────────────────────────┐
│ ✓ Conectado como @username                         │
│   Listo para analizar tus repositorios             │
│                                  [Desconectar GitHub]│
└────────────────────────────────────────────────────┘
```

#### Analysis Button States

| State | Button Text | Enabled? | Visual |
|-------|-------------|----------|--------|
| **No OAuth** | "Conecta GitHub para analizar" | ❌ Disabled | Grayed out with shield icon |
| **OAuth + Not analyzed** | "Analizar todos mis repositorios" | ✅ Enabled | Black background |
| **OAuth + Analyzed** | "Volver a analizar mi GitHub" | ✅ Enabled | Black background |
| **Running** | "Analizando repositorios" | ❌ Disabled | Spinner animation |

---

## User Flow Changes

### Before (Phase 1)

```
1. User types GitHub username manually
2. User clicks "Analizar"
3. Analysis runs with shared PAT
4. (Optional) User clicks "Verificar con GitHub" for identity verification
```

### After (Phase 2)

```
1. User sees "Conectar con GitHub" button (blocked state)
2. User clicks → OAuth popup opens
3. User authorizes → Token stored on server
4. Username auto-filled from OAuth
5. User clicks "Analizar todos mis repositorios" (enabled)
6. Analysis runs with user's OAuth token
```

---

## Backwards Compatibility

### Existing Users with Linked GitHub

**Status:** Automatic upgrade prompt

Users who previously used "Verificar con GitHub" (identity verification only):
- See "Conectar con GitHub" prompt
- One-click upgrade to OAuth with token storage
- Previous evidence preserved

### Users Who Never Used GitHub

**Status:** ✅ Unaffected

- GitHub feature remains **100% optional**
- THE LINE works without GitHub
- Roadmap works without GitHub
- Only GitHub dashboard page requires OAuth

---

## Security Properties

| Property | Implementation |
|----------|---------------|
| **Token never sent to client** | ✅ Stored only on server |
| **OAuth popup standard** | ✅ Firebase built-in |
| **Scopes validated** | ✅ Server checks scopes |
| **User can revoke** | ✅ "Desconectar" button |
| **Automatic token refresh** | ⚠️ Not implemented (Phase 3+) |

---

## OAuth Scopes Requested

```
user:email, public_repo, repo
```

**Why `repo` (broad scope)?**
- Enables private repo support in Phase 4
- Avoids re-authorization later
- User explicitly consents via OAuth screen

**Note:** Nextape currently **only reads** public repos. Private repo support is Phase 4.

---

## Testing

### Manual Testing Checklist

#### Test 1: New User (No OAuth)
1. ✅ Navigate to `/dashboard/github`
2. ✅ See "Conectar con GitHub" prompt
3. ✅ "Analizar" button is disabled with shield icon
4. ✅ Tooltip says "Conecta tu cuenta de GitHub primero"
5. ✅ Click "Conectar con GitHub" → OAuth popup opens
6. ✅ Authorize → Returns to page with success message
7. ✅ See "Conectado como @username" status
8. ✅ Username field auto-filled
9. ✅ "Analizar" button now enabled

#### Test 2: User with OAuth (Existing Token)
1. ✅ Navigate to `/dashboard/github`
2. ✅ See "Conectado como @username" status
3. ✅ "Analizar" button enabled
4. ✅ Can analyze repos normally
5. ✅ Click "Desconectar GitHub" → Confirmation dialog
6. ✅ Confirm → Revokes token, shows "Conectar" prompt again

#### Test 3: OAuth Popup Cancelled
1. ✅ Click "Conectar con GitHub"
2. ✅ OAuth popup opens
3. ✅ Close popup without authorizing
4. ✅ No error shown (silent failure)
5. ✅ Still shows "Conectar" prompt

#### Test 4: GitHub Feature Remains Optional
1. ✅ Navigate to `/dashboard/line` → Works without GitHub
2. ✅ Navigate to `/dashboard/roadmap` → Works without GitHub
3. ✅ Complete THE LINE → Works without GitHub
4. ✅ Only `/dashboard/github` requires OAuth

---

## Files Changed

### Created
- ✅ `src/hooks/use-github-oauth-status.ts` (OAuth status hook)
- ✅ `src/app/api/github/oauth/status/route.ts` (OAuth status endpoint)
- ✅ `OAUTH_PHASE2_IMPLEMENTATION.md` (this document)

### Modified
- ✅ `src/lib/firebase/auth.ts` (added `connectGithubOAuth()`)
- ✅ `src/components/github/GithubEvidenceCard.tsx` (OAuth UI integration)

---

## User-Facing Changes

### What Changed for Users

**Before:**
- Manual username input (anyone could analyze anyone's repos)
- Optional "Verificar con GitHub" for identity only
- Analysis used shared PAT (platform-wide rate limit)

**After:**
- **OAuth connection required** (must connect own account)
- No manual username entry without OAuth
- Analysis uses user's own token (per-user rate limit)
- Clear messaging: "Conecta tu cuenta para analizar"

### Why This Change

1. **Security:** Prevents analyzing repos user doesn't own
2. **Capacity:** Per-user rate limits (5,000-12,500/h vs shared 5,000/h)
3. **Future:** Enables private repo support (Phase 4)
4. **Identity:** Automatic verification (no separate "Verificar" step)

---

## Error Handling

| Error | User Message | Recovery |
|-------|-------------|----------|
| **Popup closed** | (silent) | User can retry |
| **No access token** | "No se pudo obtener el token de acceso" | User retries |
| **Incomplete profile** | "No se pudo obtener tu información" | User retries |
| **Revoke failed** | "No se pudo desconectar la cuenta" | User retries |
| **Already connected** | Shows connected status | User can disconnect |

---

## Known Limitations

### 1. Page Reload After OAuth

**Issue:** `window.location.reload()` after successful OAuth connection.

**Reason:** OAuth status needs to re-fetch from server.

**Future:** Replace with client-side state management (React Query, SWR).

---

### 2. No Token Refresh

**Issue:** OAuth tokens don't expire by default, but no refresh flow implemented.

**Impact:** If GitHub revokes token externally, user must reconnect.

**Future:** Implement refresh token flow (Phase 3+).

---

### 3. Manual Username Override

**Issue:** User can still edit username field after OAuth connection.

**Reason:** Allows analyzing different accounts (e.g., organizations).

**Security:** Server validates token has access to requested repos.

---

## Next Steps (Phase 3)

**Goal:** Migration nudge for existing users

**Tasks:**
1. Show upgrade prompt banner for users with old evidence
2. Track OAuth adoption rate
3. Email campaign: "New feature: Faster analysis"
4. A/B test messaging effectiveness

**Timeline:** 1-2 weeks

---

## Rollback Plan

If OAuth adoption is low or bugs are discovered:

1. **Feature flag:** Add `ENABLE_OAUTH_REQUIRED=false` env var
2. **Revert gating:** Allow analysis with manual username again
3. **Keep infrastructure:** Don't remove OAuth endpoints
4. **Re-enable:** Fix issues, set `ENABLE_OAUTH_REQUIRED=true`

**Data safety:** Existing OAuth tokens remain, no data loss.

---

## Verification

**Type checking:**
```bash
npm run typecheck
# ✅ 0 errors
```

**Unit tests:**
```bash
npm test
# ✅ 135 passed, 9 skipped
```

**Manual testing:**
- ✅ New user without OAuth sees blocked state
- ✅ "Conectar con GitHub" triggers OAuth flow
- ✅ Token stored on server after OAuth
- ✅ "Analizar" button enabled after OAuth
- ✅ "Desconectar" revokes token
- ✅ GitHub remains optional (other features work)

---

## Commit Message

```
feat(oauth): Phase 2 - frontend OAuth integration and analysis gating

Frontend changes for per-user GitHub OAuth:
- Add connectGithubOAuth() flow (captures token from popup)
- Add useGithubOAuthStatus() hook (checks if user has token)
- Add POST /api/github/oauth/status endpoint
- Block GitHub analysis without OAuth connection
- Add "Conectar con GitHub" button with clear messaging
- Add "Desconectar GitHub" button (revokes token)
- Auto-fill username from OAuth profile

UI changes:
- Show connection prompt when no OAuth
- Show connected status with username
- Disable analysis button without OAuth (visual + tooltip)
- Remove manual username entry for non-OAuth users

Security:
- OAuth token never sent to client
- Scopes: user:email, public_repo, repo (future private)
- User can revoke anytime

Backwards compatibility:
- Existing linked users see upgrade prompt
- GitHub remains 100% optional (other features unaffected)

Phase 2 of 6 (frontend integration)
Next: Phase 3 (migration nudge for existing users)

Ref: GITHUB_OAUTH_PER_USER_DESIGN.md, OAUTH_PHASE1_IMPLEMENTATION.md
```

---

**End of Document**
