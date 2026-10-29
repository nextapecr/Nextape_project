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
  logGithubError,
  createErrorResponse,
  generateAnalysisId,
} from "@/services/github-error-classifier";
import type { GithubRepoEvaluateResponse, GithubRepoEvidence } from "@/types/github.types";

export const runtime = "nodejs";

/**
 * POST /api/github/evaluate
 * Analiza UN repositorio de la cuenta y guarda el resultado en `github_evidence/{uid}/repos/{repoId}`.
 *
 * Antes este endpoint analizaba un único repositorio —el más reciente— y ese resultado era el
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

  const target = parseRepoTarget(body);
  if (target instanceof NextResponse) return target;
  const { githubUsername, owner, repo, fullName } = target;

  // Generate unique analysis ID for error correlation
  const analysisId = generateAnalysisId(uid);

  try {
    // Phase 5: Verificar cache ANTES de consumir rate limit o hacer llamadas pesadas a GitHub
    const docRef = adminDb()
      .collection("github_evidence")
      .doc(uid)
      .collection("repos")
      .doc(repoDocId(fullName));

    const existingSnap = await docRef.get();
    const existing = existingSnap.data() as GithubRepoEvidence | undefined;

    // Si existe análisis previo con la versión actual del motor y el SHA no cambió, se devuelve lo guardado.
    const cached = await freshCachedAnalysis(uid, existing, owner, repo);
    if (cached) return NextResponse.json(cached);

    // Cada análisis gasta ~5 peticiones del GITHUB_TOKEN compartido por toda la plataforma.
    const limit = await consumeRateLimit(adminDb(), "github_evaluate", uid, GITHUB_RATE_LIMITS.evaluate);
    if (!limit.allowed) return rateLimitedResponse(limit);

    // Phase 3: Obtener token OAuth del usuario para filtrar commits
    const userToken = await getGithubToken(uid);

    const { signals, tree, pushedAt, isPrivate } = await GithubSignalsService.getRepoSnapshot(
      owner,
      repo,
      userToken || undefined,
    );

    // Phase 3: Obtener commits del usuario en este repo
    const userCommits = await GithubSignalsService.getUserCommitsInRepo(
      owner,
      repo,
      githubUsername,
      userToken || undefined,
    );
    
    // Extraer lista de archivos tocados por el usuario
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
      Array.from(userTouchedFiles), // Phase 3: Priorizar archivos del usuario
      userToken || undefined, // Pass OAuth token
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
      isPrivate, // Phase 4: Save private flag
    };
    await docRef.set(evidence);

    const response: GithubRepoEvaluateResponse = {
      cached: false,
      fullName,
      skillScores,
      filesAnalyzed: ir.files.length,
      parsedLanguages,
    };
    return NextResponse.json(response);
  } catch (err) {
    // Classify and log error for diagnosis
    const stage = errorStage(err);

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

type AnalysisStage = Parameters<typeof createErrorResponse>[1];

/** Valida el body y separa owner/repo ("repo" u "owner/repo"). */
function parseRepoTarget(body: Record<string, unknown>):
  | { githubUsername: string; owner: string; repo: string; fullName: string }
  | NextResponse {
  const githubUsername = typeof body.githubUsername === "string" ? body.githubUsername.trim() : "";
  const repoName = typeof body.repoName === "string" ? body.repoName.trim() : "";
  if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
    return NextResponse.json({ error: "invalid_github_username" }, { status: 400 });
  }
  if (!repoName) return NextResponse.json({ error: "missing_repo" }, { status: 400 });

  const [owner, repo] = repoName.includes("/") ? repoName.split("/", 2) : [githubUsername, repoName];

  // Phase 3: Ya no validamos que el repo sea del usuario autenticado — puede ser colaborativo.
  // El análisis se filtra por commits del usuario, sin importar quién es el owner del repo.
  if (repoName.split("/").length > 2 || !GITHUB_REPO_NAME_PATTERN.test(repo ?? "")) {
    return NextResponse.json({ error: "invalid_repo_name" }, { status: 400 });
  }
  return { githubUsername, owner, repo, fullName: `${owner}/${repo}` };
}

/**
 * Phase 5: si hay un análisis con la versión actual del motor y el último commit no cambió, lo
 * devuelve sin consumir rate limit ni descargar el repo (1 llamada ligera para leer el SHA).
 */
async function freshCachedAnalysis(
  uid: string,
  existing: GithubRepoEvidence | undefined,
  owner: string,
  repo: string,
): Promise<GithubRepoEvaluateResponse | null> {
  if (!existing || existing.engineVersion !== GITHUB_ENGINE_VERSION || !existing.lastCommitSHA) return null;
  const fullName = `${owner}/${repo}`;
  const userToken = await getGithubToken(uid);
  const currentSHA = await GithubSignalsService.getLatestCommitSHA(owner, repo, userToken || undefined);

  if (currentSHA && currentSHA === existing.lastCommitSHA) {
    console.log(`[github/evaluate] cache hit ${fullName} @ ${currentSHA.slice(0, 7)}: sin análisis ni rate limit`);
    return {
      cached: true,
      fullName,
      skillScores: existing.skillScores,
      filesAnalyzed: existing.filesAnalyzed ?? 0,
      parsedLanguages: existing.parsedLanguages ?? {},
    };
  }
  console.log(
    `[github/evaluate] cache miss ${fullName}: ${existing.lastCommitSHA.slice(0, 7)} → ${currentSHA?.slice(0, 7) || "unknown"}`,
  );
  return null;
}

/** Etapa del análisis en la que falló, para clasificar el error. */
function errorStage(err: unknown): AnalysisStage {
  if (err instanceof GithubApiError) return err.stage as AnalysisStage;
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message.toLowerCase();
  if (msg.includes("firestore") || msg.includes("firebase")) return "save_evidence";
  if (msg.includes("parse") || msg.includes("syntax")) return "parse_files";
  return "unknown";
}
