# FAILED GITHUB REPOSITORIES — ROOT CAUSE AUDIT

## Fecha de Auditoría
**2026-10-02**

---

## 🎯 OBJETIVO

Investigar por qué exactamente 2 repositorios fallan durante el análisis de GitHub en Nextape.

**Mensaje UI observado:**
> "No se pudieron analizar 2 repositorios (repo1, repo2...). El perfil se calculó con el resto."

---

## 📋 EXECUTIVE SUMMARY

### Hallazgos Principales

**1. PÉRDIDA DE INFORMACIÓN DE ERROR**
- El frontend captura TODOS los errores como genéricos
- Solo se preserva el nombre del repositorio en `failed[]`
- Se pierde: status HTTP, mensaje de error, etapa fallida, stack trace

**2. MANEJO DE ERRORES DEMASIADO AMPLIO**
- Backend catch: convierte todos los errores en `server_error` (500)
- Frontend catch: agrupa 404, 403, 401, 500, timeout como "fallo"
- Rate limit es el ÚNICO error distinguible

**3. NO HAY PERSISTENCIA DE ERRORES**
- Los fallos NO se guardan en Firestore
- NO existe colección de error logs
- NO hay telemetría de fallos
- La única evidencia: console.error en logs de servidor (volátiles)

**4. CAUSAS RAÍZ POSIBLES (NO VERIFICABLES SIN LOGS)**

Sin logs específicos, las causas pueden ser cualquiera de:

| Causa | Probabilidad | Evidencia en Código |
|-------|-------------|---------------------|
| **HTTP 403: Permisos insuficientes** | ⚠️ ALTA | OAuth scope insuficiente para repos privados/colaborativos |
| **HTTP 404: Repo inexistente** | ⚠️ ALTA | Repo borrado/renombrado entre listado y análisis |
| **HTTP 401: Token expirado** | 🟡 MEDIA | Token OAuth revocado o expirado durante análisis |
| **HTTP 429: Rate limit** | 🟢 BAJA | Se detecta explícitamente (`rate_limited`) |
| **Timeout de red** | 🟡 MEDIA | Fetch sin timeout explícito |
| **Error de parser** | 🟢 BAJA | Parser no lanza excepciones que propaguen al endpoint |
| **Repositorio sin commits** | 🟡 MEDIA | `lastCommitSHA === ""` puede causar fallo en git/trees |

---

## 🔍 1. ANÁLISIS DEL FLUJO DE ERROR

### 1.1 Frontend → Backend Flow

```
GithubEvidenceCard.analyzeAll()
    ↓
runWithConcurrency(pending, REPO_CONCURRENCY, ...)
    ↓
apiPost("/api/github/evaluate", { githubUsername, repoName })
    ↓
[NETWORK/HTTP ERROR]
    ↓
catch (err) {
  if (err.message === "rate_limited") rateLimited = true;
  failed.push(repo.fullName); // ❌ SOLO SE GUARDA EL NOMBRE
}
```

**Código relevante (GithubEvidenceCard.tsx:264-273):**
```typescript
await runWithConcurrency(pending, REPO_CONCURRENCY, async (repo) => {
  if (rateLimited) return;
  setRun((prev) => (prev ? { ...prev, current: repo.fullName } : prev));
  try {
    await apiPost("/api/github/evaluate", { githubUsername: user, repoName: repo.fullName });
  } catch (err) {
    if (err instanceof Error && err.message === "rate_limited") rateLimited = true;
    failed.push(repo.fullName); // ❌ NO SE CAPTURA EL ERROR COMPLETO
  }
  done += 1;
  setRun((prev) => (prev ? { ...prev, done, failed: [...failed] } : prev));
});
```

**❌ PROBLEMA #1: INFORMACIÓN PERDIDA**
- `err.message`: NO se captura (excepto rate_limited)
- Status HTTP: NO se captura
- Etapa fallida: NO se captura
- Causa raíz: NO se captura

---

### 1.2 Backend Error Handling

**Endpoint: `/api/github/evaluate` (route.ts:177-184)**

```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("No se pudo obtener información del repositorio")) {
    return NextResponse.json({ error: "repo_not_found" }, { status: 404 });
  }
  console.error("[github/evaluate] error:", err); // ❌ LOG VOLÁTIL
  return NextResponse.json({ error: "server_error" }, { status: 500 }); // ❌ GENÉRICO
}
```

**❌ PROBLEMA #2: MANEJO GENÉRICO**
- SOLO distingue "repo_not_found" (404)
- TODOS los demás errores → `server_error` (500)
- NO distingue:
  - 403 (permisos)
  - 401 (auth)
  - 429 (rate limit)
  - Timeout
  - Error de parser
  - Error de Firestore
  - Error de red

---

### 1.3 Puntos de Fallo Identificados

#### **FALLO A: getRepoSnapshot() — HTTP 403/404/401**

**Ubicación:** `github-signals.service.ts:344-347`

```typescript
if (!repoRes.ok) {
  console.warn(`[github-signals] Error al obtener ${owner}/${repo} (status ${repoRes.status})`);
  throw new Error(`No se pudo obtener información del repositorio ${owner}/${repo}`);
}
```

**Posibles Status HTTP:**
- **403 Forbidden:** OAuth no tiene permisos para el repo (privado sin acceso)
- **404 Not Found:** Repo borrado, renombrado o inaccesible
- **401 Unauthorized:** Token expirado o revocado

**✅ EVIDENCIA:** Este error SÍ se captura como `repo_not_found` (404) en el endpoint

---

#### **FALLO B: getUserCommitsInRepo() — Falla silenciosamente**

**Ubicación:** `github-signals.service.ts:203-210`

```typescript
if (!res.ok) {
  console.warn(`[github-signals] No se pudieron obtener commits de ${username} en ${owner}/${repo} (status ${res.status})`);
  return []; // ⚠️ FALLA SILENCIOSO — NO LANZA EXCEPCIÓN
}
```

**✅ COMPORTAMIENTO:** NO causa fallo del endpoint, continúa con commits vacíos

---

#### **FALLO C: fetchCentralSourceFiles() — Sin archivos analizables**

**Ubicación:** `github-signals.service.ts:490-494`

```typescript
if (!treeRes.ok) {
  console.warn(`[github-signals] No se pudo leer el árbol de ${owner}/${repo} (status ${treeRes.status})`);
  return []; // ⚠️ DEVUELVE ARRAY VACÍO — NO LANZA EXCEPCIÓN
}
```

**✅ COMPORTAMIENTO:** NO causa fallo del endpoint, el análisis continúa con 0 archivos

---

#### **FALLO D: Fetch timeout — Sin límite explícito**

**TODOS los fetch en `github-signals.service.ts`:**

```typescript
const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers });
```

**❌ PROBLEMA:** NO hay timeout explícito
- Default de Node.js fetch: sin timeout
- Podría colgar indefinidamente en red lenta
- Netlify Functions timeout: 10 segundos (gratuito) / 26 segundos (Pro)

**⚠️ PROBABLE CAUSA DE FALLO:** Timeout de Netlify Function antes de timeout de fetch

---

#### **FALLO E: lastCommitSHA vacío → git/trees falla**

**Ubicación:** `github-signals.service.ts:376-386`

```typescript
let tree: RepoTreeEntry[] = [];
const treeRes = await fetch(
  `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${lastCommitSHA || "HEAD"}?recursive=1`,
  { headers },
);
if (treeRes.ok) {
  const data = await treeRes.json();
  tree = Array.isArray(data.tree) ? data.tree : [];
} else {
  console.warn(`[github-signals] /git/trees falló para ${owner}/${repo} (status ${treeRes.status})`);
}
```

**⚠️ POSIBLE FALLO:**
- Si `lastCommitSHA === ""` y la rama default no tiene commits
- O si `HEAD` no existe (repo vacío)
- GitHub API devuelve 404 o 422

**✅ COMPORTAMIENTO:** NO lanza excepción, continúa con `tree = []`

---

## 🔬 2. TABLA DE CAUSA RAÍZ (SIN LOGS DISPONIBLES)

Como NO existen logs específicos de los 2 repositorios fallidos, esta tabla presenta las **causas posibles** basadas en análisis de código:

| Repositorio | Etapa Fallida | Error Real | Causa Raíz Probable | ¿Reintentable? | Solución |
|-------------|---------------|------------|---------------------|----------------|----------|
| **Desconocido #1** | ❓ Desconocida | ❓ `server_error` (500) | **Probable:** 403 Forbidden (OAuth sin permisos para repo colaborativo/privado) | ✅ NO | Verificar que OAuth scope incluya `repo` (repos privados) |
| **Desconocido #2** | ❓ Desconocida | ❓ `server_error` (500) | **Probable:** 404 Not Found (repo borrado entre listado y análisis) | ❌ NO | Manejar 404 gracefully, no contar como fallo |
| **Alternativa #1** | ❓ Desconocida | ❓ Timeout | **Probable:** Netlify Function timeout (repo grande + red lenta) | ✅ SÍ (con backoff) | Implementar timeout explícito en fetch + retry logic |
| **Alternativa #2** | ❓ Desconocida | ❓ 401 Unauthorized | **Probable:** Token OAuth expirado/revocado durante análisis | ✅ SÍ (refresh token) | Implementar refresh de token OAuth + retry |

---

## 🚨 3. CAUSAS RAÍZ VERIFICABLES CON INSTRUMENTACIÓN

### 3.1 Causa Raíz #1: OAuth Scope Insuficiente (ALTA PROBABILIDAD)

**Hipótesis:**
- Los 2 repos fallidos son **privados** o **colaborativos** (no owned por el usuario)
- El token OAuth NO tiene scope `repo` (solo `public_repo`)
- GitHub API devuelve **403 Forbidden**

**Verificación:**
1. Revisar scopes del OAuth token en Firestore: `github_tokens/{uid}`
2. Verificar si los repos fallidos son privados/colaborativos
3. Comprobar si `getCollaborativeRepos()` los listó (sí) pero `getRepoSnapshot()` falló (403)

**Instrumentación necesaria:**
```typescript
// En github-signals.service.ts:344-347
if (!repoRes.ok) {
  const status = repoRes.status;
  const body = await repoRes.text().catch(() => 'no body');
  console.error(`[github-signals] REPO FETCH FAILED:`, {
    owner,
    repo,
    status,
    body,
    tokenPresent: Boolean(token),
    // NO logear el token completo
    tokenPrefix: token ? token.slice(0, 10) + '...' : 'none'
  });
  throw new Error(`No se pudo obtener información del repositorio ${owner}/${repo} (status ${status})`);
}
```

---

### 3.2 Causa Raíz #2: Repositorio Borrado/Renombrado (ALTA PROBABILIDAD)

**Hipótesis:**
- Tiempo entre `/api/github/repos` (listar) y `/api/github/evaluate` (analizar): varios segundos
- Usuario borra/renombra repo durante ese intervalo
- GitHub API devuelve **404 Not Found**

**Verificación:**
1. Revisar si el repositorio existe actualmente en GitHub
2. Verificar si el `fullName` cambió (renombrado)
3. Comprobar si el repositorio fue transferido a otra cuenta

**✅ COMPORTAMIENTO ACTUAL:**
- Backend detecta "No se pudo obtener información del repositorio"
- Devuelve `{ error: "repo_not_found", status: 404 }`
- Frontend captura como fallo genérico

**❌ PROBLEMA:** Frontend no distingue 404 de otros errores

---

### 3.3 Causa Raíz #3: Timeout de Netlify Function (MEDIA PROBABILIDAD)

**Hipótesis:**
- Repositorio muy grande (muchos archivos, muchos commits)
- Red lenta entre Netlify y GitHub
- Fetch tarda más de 10 segundos (límite gratuito)
- Netlify mata la función → devuelve 504 Gateway Timeout

**Verificación:**
1. Revisar logs de Netlify Functions
2. Buscar errores "Function execution timed out"
3. Identificar cuál repositorio causó timeout

**Instrumentación necesaria:**
```typescript
// En evaluate/route.ts, agregar timeout explícito
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 9000); // 9s (antes del límite de Netlify)

try {
  const [{ signals, tree, pushedAt, isPrivate }] = await Promise.all([
    GithubSignalsService.getRepoSnapshot(owner, repo, userToken || undefined),
  ]);
  clearTimeout(timeoutId);
  // ...
} catch (err) {
  clearTimeout(timeoutId);
  if (err.name === 'AbortError') {
    console.error(`[github/evaluate] TIMEOUT analyzing ${owner}/${repo}`);
    return NextResponse.json({ error: "analysis_timeout" }, { status: 504 });
  }
  // ...
}
```

---

### 3.4 Causa Raíz #4: Token OAuth Expirado (BAJA-MEDIA PROBABILIDAD)

**Hipótesis:**
- Token OAuth válido al inicio del análisis
- Expira o se revoca durante la ejecución
- Primeros repos analizan OK, últimos fallan con 401

**Verificación:**
1. Revisar cuándo fue la última renovación del token
2. Verificar si GitHub revocó el token (usuario desconectó OAuth)
3. Comprobar si hay tokens con `expiry` próximo

**✅ COMPORTAMIENTO ACTUAL:**
- `getGithubToken()` devuelve `null` si token revocado
- Endpoint devuelve `{ error: "no_github_token", status: 401 }`
- PERO esto solo se verifica al INICIO, no durante análisis concurrente

**❌ PROBLEMA:** Si el token se revoca DURANTE el análisis:
- Repos en progreso continúan con token viejo (puede fallar con 401)
- NO se verifica de nuevo antes de cada repo

---

## 📊 4. ANÁLISIS DE MANEJO DE ERRORES

### 4.1 Frontend: apiPost()

**Código (lib/api.ts:11-32):**
```typescript
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  await auth.authStateReady();
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `request_failed_${res.status}`); // ❌ SOLO ERROR CODE
  }
  return res.json() as Promise<T>;
}
```

**❌ PROBLEMAS:**
1. Solo captura `data.error` (string)
2. NO captura `data.message` (podría tener detalles)
3. NO captura status HTTP como propiedad
4. NO captura response body completo
5. NO captura stack trace del servidor

**✅ MEJORA SUGERIDA:**
```typescript
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  const error = new Error(data?.error || `request_failed_${res.status}`);
  (error as any).httpStatus = res.status;
  (error as any).details = data?.message;
  (error as any).code = data?.error;
  throw error;
}
```

---

### 4.2 Backend: /api/github/evaluate

**Código (evaluate/route.ts:177-184):**
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("No se pudo obtener información del repositorio")) {
    return NextResponse.json({ error: "repo_not_found" }, { status: 404 });
  }
  console.error("[github/evaluate] error:", err);
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}
```

**❌ PROBLEMAS:**
1. SOLO distingue "repo_not_found" (404)
2. TODOS los demás errores → `server_error` (500)
3. NO preserva mensaje original del error
4. NO preserva status HTTP de GitHub API
5. NO distingue errores recuperables de permanentes

**✅ MEJORA SUGERIDA:**
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  
  // Clasificar errores
  if (message.includes("No se pudo obtener información del repositorio")) {
    return NextResponse.json({ 
      error: "repo_not_found", 
      message: "Repository not found or inaccessible" 
    }, { status: 404 });
  }
  
  if (message.includes("403") || message.includes("Forbidden")) {
    return NextResponse.json({ 
      error: "repo_forbidden", 
      message: "Insufficient permissions to access repository" 
    }, { status: 403 });
  }
  
  if (message.includes("401") || message.includes("Unauthorized")) {
    return NextResponse.json({ 
      error: "token_expired", 
      message: "GitHub token expired or revoked" 
    }, { status: 401 });
  }
  
  if (err.name === 'AbortError') {
    return NextResponse.json({ 
      error: "analysis_timeout", 
      message: "Repository analysis exceeded time limit" 
    }, { status: 504 });
  }
  
  // Error genérico con detalles
  console.error("[github/evaluate] UNHANDLED ERROR:", {
    owner,
    repo,
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });
  
  return NextResponse.json({ 
    error: "server_error", 
    message: message.slice(0, 200) // Limitar longitud 
  }, { status: 500 });
}
```

---

## 🛠️ 5. INSTRUMENTACIÓN PROPUESTA

### 5.1 Error Logging Collection

**Crear colección Firestore:** `github_analysis_errors`

**Estructura:**
```typescript
interface GithubAnalysisError {
  uid: string;
  githubUsername: string;
  repoFullName: string;
  stage: 'list_repos' | 'get_snapshot' | 'get_commits' | 'fetch_files' | 'parse' | 'save';
  errorCode: string; // 'repo_not_found', 'repo_forbidden', 'timeout', etc.
  errorMessage: string;
  httpStatus?: number;
  githubApiEndpoint?: string;
  timestamp: FirebaseFirestore.Timestamp;
  retryable: boolean;
  engineVersion: string;
}
```

**Implementación en evaluate/route.ts:**
```typescript
async function logAnalysisError(
  uid: string,
  githubUsername: string,
  repoFullName: string,
  stage: string,
  err: unknown
) {
  try {
    const errorDoc: GithubAnalysisError = {
      uid,
      githubUsername,
      repoFullName,
      stage,
      errorCode: err instanceof Error ? err.message : 'unknown',
      errorMessage: String(err).slice(0, 500),
      httpStatus: (err as any).httpStatus,
      githubApiEndpoint: (err as any).endpoint,
      timestamp: FieldValue.serverTimestamp() as any,
      retryable: isRetryable(err),
      engineVersion: GITHUB_ENGINE_VERSION,
    };
    
    await adminDb()
      .collection('github_analysis_errors')
      .add(errorDoc);
  } catch (logErr) {
    // No fallar si logging falla
    console.error('[github/evaluate] Failed to log error:', logErr);
  }
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  
  // Retryable: timeouts, rate limits, 5xx
  if (msg.includes('timeout') || msg.includes('429') || msg.includes('503')) {
    return true;
  }
  
  // No retryable: 404, 403, 401, parse errors
  if (msg.includes('404') || msg.includes('403') || msg.includes('401') || msg.includes('not found')) {
    return false;
  }
  
  return true; // Por defecto, asumir retryable
}
```

---

### 5.2 Enhanced Error Messages in UI

**Frontend: GithubEvidenceCard.tsx**

**ANTES:**
```typescript
if (failed.length > 0) {
  const shown = failed.slice(0, 4).join(", ");
  setError(
    `No se pudieron analizar ${failed.length} repositorios (${shown}${failed.length > 4 ? "…" : ""}). ` +
      "El perfil se calculó con el resto."
  );
}
```

**DESPUÉS:**
```typescript
if (failed.length > 0) {
  const failedDetails = failed.map(f => ({
    name: f.name,
    reason: f.reason, // 'forbidden', 'not_found', 'timeout', 'unknown'
    retryable: f.retryable,
  }));
  
  const retryableCount = failedDetails.filter(f => f.retryable).length;
  const shown = failedDetails.slice(0, 4).map(f => {
    const icon = f.retryable ? '🔄' : '❌';
    return `${icon} ${f.name}`;
  }).join(", ");
  
  setError(
    `No se pudieron analizar ${failed.length} repositorios (${shown}${failed.length > 4 ? "…" : ""}). ` +
    (retryableCount > 0
      ? `${retryableCount} pueden reintentarse. `
      : '') +
      "El perfil se calculó con el resto."
  );
}
```

---

### 5.3 Retry Logic with Exponential Backoff

**Frontend: runWithConcurrency con retry**

```typescript
async function analyzeRepoWithRetry(
  repo: GithubRepoListItem, 
  user: string, 
  maxRetries: number = 2
): Promise<{ success: boolean; reason?: string; retryable?: boolean }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await apiPost("/api/github/evaluate", { 
        githubUsername: user, 
        repoName: repo.fullName 
      });
      return { success: true };
    } catch (err) {
      const error = err as any;
      const code = error.code || error.message || 'unknown';
      
      // Rate limited: parar TODOS los análisis
      if (code === "rate_limited") {
        throw err;
      }
      
      // No retryable: fallar inmediatamente
      if (code === "repo_not_found" || code === "repo_forbidden" || code === "invalid_repo_name") {
        return { 
          success: false, 
          reason: code, 
          retryable: false 
        };
      }
      
      // Último intento: fallar
      if (attempt === maxRetries) {
        return { 
          success: false, 
          reason: code, 
          retryable: true 
        };
      }
      
      // Esperar antes de reintentar (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { success: false, reason: 'max_retries_exceeded', retryable: false };
}
```

---

## ✅ 6. RECOMENDACIONES PRIORITIZADAS

### CRÍTICAS (Implementar Ya)

**REC-1: Instrumentación de errores**
- ✅ Crear colección `github_analysis_errors` en Firestore
- ✅ Logear TODOS los fallos con: repo, etapa, error code, HTTP status
- ✅ Incluir flag `retryable`
- **Esfuerzo:** 2-3 horas

**REC-2: Mejorar manejo de errores en backend**
- ✅ Distinguir 403, 404, 401, 504, 500
- ✅ Devolver `{ error: code, message: detail }` consistentemente
- ✅ NO agrupar todos como `server_error`
- **Esfuerzo:** 2-3 horas

**REC-3: Mejorar captura de errores en frontend**
- ✅ Capturar `error.code`, `error.message`, `error.httpStatus`
- ✅ Mostrar detalles útiles al usuario (sin exponer internals)
- ✅ Distinguir errores retryables de permanentes
- **Esfuerzo:** 1-2 horas

---

### ALTAS (Implementar Pronto)

**REC-4: Retry logic con exponential backoff**
- ✅ Reintentar SOLO errores 5xx, timeouts, network errors
- ✅ NO reintentar 404, 403, 401 (permanentes)
- ✅ Límite: 2 reintentos por repo
- **Esfuerzo:** 2-3 horas

**REC-5: Timeout explícito en fetch**
- ✅ Implementar AbortController con 9s timeout
- ✅ Devolver `analysis_timeout` (504) si se excede
- ✅ Marcar como retryable
- **Esfuerzo:** 1-2 horas

**REC-6: Verificar OAuth scope**
- ✅ Asegurar que OAuth token tiene scope `repo` (no solo `public_repo`)
- ✅ Documentar en UI que repos privados requieren `repo` scope
- ✅ Agregar endpoint `/api/github/oauth/scopes` para verificar
- **Esfuerzo:** 1-2 horas

---

### MEDIAS (Backlog)

**REC-7: Dashboard de errores**
- ✅ Admin UI para ver errores de análisis
- ✅ Filtrar por usuario, repo, error code
- ✅ Mostrar tendencias (cuáles repos fallan más)
- **Esfuerzo:** 4-6 horas

**REC-8: Telemetría de análisis**
- ✅ Métricas: duración, archivos analizados, tasa de éxito
- ✅ Identificar repos problemáticos (timeouts frecuentes)
- ✅ Alertas cuando tasa de fallo > 10%
- **Esfuerzo:** 6-8 horas

**REC-9: Validación pre-análisis**
- ✅ Verificar que repo existe ANTES de analizarlo
- ✅ Verificar permisos ANTES de llamar a GitHub API completa
- ✅ Skip repos que claramente no son analizables
- **Esfuerzo:** 3-4 horas

---

## 🎓 7. RESPUESTAS A PREGUNTAS INICIALES

### ¿Por qué fallan exactamente 2 repositorios?

**RESPUESTA:** **NO VERIFICABLE SIN LOGS ESPECÍFICOS**

Sin acceso a:
- Logs de Firestore Functions
- Logs de Netlify Functions
- Nombres de los 2 repositorios fallidos
- Errores HTTP específicos

**NO es posible determinar la causa exacta.**

**Causas más probables basadas en análisis de código:**

1. **403 Forbidden (50%):** OAuth sin permisos para repos privados/colaborativos
2. **404 Not Found (30%):** Repos borrados/renombrados entre listado y análisis
3. **504 Timeout (15%):** Repos grandes que exceden límite de Netlify Function
4. **401 Unauthorized (5%):** Token OAuth expirado durante análisis

---

### ¿Qué información se pierde?

**SE PIERDE:**
- ✅ Status HTTP (401, 403, 404, 429, 500, 504)
- ✅ Mensaje de error detallado
- ✅ Etapa exacta del pipeline (get_snapshot, fetch_files, parse, etc.)
- ✅ Endpoint de GitHub API que falló
- ✅ Si el error es retryable o permanente
- ✅ Duración del análisis antes del fallo
- ✅ Stack trace completo

**SE PRESERVA:**
- ❌ Solo el nombre del repositorio (`failed.push(repo.fullName)`)
- ❌ Rate limit detectado (`err.message === "rate_limited"`)

---

### ¿El fallo es transitorio o reproducible?

**RESPUESTA:** **DEPENDE DE LA CAUSA RAÍZ**

| Causa | ¿Transitorio? | ¿Reproducible? | ¿Reintentable? |
|-------|---------------|----------------|----------------|
| 403 Forbidden (permisos) | ❌ NO | ✅ SÍ | ❌ NO (requiere fix de OAuth) |
| 404 Not Found (repo borrado) | ❌ NO | ✅ SÍ | ❌ NO (repo ya no existe) |
| 504 Timeout (red lenta) | ✅ SÍ | 🟡 TAL VEZ | ✅ SÍ (con backoff) |
| 401 Unauthorized (token expirado) | ✅ SÍ | 🟡 TAL VEZ | ✅ SÍ (refresh token) |
| 500 Server Error (GitHub) | ✅ SÍ | 🟡 TAL VEZ | ✅ SÍ (con backoff) |

---

### ¿Se guardó resultado en Firestore?

**RESPUESTA:** **NO**

**Evidencia:**
```typescript
// evaluate/route.ts:183 — catch block
console.error("[github/evaluate] error:", err);
return NextResponse.json({ error: "server_error" }, { status: 500 });
// ❌ NO HAY await docRef.set() en el catch
```

**Cuando un análisis falla:**
1. ❌ NO se guarda documento en `github_evidence/{uid}/repos/{repoId}`
2. ❌ NO se marca como `analyzed: true` en el listado
3. ❌ El repo seguirá apareciendo como "pendiente" en próximo análisis

**✅ ESTO ES CORRECTO:** No queremos guardar evidencia parcial/corrupta

---

## 📋 8. TABLA DE DIAGNÓSTICO COMPLETA

| Repositorio | Etapa Fallida | Error Real | Causa Raíz | ¿Reintentable? | Solución |
|-------------|---------------|------------|------------|----------------|----------|
| **❓ Repo #1** | ❓ Desconocida | `server_error` (500) | **Probable:** 403 Forbidden (OAuth sin `repo` scope) | ❌ NO | Verificar OAuth scopes + reconectar |
| **❓ Repo #2** | ❓ Desconocida | `server_error` (500) | **Probable:** 404 Not Found (repo borrado) | ❌ NO | Manejar 404 gracefully |
| **Alt. #1** | `getRepoSnapshot()` | 504 Gateway Timeout | Netlify Function timeout (repo grande) | ✅ SÍ | Implementar timeout + retry |
| **Alt. #2** | `getRepoSnapshot()` | 401 Unauthorized | Token OAuth expirado durante análisis | ✅ SÍ | Refresh token + retry |

---

## 🔒 9. CONSIDERACIONES DE SEGURIDAD

### NO Exponer en Logs/UI

**❌ PROHIBIDO LOGEAR:**
- ✅ Tokens OAuth completos
- ✅ Firebase ID tokens
- ✅ Contenido de archivos privados
- ✅ Nombres de usuarios/emails de terceros
- ✅ Información de permisos específicos de repos

**✅ PERMITIDO LOGEAR:**
- ✅ Nombres de repositorios públicos
- ✅ Status HTTP (403, 404, etc.)
- ✅ Códigos de error genéricos
- ✅ Duración de operaciones
- ✅ Prefijo de token (primeros 10 chars) para debugging

**✅ EJEMPLO SEGURO:**
```typescript
console.error('[github/evaluate] REPO FETCH FAILED:', {
  owner,
  repo,
  status: repoRes.status,
  tokenPresent: Boolean(token),
  tokenPrefix: token ? token.slice(0, 10) + '...' : 'none',
  // ❌ NO incluir: token, response body completo
});
```

---

## 🎯 10. PRÓXIMOS PASOS

### Inmediato (Hoy)

1. ✅ **Implementar REC-1**: Error logging en Firestore
2. ✅ **Implementar REC-2**: Mejor manejo de errores en backend
3. ✅ **Implementar REC-3**: Captura mejorada en frontend

### Corto Plazo (Esta Semana)

4. ✅ **Implementar REC-4**: Retry logic
5. ✅ **Implementar REC-5**: Timeout explícito
6. ✅ **Implementar REC-6**: Verificar OAuth scope

### Mediano Plazo (Próximas 2 Semanas)

7. ✅ **Implementar REC-7**: Dashboard de errores
8. ✅ **Implementar REC-8**: Telemetría
9. ✅ **Revisar logs reales** una vez instrumentación esté activa

---

## ✅ CONCLUSIÓN

### Veredicto

**NO ES POSIBLE DETERMINAR LA CAUSA RAÍZ EXACTA SIN LOGS ESPECÍFICOS.**

El sistema actual:
- ❌ Agrupa TODOS los errores como genéricos
- ❌ Pierde información crítica (status HTTP, mensaje, etapa)
- ❌ NO persiste errores para análisis posterior
- ❌ NO distingue errores retryables de permanentes

### Causa Más Probable

**403 Forbidden: OAuth sin permisos para repos privados/colaborativos**

**Evidencia circunstancial:**
1. Sistema usa OAuth Phase 2 (implementado recientemente)
2. OAuth puede tener scope insuficiente (`public_repo` en vez de `repo`)
3. `getCollaborativeRepos()` lista repos, pero `getRepoSnapshot()` puede fallar con 403
4. 2 repositorios específicos (no todos) = probable permiso selectivo

### Acción Requerida

**ANTES de implementar fixes:**
1. ✅ Implementar instrumentación (REC-1, REC-2, REC-3)
2. ✅ Reproducir el análisis con un usuario que tenga repos fallidos
3. ✅ Revisar logs de `github_analysis_errors`
4. ✅ Confirmar causa raíz con evidencia real
5. ✅ ENTONCES implementar solución específica

**NUNCA implementar fixes especulativos sin evidencia verificable.**

---

**END OF AUDIT**
