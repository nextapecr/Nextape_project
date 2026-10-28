import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { GithubSignalsService, GithubApiError, getGithubToken } from "@/services/github-signals.service";
import { analyzeRepositorySources } from "@/services/github-engine";
import {
  GITHUB_ENGINE_VERSION,
  GITHUB_REPO_NAME_PATTERN,
  GITHUB_USERNAME_PATTERN,
  repoDocId,
} from "@/services/github-engine/evidence-keys";
import { consumeRateLimit, GITHUB_RATE_LIMITS, rateLimitedResponse } from "@/lib/server/rate-limit";
import {
  classifyGithubError,
  logGithubError,
  createErrorResponse,
  generateAnalysisId,
} from "@/services/github-error-classifier";
import type { GithubRepoEvaluateResponse, GithubRepoEvidence } from "@/types/github.types";
import { validateRepoRef } from "@/lib/server/github-authorization";
import { readPrivateReposAllowlist } from "@/lib/server/github-allowlist";
import { evaluateRepoFlow, type EvaluateFlowDeps } from "@/lib/server/evaluate-flow";

export const runtime = "nodejs";

/**
 * POST /api/github/evaluate
 * Analiza UN repositorio de la cuenta y guarda el resultado en `github_evidence/{uid}/repos/{repoId}`.
 *
 * Antes este endpoint analizaba un único repositorio —el más reciente— y ese resultado era todo el
 * perfil. Ahora es una pieza del análisis completo: el cliente lo llama una vez por repositorio
 * (cada llamada cabe en el tiempo de una Netlify Function) y al final `/api/github/aggregate`
 * combina todos. No llama a IA: la lectura de IA se hace una sola vez sobre el agregado.
 *
 * Caché: si el último commit no cambió desde el último análisis con esta versión del motor, se
 * devuelve lo guardado sin descargar ni parsear de nuevo.
 *
 * Body: { githubUsername: string, repoName: string }   // "repo" u "owner/repo"
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const githubUsername = typeof body.githubUsername === "string" ? body.githubUsername.trim() : "";
  const repoName = typeof body.repoName === "string" ? body.repoName.trim() : "";
  if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
    return NextResponse.json({ error: "invalid_github_username" }, { status: 400 });
  }
  if (!repoName) return NextResponse.json({ error: "missing_repo" }, { status: 400 });

  const [ownerPart, namePart] = repoName.includes("/")
    ? repoName.split("/", 2)
    : [githubUsername, repoName];

  // Phase 3: Ya no validamos que el repo sea del usuario autenticado — puede ser colaborativo.
  // El análisis se filtra por commits del usuario, sin importar quién es el owner del repo.
  if (repoName.split("/").length > 2 || !GITHUB_REPO_NAME_PATTERN.test(namePart ?? "")) {
    return NextResponse.json({ error: "invalid_repo_name" }, { status: 400 });
  }

  const owner = ownerPart;
  const repo = namePart;
  
  // Validate owner/repo before interpolating into URL (injection protection)
  const validationResult = validateRepoRef(owner, repo);
  if (!validationResult.valid) {
    return NextResponse.json(
      { error: "invalid_repo_name", message: validationResult.reason },
      { status: 400 }
    );
  }
  
  const fullName = `${owner}/${repo}`;
  
  // Generate unique analysis ID for error correlation
  const analysisId = generateAnalysisId(uid);

  try {
    // Get user's OAuth token
    const userToken = await getGithubToken(uid);
    
    // Delegate to evaluateRepoFlow with real dependencies
    const deps: EvaluateFlowDeps<GithubRepoEvidence, GithubRepoEvaluateResponse> = {
      fetchRepoMetadata: async (owner: string, repo: string) => {
        return await GithubSignalsService.getRepoMetadata(owner, repo, userToken || undefined);
      },
      
      getUserAllowlist: (uid: string) => readPrivateReposAllowlist(adminDb(), uid),
      
      checkCache: async (uid: string, repoFullName: string) => {
        const docRef = adminDb()
          .collection("github_evidence")
          .doc(uid)
          .collection("repos")
          .doc(repoDocId(repoFullName));
        
        const existingSnap = await docRef.get();
        const existing = existingSnap.data() as GithubRepoEvidence | undefined;
        
        if (existing && existing.engineVersion === GITHUB_ENGINE_VERSION && existing.lastCommitSHA) {
          const currentSHA = await GithubSignalsService.getLatestCommitSHA(owner, repo, userToken || undefined);
          
          if (currentSHA && currentSHA === existing.lastCommitSHA) {
            const cached: GithubRepoEvaluateResponse = {
              cached: true,
              fullName: repoFullName,
              skillScores: existing.skillScores,
              filesAnalyzed: existing.filesAnalyzed ?? 0,
              parsedLanguages: existing.parsedLanguages ?? {},
            };
            return { hit: true, data: cached };
          }
        }
        
        return { hit: false };
      },
      
      consumeRateLimit: (uid: string) =>
        consumeRateLimit(adminDb(), "github_evaluate", uid, GITHUB_RATE_LIMITS.evaluate),
      
      writeEvidence: async (uid: string, repoFullName: string, evidence: GithubRepoEvidence) => {
        const docRef = adminDb()
          .collection("github_evidence")
          .doc(uid)
          .collection("repos")
          .doc(repoDocId(repoFullName));
        
        await docRef.set(evidence);
      },
      
      analyzeRepo: async (owner: string, repo: string) => {
        const [{ signals, tree, pushedAt, isPrivate }] = await Promise.all([
          GithubSignalsService.getRepoSnapshot(owner, repo, userToken || undefined),
        ]);
        
        const userCommits = await GithubSignalsService.getUserCommitsInRepo(
          owner,
          repo,
          githubUsername,
          userToken || undefined,
        );
        
        const userTouchedFiles = new Set<string>();
        for (const commit of userCommits) {
          for (const file of commit.files) {
            userTouchedFiles.add(file);
          }
        }
        
        const files = await GithubSignalsService.fetchCentralSourceFiles(
          owner,
          repo,
          signals.lastCommitSHA,
          tree,
          Array.from(userTouchedFiles),
          userToken || undefined,
        );
        
        const { ir, metrics, skillScores } = analyzeRepositorySources(files, signals);
        
        const parsedLanguages: Record<string, number> = {};
        for (const file of ir.files) {
          parsedLanguages[file.language] = (parsedLanguages[file.language] ?? 0) + 1;
        }
        
        const evidence: GithubRepoEvidence = {
          uid,
          githubUsername,
          fullName,
          pushedAt,
          lastCommitSHA: signals.lastCommitSHA,
          repoSignals: signals,
          metrics,
          skillScores,
          filesAnalyzed: ir.files.length,
          parsedLanguages,
          analyzedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
          engineVersion: GITHUB_ENGINE_VERSION,
          isPrivate,
        };
        
        const response: GithubRepoEvaluateResponse = {
          cached: false,
          fullName,
          skillScores,
          filesAnalyzed: ir.files.length,
          parsedLanguages,
        };
        
        return { evidence, response };
      },
    };
    
    // Execute flow
    const result = await evaluateRepoFlow(owner, repo, uid, deps);
    
    // Handle result
    switch (result.type) {
      case 'repo_not_found':
        return NextResponse.json(
          {
            error: "repo_not_found_or_no_access",
            message: "Repository not found or no access",
            repoFullName: fullName,
          },
          { status: 404 }
        );
      
      case 'not_authorized':
        console.log(`
╔════════════════════════════════════════════════════════════════
║ 🚫 PRIVATE REPO NOT AUTHORIZED (Phase 6)
║ Repo: ${fullName}
║ ✅ NO rate limit consumed
║ ✅ NO Firestore write
╚════════════════════════════════════════════════════════════════
        `);
        return NextResponse.json(
          {
            error: "private_repo_not_authorized",
            message: `Private repository ${fullName} is not in your allowlist`,
            repoFullName: fullName,
          },
          { status: 403 }
        );
      
      case 'cache_hit':
        console.log(`
╔════════════════════════════════════════════════════════════════
║ 🎯 CACHE HIT (Phase 5)
║ Repo: ${fullName}
║ ✅ NO rate limit consumed
╚════════════════════════════════════════════════════════════════
        `);
        return NextResponse.json(result.data);
      
      case 'rate_limited':
        // Antes se volvía a llamar a consumeRateLimit solo para armar la respuesta (otra
        // transacción en Firestore). El flujo ya trae cuánto falta.
        return rateLimitedResponse({
          allowed: false,
          state: { windowStart: 0, count: 0 },
          retryAfterMs: result.retryAfterMs,
        });
      
      case 'success':
        return NextResponse.json(result.data);
    }
  } catch (err) {
    // Classify and log error for diagnosis
    let stage: 'get_repo_info' | 'get_tree' | 'get_user_commits' | 'fetch_file' | 'parse_files' | 'save_evidence' | 'unknown' = 'unknown';
    
    // Determine stage from error type
    if (err instanceof GithubApiError) {
      stage = err.stage as typeof stage;
    } else if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('firestore') || msg.includes('firebase')) {
        stage = 'save_evidence';
      } else if (msg.includes('parse') || msg.includes('syntax')) {
        stage = 'parse_files';
      }
    }
    
    // Log error to Firestore for diagnosis
    await logGithubError(
      adminDb(),
      analysisId,
      uid,
      githubUsername,
      fullName,
      `Analyzing repository ${fullName}`,
      err,
      stage
    );
    
    // Create classified error response
    const { response, httpStatus } = createErrorResponse(err, stage);
    
    console.error("[github/evaluate] CLASSIFIED ERROR:", {
      analysisId,
      repoFullName: fullName,
      errorCode: response.error,
      httpStatus: response.httpStatus,
      stage: response.stage,
      retryable: response.retryable,
      message: response.message?.slice(0, 100),
    });
    
    return NextResponse.json(response, { status: httpStatus });
  }
}
