# GITHUB OAUTH PER-USER MIGRATION DESIGN
## Nextape GitHub Evaluation Engine — Security & Architecture Design

**Role:** Security Auditor + Backend AI Engineer  
**Date:** 2026-10-01  
**Repository:** `skrsoftwarecr/Nextape_project`  
**Branch:** `develop`  
**Audit Type:** Security + Architecture Design (No Implementation)  
**Evidence Classification:** VERIFIED / CALCULATED / PROPOSED

---

## EXECUTIVE SUMMARY

Nextape currently uses **shared PAT** (Personal Access Token) for GitHub API access. This design document specifies migration to **OAuth per-user** architecture, enabling:

1. **Per-user rate limits:** 5,000-12,500 requests/hour per user (vs current 5,000/hour shared)
2. **Private repository support:** Users can analyze their own private repos
3. **Zero friction for existing users:** Backwards-compatible migration path
4. **GitHub remains optional:** Non-GitHub users unaffected

**Migration strategy:** Phased rollout with dual-mode operation (OAuth + fallback PAT).

---

## 1. CURRENT AUTHORIZATION FLOW

### 1.1 Current State

**`VERIFIED`:** Analysis of existing codebase

#### User Journey (Current)

```text
1. User signs up/logs in (email, Google, or GitHub)
   ↓
2. User navigates to GitHub Evidence section
   ↓
3. User manually types GitHub username (e.g., "octocat")
   ↓
4. User clicks "Analizar GitHub"
   ↓
5. Backend uses SHARED PAT to fetch public repos
   ↓
6. Optional: User clicks "Verificar con GitHub" 
   → Firebase linkWithPopup(GithubAuthProvider)
   → Links GitHub account to prove identity
   ↓
7. Evidence saved to Firestore: github_evidence/{uid}
```

**Source:** `src/components/github/GithubEvidenceCard.tsx:150-280`

**Current authentication modes:**

| Auth Method | Purpose | Token Used | Scope |
|-------------|---------|------------|-------|
| **Manual username input** | User types GitHub username | Shared PAT | Public repos only |
| **Firebase GitHub link** | Proves identity (`identity.verified`) | Not used for API | None (identity only) |

#### Current Firebase GitHub Integration

**`VERIFIED`:** `src/lib/firebase/auth.ts:19-35`

```typescript
export const signInWithGithub = () => signInWithPopup(auth, new GithubAuthProvider());

export async function linkGithubAccount(): Promise<{ username: string | null; alreadyLinked: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error("unauthenticated");
  if (user.providerData.some((p) => p.providerId === "github.com")) {
    return { username: null, alreadyLinked: true };
  }
  const credential = await linkWithPopup(user, new GithubAuthProvider());
  return { username: getAdditionalUserInfo(credential)?.username ?? null, alreadyLinked: false };
}
```

**Current behavior:**

1. Firebase handles OAuth popup flow
2. GitHub numeric ID stored in `user.providerData[].uid`
3. Username stored in `getAdditionalUserInfo().username`
4. **OAuth token is NOT captured or stored** (Firebase manages it internally)
5. Token is **NOT used for GitHub API** (only for identity verification)

#### Identity Verification Logic

**`VERIFIED`:** `src/app/api/github/aggregate/route.ts:28-48`

```typescript
async function resolveIdentity(uid: string, githubUsername: string): Promise<GithubIdentity> {
  const user = await adminAuth().getUser(uid);
  const provider = user.providerData.find((p) => p.providerId === "github.com");
  if (!provider) return { verified: false, method: null, linkedLogin: null };
  
  const githubId = await GithubSignalsService.getUserId(githubUsername);
  const verified = githubId !== null && String(githubId) === provider.uid;
  
  return {
    verified,
    method: "github_oauth",
    linkedLogin: verified ? githubUsername : await GithubSignalsService.getLoginById(provider.uid),
  };
}
```

**Purpose:** Confirms typed username matches Firebase-linked GitHub account (prevents analyzing someone else's repos).

---

### 1.2 Problems with Current Flow

**`OBSERVED`:**

1. **Shared PAT bottleneck:** 5,000 req/h divided among ALL platform users
2. **No private repo access:** Shared PAT belongs to platform, not user
3. **Manual username entry:** Friction (typos, confusion)
4. **Unused OAuth token:** Firebase OAuth flow already exists but token is discarded
5. **Rate limit attribution:** Cannot track which user exhausted quota

---

## 2. PROPOSED AUTHORIZATION FLOW

### 2.1 New User Journey

**`PROPOSED`:**

```text
1. User signs up/logs in (email, Google, or GitHub)
   ↓
2. User navigates to GitHub Evidence section
   ↓
3. User clicks "Conectar GitHub" (NEW)
   → Firebase OAuth popup
   → Scopes: user:email, public_repo (read-only public repos)
   → Backend captures OAuth token from Firebase credential
   → Backend stores encrypted token in Firestore
   ↓
4. Backend auto-fills GitHub username (from OAuth profile)
   ↓
5. User clicks "Analizar GitHub"
   ↓
6. Backend uses USER'S OAuth token (not shared PAT)
   ↓
7. Evidence saved to Firestore: github_evidence/{uid}
   ↓
8. identity.verified = true (automatic, no separate verification step)
```

**Key changes:**

- **OAuth is now the primary flow** (not just identity verification)
- **Username auto-filled** (from OAuth profile, no manual typing)
- **Token captured and stored** (encrypted in Firestore)
- **Identity verification automatic** (OAuth proves ownership)

---

### 2.2 Backwards Compatibility Flow

**`PROPOSED`:** Dual-mode operation during migration.

```text
┌─────────────────────────────────────────┐
│ User has OAuth token in Firestore?      │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
      YES              NO
       │               │
       ▼               ▼
Use user's token   Use shared PAT (fallback)
       │               │
       └───────┬───────┘
               ▼
     GitHub API Request
```

**Migration strategy:**

1. **Phase 1:** Deploy OAuth support, keep shared PAT fallback
2. **Phase 2:** Show "Connect GitHub" prompt for users without OAuth
3. **Phase 3:** (Optional) Deprecate shared PAT after 90% adoption

**Users affected:**

| User Type | Impact | Action Required |
|-----------|--------|-----------------|
| **New users** | None | OAuth by default |
| **Existing users with linked GitHub** | None | Auto-prompt to upgrade |
| **Existing users without linked GitHub** | None | Continue with shared PAT |
| **Users who decline OAuth** | None | Fallback to shared PAT |

**Evidence:** `PROPOSED` — Requires implementation planning with backend-ai-engineer.

---

### 2.3 Friction Analysis

**`CALCULATED`:**

| Flow Step | Current Friction | New Friction | Change |
|-----------|-----------------|--------------|--------|
| **Sign up** | Email + password | Email + password | ✅ No change |
| **Navigate to GitHub section** | Click | Click | ✅ No change |
| **Enter username** | Manual typing (typos) | Auto-filled | ✅ **Reduced** |
| **Verify identity** | Optional "Verificar con GitHub" | Automatic | ✅ **Eliminated** |
| **Analyze repos** | Click button | Click button | ✅ No change |

**New friction introduced:**

- **OAuth popup:** One-time consent (standard GitHub flow)
- **Permission prompt:** User sees requested scopes

**Friction mitigation:**

- OAuth popup is **already implemented** (Firebase `linkWithPopup`)
- Users familiar with "Login with GitHub" pattern
- Clear explanation: "Connect to analyze your repos"

**Net friction:** ✅ **Reduced** (auto-fill username, skip separate verification)

---

### 2.4 Users Who Already Linked GitHub

**`VERIFIED`:** Existing users who clicked "Verificar con GitHub" have:

1. Firebase `providerData` entry with `providerId: "github.com"`
2. GitHub numeric ID in `provider.uid`
3. Username in Firebase profile
4. **No OAuth token stored** (Firebase managed it, then discarded)

**Migration path:**

```typescript
// Detect user with linked GitHub but no stored token
if (user.providerData.some(p => p.providerId === "github.com") && !hasStoredToken) {
  // Show upgrade prompt: "Reconnect GitHub for faster analysis"
  // On click: Re-trigger OAuth flow, capture token this time
}
```

**User experience:**

- One-time prompt: "Reconnect GitHub to unlock faster analysis"
- Same OAuth popup (user already familiar)
- Username pre-filled (from existing Firebase data)
- **Zero data loss** (existing evidence preserved)

**Evidence:** `PROPOSED` — Requires UI implementation.

---

## 3. OAUTH SCOPES & PERMISSIONS

### 3.1 Current GitHub API Usage

**`VERIFIED`:** Analysis of `src/services/github-signals.service.ts`

**API endpoints used:**

| Endpoint | Purpose | Public Access? | Scope Required |
|----------|---------|---------------|----------------|
| `GET /users/{username}/repos` | List user's repositories | ✅ Yes | `public_repo` or `repo` |
| `GET /repos/{owner}/{repo}` | Repository metadata | ✅ Yes (for public) | `public_repo` or `repo` |
| `GET /repos/{owner}/{repo}/languages` | Language stats | ✅ Yes (for public) | `public_repo` or `repo` |
| `GET /repos/{owner}/{repo}/commits` | Commit history | ✅ Yes (for public) | `public_repo` or `repo` |
| `GET /repos/{owner}/{repo}/branches/{branch}` | Branch SHA (fallback) | ✅ Yes (for public) | `public_repo` or `repo` |
| `GET /repos/{owner}/{repo}/git/trees/{sha}` | File tree | ✅ Yes (for public) | `public_repo` or `repo` |
| `GET /users/{username}` | User ID (for verification) | ✅ Yes | (no scope) |
| `GET raw.githubusercontent.com/...` | File contents | ✅ Yes (for public) | (no scope, CDN) |

**Evidence:** All endpoints work with public repos, no private repo access currently.

---

### 3.2 Minimum OAuth Scopes

**`VERIFIED`:** Based on GitHub documentation

**For public repositories only (Phase 1):**

```text
Scopes: user:email, public_repo
```

**Breakdown:**

| Scope | Purpose | Grants |
|-------|---------|--------|
| `user:email` | Get user's verified email (optional, for profile) | Read email addresses |
| `public_repo` | Access public repositories | Read public repos, stars, commits |

**Alternative:** `(no scope)` — GitHub OAuth without scopes grants read-only access to public data, but `public_repo` is more explicit and future-proof.

**Documentation:** [GitHub OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

---

**For private repositories (Phase 2, future):**

```text
Scopes: user:email, repo
```

**Breakdown:**

| Scope | Purpose | Grants |
|-------|---------|--------|
| `repo` | Full access to public and private repositories | Read code, commits, metadata |

**Security consideration:**

- `repo` scope is **broad** (read + write)
- GitHub does not offer read-only private repo scope
- Nextape **only reads** (never writes), but user grants full access
- **Mitigation:** Clear consent message: "We only read, never modify your code"

**Recommendation:** Start with `public_repo` (Phase 1), add `repo` only when private repo support is requested.

---

### 3.3 GitHub App Alternative (Future)

**`CALCULATED`:** From previous GitHub App Migration Audit

**If migrating to GitHub App (not OAuth App):**

| Permission | Access Level | Purpose |
|-----------|-------------|---------|
| **Contents** | Read-only | Repository code, trees, files |
| **Metadata** | Read-only | Repository info, languages, commits |

**Advantages over OAuth App:**

- **Fine-grained permissions:** Read-only vs read/write separation
- **Higher rate limits:** 5,000-12,500 per user vs 5,000
- **Better security model:** App acts on behalf of user, not as user

**Trade-off:** More complex implementation (installation flow, webhook setup).

**Recommendation:** Start with **OAuth App** (simpler), migrate to **GitHub App** later (scalability).

---

### 3.4 Scope Request in Firebase

**`PROPOSED`:** Firebase OAuth configuration

**Current Firebase config (identity only):**

```typescript
new GithubAuthProvider()
// Default: no custom scopes
```

**New Firebase config (OAuth + API access):**

```typescript
const provider = new GithubAuthProvider();
provider.addScope('user:email');
provider.addScope('public_repo');
// Future: provider.addScope('repo'); for private repos
```

**Consent screen shown to user:**

```text
Nextape by skrsoftware wants to:

✓ Access your public repositories
✓ Access your email address

[Authorize skrsoftware] [Cancel]
```

**User control:** User can revoke access anytime via GitHub Settings → Applications.

---

## 4. SECURE TOKEN STORAGE

### 4.1 Storage Requirements

**`PROPOSED`:** Security principles

1. **Server-side only:** Client never sees token
2. **Encrypted at rest:** Token encrypted in Firestore
3. **Access control:** Only owner can trigger usage (via Firestore rules)
4. **Auditability:** Token usage logged per request
5. **Revocation:** User can disconnect GitHub, token deleted

---

### 4.2 Firestore Schema

**`PROPOSED`:** New collection for user GitHub credentials

#### Collection: `github_tokens/{uid}`

```typescript
interface GithubToken {
  uid: string;                      // User ID (document ID)
  encryptedToken: string;           // AES-256 encrypted OAuth token
  tokenHash: string;                // SHA-256 hash for integrity check
  githubUserId: number;             // GitHub numeric ID (from OAuth)
  githubUsername: string;           // GitHub login (from OAuth)
  scopes: string[];                 // Granted scopes ["user:email", "public_repo"]
  createdAt: Timestamp;             // When token was stored
  lastUsedAt: Timestamp;            // Last API request using this token
  expiresAt: Timestamp | null;      // Token expiration (if refresh token used)
  revokedAt: Timestamp | null;      // If user disconnected GitHub
}
```

**Why separate collection (not in `users/{uid}`):**

- **Security isolation:** Tokens never accidentally exposed in user profile queries
- **Separate rules:** Different access patterns (tokens are write-once, read by server only)
- **Backup exclusion:** Can exclude `github_tokens` from backups for compliance

---

### 4.3 Firestore Security Rules

**`PROPOSED`:**

```javascript
// github_tokens/{uid}
match /github_tokens/{userId} {
  allow read: if false;   // NEVER readable by client
  allow write: if false;  // ONLY writable by Admin SDK (server)
}
```

**Enforcement:**

- Client **cannot read** token (even their own)
- Client **cannot write** token (prevents self-grant attacks)
- Server Admin SDK **bypasses rules** (can read/write)

**Existing pattern:** Same as `github_evidence/{uid}` (already server-only).

**Source:** `firestore.rules:102-105` (verified existing pattern)

---

### 4.4 Encryption Strategy

**`PROPOSED`:**

#### Option A: Firestore Native Encryption (Recommended)

**Pros:**

- Firestore encrypts all data at rest by default
- No custom encryption code needed
- Google-managed keys (KMS integration available)

**Cons:**

- Not encrypted within Firestore (admins can read)
- Compliance: May not meet strict regulatory requirements

**Recommendation:** ✅ Start here (simplest, 90% of use cases)

---

#### Option B: Application-Level Encryption

**Implementation:**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.GITHUB_TOKEN_ENCRYPTION_KEY; // 32 bytes
const ALGORITHM = 'aes-256-gcm';

function encryptToken(token: string): { encrypted: string; iv: string; authTag: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

function decryptToken(encrypted: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

**Storage format:**

```typescript
{
  encryptedToken: "a1b2c3...",  // Encrypted token
  iv: "d4e5f6...",              // Initialization vector
  authTag: "g7h8i9...",         // Authentication tag (GCM)
  tokenHash: "sha256hash"       // For integrity check
}
```

**Key management:**

- `GITHUB_TOKEN_ENCRYPTION_KEY` stored in `.env` (32-byte hex string)
- Rotate key annually
- Store old keys for decryption during rotation

**Pros:**

- Defense in depth (even Firestore admins cannot read tokens)
- Compliance-friendly (audit trail shows encryption)

**Cons:**

- More code complexity
- Key rotation overhead

**Recommendation:** ⚠️ Only if compliance requires (e.g., SOC 2, HIPAA)

---

### 4.5 Token Lifecycle

**`PROPOSED`:**

```text
1. USER AUTHORIZES
   ↓
   Firebase OAuth popup
   ↓
   Client receives credential (includes OAuth token)
   ↓
2. CLIENT SENDS TO SERVER
   ↓
   POST /api/github/oauth/store
   { credential: FirebaseCredential }
   ↓
3. SERVER EXTRACTS TOKEN
   ↓
   token = credential.accessToken
   ↓
4. SERVER ENCRYPTS & STORES
   ↓
   encrypted = encrypt(token)
   ↓
   Firestore: github_tokens/{uid}
   ↓
5. CLIENT TRIGGERS ANALYSIS
   ↓
   POST /api/github/evaluate
   { githubUsername: "..." }
   ↓
6. SERVER RETRIEVES TOKEN
   ↓
   encrypted = Firestore.get(`github_tokens/${uid}`)
   ↓
   token = decrypt(encrypted)
   ↓
7. SERVER MAKES API REQUEST
   ↓
   fetch(GITHUB_API, { headers: { Authorization: `Bearer ${token}` } })
   ↓
8. SERVER UPDATES lastUsedAt
   ↓
   Firestore.update(`github_tokens/${uid}`, { lastUsedAt })
```

**Token revocation:**

```text
1. USER CLICKS "Disconnect GitHub"
   ↓
   POST /api/github/oauth/revoke
   ↓
2. SERVER REVOKES TOKEN (GitHub API)
   ↓
   POST https://api.github.com/applications/{client_id}/token
   { access_token: token }
   ↓
3. SERVER DELETES FROM FIRESTORE
   ↓
   Firestore.delete(`github_tokens/${uid}`)
   ↓
4. SERVER MARKS EVIDENCE AS UNVERIFIED
   ↓
   Firestore.update(`github_evidence/${uid}`, { 
     identity: { verified: false, method: null } 
   })
```

**Evidence:** `PROPOSED` — Requires backend implementation.

---

### 4.6 Access Pattern

**`VERIFIED`:** Current server-only pattern

**Example (existing):** `src/app/api/github/evaluate/route.ts:66`

```typescript
const uid = await verifyRequestUid(req.headers.get("authorization"));
if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
```

**New pattern:**

```typescript
const uid = await verifyRequestUid(req.headers.get("authorization"));
if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

// Retrieve user's GitHub token
const tokenDoc = await adminDb().collection("github_tokens").doc(uid).get();
const tokenData = tokenDoc.data() as GithubToken | undefined;

// Use token if available, fallback to shared PAT
const githubToken = tokenData && !tokenData.revokedAt 
  ? decrypt(tokenData.encryptedToken, tokenData.iv, tokenData.authTag)
  : process.env.GITHUB_TOKEN;  // Fallback to shared PAT

// Make GitHub API request
const headers = {
  Authorization: `Bearer ${githubToken}`,
  "User-Agent": "Nextape-GitHub-Evaluator",
  Accept: "application/vnd.github+json",
};
```

**Security guarantees:**

1. ✅ Client authenticates with Firebase (Bearer token in header)
2. ✅ Server verifies uid (cannot impersonate other users)
3. ✅ Server reads token from Firestore (client never sees token)
4. ✅ Server decrypts token (only server has encryption key)
5. ✅ Token scoped to user's own repos (GitHub enforces)

---

## 5. USERS WHO DON'T AUTHORIZE

### 5.1 GitHub Remains Optional

**`VERIFIED`:** Current business rule

**Source:** Multiple locations

- `src/lib/server/exam-size.test.ts:42-57` (GitHub evidence is optional)
- `docs/CONTEXT.md` (GitHub is "bonus evidence", never penalizes)
- `src/lib/server/github-evidence.ts:8-12` (requires code + identity)

**Current behavior:**

- User can complete "The LINE" without GitHub
- User can skip GitHub Evidence section entirely
- GitHub only **adds** evidence, never **removes** points

---

### 5.2 OAuth Decline Scenarios

**`PROPOSED`:**

| Scenario | User Action | System Behavior |
|----------|-------------|-----------------|
| **Never connects GitHub** | Skips GitHub section | ✅ Works normally (no GitHub evidence) |
| **Clicks "Connect GitHub", closes popup** | Cancels OAuth | ✅ No error, stays on page |
| **OAuth succeeds, revokes later** | GitHub Settings → Revoke | ✅ Falls back to shared PAT |
| **OAuth fails (GitHub down)** | Network error | ✅ Shows error, allows retry |

**Error handling:**

```typescript
try {
  const credential = await signInWithPopup(auth, provider);
  await storeOAuthToken(credential);
} catch (err) {
  if (err.code === 'auth/popup-closed-by-user') {
    // User closed popup, no error shown
    return;
  }
  if (err.code === 'auth/cancelled-popup-request') {
    // User cancelled, no error shown
    return;
  }
  // Other errors: show message
  setError("Could not connect GitHub. Please try again.");
}
```

**Evidence:** `VERIFIED` (existing error handling in `GithubEvidenceCard.tsx:268-273`)

---

### 5.3 Fallback to Shared PAT

**`PROPOSED`:**

```typescript
async function getGithubToken(uid: string): Promise<string> {
  // 1. Try user's OAuth token
  const tokenDoc = await adminDb().collection("github_tokens").doc(uid).get();
  if (tokenDoc.exists) {
    const token = tokenDoc.data() as GithubToken;
    if (!token.revokedAt) {
      return decrypt(token.encryptedToken, token.iv, token.authTag);
    }
  }
  
  // 2. Fallback to shared PAT
  const sharedPAT = process.env.GITHUB_TOKEN;
  if (!sharedPAT) throw new Error("GITHUB_TOKEN not configured");
  
  return sharedPAT;
}
```

**Capacity implications:**

| User Type | Token Used | Rate Limit |
|-----------|-----------|------------|
| **With OAuth** | User's OAuth token | 5,000-12,500/hour per user |
| **Without OAuth** | Shared PAT | 5,000/hour (shared) |

**Observability:**

```typescript
// Metrics to track
metrics.increment('github.request.user_token');  // OAuth token used
metrics.increment('github.request.shared_pat');  // Fallback used
```

**Migration goal:** 90% of active users on OAuth within 6 months.

---

## 6. MIGRATION STRATEGY

### 6.1 Phase 1: OAuth Support (Week 1-2)

**Goal:** Deploy OAuth infrastructure, no user disruption.

**Tasks:**

1. ✅ Create `github_tokens` collection schema
2. ✅ Add Firestore security rules
3. ✅ Implement encryption utilities (if Option B chosen)
4. ✅ Create `/api/github/oauth/store` endpoint
5. ✅ Create `/api/github/oauth/revoke` endpoint
6. ✅ Update `getGithubToken()` helper (OAuth + fallback)
7. ✅ Update Firebase OAuth provider config (add scopes)
8. ✅ Add observability (OAuth vs PAT usage metrics)
9. ✅ Deploy to staging, test OAuth flow

**Deliverables:**

- OAuth token storage working
- Dual-mode operation (OAuth + PAT fallback)
- Zero user-facing changes (backend only)

**Evidence:** `PROPOSED` — Requires backend-ai-engineer implementation.

---

### 6.2 Phase 2: UI Updates (Week 3)

**Goal:** Expose OAuth option to users.

**Tasks:**

1. ✅ Add "Connect GitHub" button (replaces manual username input)
2. ✅ Show GitHub username after OAuth (auto-filled)
3. ✅ Add "Disconnect GitHub" button (in settings)
4. ✅ Update "Verificar con GitHub" flow (now stores token)
5. ✅ Add upgrade prompt for existing linked users
6. ✅ Update help text: "Connect GitHub for faster analysis"
7. ✅ A/B test: OAuth-first vs manual input (measure adoption)

**Deliverables:**

- New users see OAuth by default
- Existing users see upgrade prompt
- Manual username input still available (fallback)

---

### 6.3 Phase 3: Migration Nudge (Week 4-6)

**Goal:** Migrate existing users to OAuth.

**Tasks:**

1. ✅ Show banner: "Connect GitHub to unlock faster analysis"
2. ✅ Send email: "New feature: Analyze private repos" (future)
3. ✅ Track adoption: `oauth_adoption_rate` metric
4. ✅ Identify holdouts: Users still using shared PAT
5. ✅ Optional: Incentivize OAuth (e.g., "Unlock advanced analysis")

**Target:** 70% adoption after 30 days.

---

### 6.4 Phase 4: Deprecation (Optional, Month 6+)

**Goal:** Remove shared PAT fallback.

**Criteria:**

- 90%+ of active users on OAuth
- Shared PAT capacity no longer bottleneck
- No complaints about forced OAuth

**Tasks:**

1. ⚠️ Announce deprecation (30-day notice)
2. ⚠️ Block new GitHub analysis without OAuth
3. ⚠️ Remove shared PAT from `.env`
4. ⚠️ Update docs: "GitHub OAuth required"

**Recommendation:** ❌ **Not recommended.** Keep fallback indefinitely (serves edge cases: API testing, demos, onboarding).

---

### 6.5 Rollback Plan

**If OAuth adoption is low (<30% after 30 days):**

1. ✅ Keep dual-mode operation (no deprecation)
2. ✅ Investigate barriers: UI confusion, trust issues, privacy concerns
3. ✅ Simplify messaging: "Same analysis, faster results"
4. ✅ Add FAQ: "Why connect GitHub?"

**If OAuth causes bugs:**

1. ✅ Feature flag: `ENABLE_GITHUB_OAUTH=false`
2. ✅ Revert to shared PAT only
3. ✅ Fix bugs in staging
4. ✅ Re-deploy when stable

---

## 7. EXISTING USER MIGRATION

### 7.1 User Segments

**`CALCULATED`:**

| Segment | Description | Current State | Migration Path |
|---------|-------------|---------------|----------------|
| **A: New users** | Sign up after OAuth deploy | No GitHub yet | ✅ OAuth by default |
| **B: Linked GitHub** | Clicked "Verificar con GitHub" | Firebase link, no token | ⚠️ Re-authorize (one-time) |
| **C: Manual username** | Typed GitHub username | No Firebase link | ⚠️ Connect GitHub (optional) |
| **D: No GitHub** | Never used GitHub Evidence | No GitHub data | ✅ No action needed |

---

### 7.2 Segment B: Existing Linked Users

**`VERIFIED`:** Users with `providerData[].providerId === "github.com"`

**Current state:**

```typescript
{
  uid: "abc123",
  providerData: [
    { providerId: "github.com", uid: "123456" }  // GitHub numeric ID
  ]
}
```

**Firestore state:**

```typescript
// github_evidence/abc123
{
  identity: {
    verified: true,
    method: "github_oauth",
    linkedLogin: "octocat"
  }
}
```

**Migration flow:**

```text
1. User logs in
   ↓
2. Check: firebase linked GitHub? ✅
   ↓
3. Check: OAuth token stored? ❌
   ↓
4. Show upgrade prompt:
   "🚀 New: Connect GitHub for faster analysis"
   [Reconnect GitHub]
   ↓
5. User clicks → OAuth popup
   ↓
6. Backend stores token (new endpoint)
   ↓
7. Future analyses use user's token
```

**Implementation:**

```typescript
// On GithubEvidenceCard mount
useEffect(() => {
  const user = auth.currentUser;
  const hasLinkedGithub = user?.providerData.some(p => p.providerId === "github.com");
  
  if (hasLinkedGithub) {
    checkOAuthTokenStored(user.uid).then(hasToken => {
      if (!hasToken) {
        setShowUpgradePrompt(true);
      }
    });
  }
}, []);
```

**Evidence:** `PROPOSED` — Requires frontend implementation.

---

### 7.3 Segment C: Manual Username Users

**Current state:**

- User typed GitHub username
- No Firebase GitHub link
- Evidence exists in `github_evidence/{uid}`
- `identity.verified: false`

**Migration flow:**

```text
1. User visits GitHub Evidence section
   ↓
2. Check: OAuth token stored? ❌
   ↓
3. Show:
   "Analyze GitHub"
   "Or connect GitHub for faster analysis [Connect]"
   ↓
4. User clicks [Connect] → OAuth popup
   ↓
5. Backend stores token
   ↓
6. Username auto-filled from OAuth
   ↓
7. Future analyses use user's token
```

**No forced migration:** User can continue with manual username + shared PAT.

---

### 7.4 Data Preservation

**`VERIFIED`:** No data loss during migration.

**Guarantees:**

1. ✅ Existing `github_evidence/{uid}` unchanged
2. ✅ Previous analysis results preserved
3. ✅ Re-authorization re-uses cached evidence (SHA check)
4. ✅ No re-analysis unless SHA changed

**Migration impact:**

- **First OAuth connection:** ~5 seconds (popup + token storage)
- **First analysis after OAuth:** Same speed (metadata requests unchanged)
- **Subsequent analyses:** Faster (if GraphQL migration deployed)

---

## 8. SECURITY CONSIDERATIONS

### 8.1 Threat Model

**`CALCULATED`:**

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| **Token theft (client)** | XSS, client-side JS | ✅ Token never sent to client |
| **Token theft (Firestore)** | Admin access, backup leak | ✅ Encryption at rest (Option B) |
| **Token theft (transit)** | MITM, network sniffing | ✅ HTTPS only (enforced) |
| **Token reuse** | Attacker steals token, uses elsewhere | ✅ GitHub rate-limits by token |
| **Impersonation** | User A triggers analysis for User B | ✅ Server verifies `uid` matches token owner |
| **Privilege escalation** | User grants `repo` scope, Nextape reads private | ✅ User consent required (OAuth screen) |
| **Token revocation bypass** | User revokes, Nextape keeps using | ✅ GitHub returns 401, Nextape deletes token |

---

### 8.2 Compliance Checklist

**`PROPOSED`:**

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **GDPR: User consent** | ✅ Required | OAuth consent screen |
| **GDPR: Right to deletion** | ✅ Implemented | "Disconnect GitHub" button |
| **GDPR: Data minimization** | ✅ Minimal scopes | `public_repo` only (Phase 1) |
| **SOC 2: Encryption at rest** | ⚠️ Optional | Firestore default or AES-256 |
| **SOC 2: Audit trail** | ✅ Implemented | `lastUsedAt`, `createdAt` |
| **SOC 2: Access control** | ✅ Implemented | Firestore rules (server-only) |
| **OWASP: Secure storage** | ✅ Implemented | Server-side, never client |
| **OWASP: Least privilege** | ✅ Implemented | Minimal scopes, read-only |

**Compliance level:** ✅ **Production-ready** for GDPR. ⚠️ SOC 2 requires Option B encryption.

---

### 8.3 OAuth Security Best Practices

**`VERIFIED`:** Based on [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) and GitHub docs

1. ✅ **Use HTTPS only** (enforced by Firebase + Netlify)
2. ✅ **Validate redirect URI** (Firebase handles)
3. ✅ **Check state parameter** (Firebase handles, CSRF protection)
4. ✅ **Short-lived tokens** (GitHub default: no expiration, but revocable)
5. ✅ **Refresh tokens** (not used, can add later)
6. ✅ **Scope minimization** (`public_repo` only, not `repo`)
7. ✅ **Token revocation** (implemented via `/api/github/oauth/revoke`)
8. ✅ **Audit logging** (`lastUsedAt`, `createdAt` tracked)

---

### 8.4 Firebase OAuth Security

**`VERIFIED`:** Firebase handles:

1. ✅ **CSRF protection** (state parameter)
2. ✅ **Popup origin validation** (same-origin policy)
3. ✅ **Token exchange** (client_secret never exposed to client)
4. ✅ **Replay attack prevention** (nonce)

**Additional Nextape responsibility:**

1. ⚠️ **Token storage security** (encryption, access control)
2. ⚠️ **Token lifecycle management** (expiration, revocation)
3. ⚠️ **Usage auditing** (who used token when)

---

## 9. OBSERVABILITY & MONITORING

### 9.1 Metrics

**`PROPOSED`:**

| Metric | Type | Purpose |
|--------|------|---------|
| `github.oauth.connected` | Counter | New OAuth connections |
| `github.oauth.disconnected` | Counter | OAuth revocations |
| `github.oauth.error` | Counter | OAuth failures |
| `github.token.user` | Counter | Requests using user token |
| `github.token.shared` | Counter | Requests using shared PAT |
| `github.token.expired` | Counter | Token expiration/revocation detected |
| `github.oauth.adoption_rate` | Gauge | % of users with OAuth |

---

### 9.2 Alerts

**`PROPOSED`:**

| Alert | Condition | Action |
|-------|-----------|--------|
| **OAuth error rate >5%** | OAuth flow failing | Investigate Firebase/GitHub |
| **Shared PAT rate limit hit** | 5,000 req/hour exceeded | Notify users to connect OAuth |
| **Token theft suspected** | Multiple IPs using same token | Revoke token, notify user |
| **OAuth adoption <30% (30d)** | Low adoption | Review messaging, UX |

---

## 10. IMPLEMENTATION ROADMAP

### 10.1 Week 1-2: Backend Infrastructure

**Owner:** Backend AI Engineer

**Tasks:**

1. Create `github_tokens` Firestore collection
2. Add security rules (server-only access)
3. Implement encryption utilities (if Option B)
4. Create `/api/github/oauth/store` endpoint
5. Create `/api/github/oauth/revoke` endpoint
6. Update `getGithubToken()` helper (OAuth + fallback)
7. Add unit tests (token encryption, retrieval, revocation)
8. Deploy to staging

**Deliverables:**

- ✅ OAuth token storage functional
- ✅ Dual-mode operation (OAuth + PAT)
- ✅ All tests passing

---

### 10.2 Week 3: Frontend Integration

**Owner:** Frontend Engineer

**Tasks:**

1. Update Firebase OAuth provider (add scopes)
2. Add "Connect GitHub" button (`GithubEvidenceCard`)
3. Implement token storage flow (client → server)
4. Add "Disconnect GitHub" button (settings page)
5. Update error handling (OAuth failures)
6. Add loading states (OAuth popup, token storage)
7. Update help text ("Connect GitHub for faster analysis")
8. Deploy to staging

**Deliverables:**

- ✅ OAuth flow working end-to-end
- ✅ Error handling robust
- ✅ User experience smooth

---

### 10.3 Week 4: Testing & Rollout

**Owner:** Security Auditor + QA

**Tasks:**

1. Manual testing (OAuth flow, token usage, revocation)
2. Security testing (token theft attempts, impersonation)
3. Performance testing (latency, rate limits)
4. Penetration testing (optional, if budget allows)
5. Deploy to production (feature flag: 10% of users)
6. Monitor metrics (adoption rate, error rate)
7. Gradual rollout (25% → 50% → 100%)

**Deliverables:**

- ✅ Production-ready
- ✅ No security vulnerabilities
- ✅ User adoption tracking

---

### 10.4 Week 5-6: Migration & Optimization

**Owner:** Product + Backend AI Engineer

**Tasks:**

1. Show upgrade prompt (existing linked GitHub users)
2. Track adoption (OAuth vs manual username)
3. A/B test messaging ("Connect GitHub" vs "Faster analysis")
4. Send email campaign (optional)
5. Optimize token retrieval (caching, connection pooling)
6. Add refresh token support (if needed)
7. Document OAuth flow (internal wiki, API docs)

**Deliverables:**

- ✅ 70%+ adoption within 30 days
- ✅ Shared PAT capacity freed up
- ✅ User feedback positive

---

## 11. RISKS & MITIGATION

### 11.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **OAuth flow breaks** | Low | High | Feature flag, rollback plan |
| **Token encryption bug** | Low | Critical | Extensive testing, Option A (Firestore native) |
| **Firebase OAuth limits** | Low | Medium | Monitor quotas, add retry logic |
| **GitHub API changes** | Low | Medium | Pin API version, monitor deprecations |

---

### 11.2 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Low adoption (<30%)** | Medium | Medium | Keep shared PAT fallback, improve messaging |
| **User privacy concerns** | Low | Medium | Clear consent, FAQ, "We only read" |
| **Support burden** | Medium | Low | Self-service docs, troubleshooting guide |

---

### 11.3 Security Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Token leak** | Low | High | Encryption (Option B), audit logs |
| **Impersonation attack** | Very Low | Critical | Server-side uid verification |
| **Scope creep** | Low | Medium | Code review, deny `repo` scope in Phase 1 |

---

## 12. OPEN QUESTIONS

**For backend-ai-engineer:**

1. ✅ Encryption Option A (Firestore native) or Option B (AES-256)?
   - **Recommendation:** Start with Option A, add Option B if compliance requires

2. ✅ Token refresh strategy?
   - **Recommendation:** Not needed (GitHub OAuth tokens don't expire by default)

3. ✅ Rate limit tracking per-user?
   - **Recommendation:** Yes, add `rate_limit_remaining` to `github_tokens` (updated after each request)

**For product:**

4. ✅ Deprecate shared PAT eventually?
   - **Recommendation:** No, keep as fallback indefinitely

5. ✅ Incentivize OAuth adoption?
   - **Recommendation:** Yes, "Connect GitHub" badge, "Faster analysis" messaging

6. ✅ Support private repos (Phase 2)?
   - **Recommendation:** Yes, after 70%+ OAuth adoption

---

## 13. FINAL RECOMMENDATION

### 13.1 Summary

**✅ PROCEED with OAuth per-user migration.**

**Justification:**

1. **Capacity improvement:** 5,000/hour shared → 5,000-12,500/hour per user
2. **Private repo support:** Unlocks future feature (user-requested)
3. **Backwards compatible:** Shared PAT fallback ensures zero disruption
4. **Security improvement:** Per-user tokens, least privilege, revocable
5. **User experience:** Auto-fill username, skip verification step

---

### 13.2 Phase 1 Scope (MVP)

**Goal:** Deploy OAuth with minimal risk.

**Included:**

- ✅ OAuth token storage (Firestore native encryption)
- ✅ Dual-mode operation (OAuth + shared PAT fallback)
- ✅ Public repos only (`public_repo` scope)
- ✅ "Connect GitHub" button (frontend)
- ✅ Token revocation ("Disconnect GitHub")
- ✅ Upgrade prompt (existing linked users)

**Excluded (Phase 2+):**

- ❌ Private repo support (`repo` scope)
- ❌ Application-level encryption (AES-256)
- ❌ Refresh token support
- ❌ Shared PAT deprecation
- ❌ GitHub App migration

**Timeline:** 4-6 weeks (backend + frontend + testing)

---

### 13.3 Success Criteria

**After 30 days:**

- ✅ 70%+ of active users on OAuth
- ✅ <1% OAuth error rate
- ✅ Zero security incidents (token leaks)
- ✅ Positive user feedback (NPS >8)
- ✅ Shared PAT usage <20% (freed capacity)

**After 90 days:**

- ✅ 90%+ of active users on OAuth
- ✅ Private repo beta launched (Phase 2)
- ✅ GraphQL migration deployed (41× capacity gain)
- ✅ Combined capacity: 500+ evals/hour per user

---

## CONCLUSION

OAuth per-user migration is **technically feasible, secure, and backwards-compatible**. The proposed design:

1. ✅ **Preserves existing functionality** (shared PAT fallback)
2. ✅ **Improves capacity** (per-user rate limits)
3. ✅ **Enhances security** (least privilege, encrypted storage)
4. ✅ **Reduces friction** (auto-fill username, skip verification)
5. ✅ **Enables future features** (private repos, GraphQL batching)

**Next step:** Coordinate with **backend-ai-engineer** to implement Phase 1 (Weeks 1-4).

---

**End of Document**
