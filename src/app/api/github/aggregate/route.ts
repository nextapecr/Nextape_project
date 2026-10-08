import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { GithubSignalsService } from "@/services/github-signals.service";
import { aggregateRepoEvidence, sameSkillScores } from "@/services/github-engine/aggregate";
import { consumeRateLimit, GITHUB_RATE_LIMITS, rateLimitedResponse } from "@/lib/server/rate-limit";
import {
  GITHUB_ENGINE_VERSION,
  GITHUB_USERNAME_PATTERN,
} from "@/services/github-engine/evidence-keys";
import { generateGithubFeedback } from "@/ai/flows/generate-github-feedback-flow";
import type {
  EngineMetrics,
  GithubAggregateResponse,
  GithubEvidence,
  GithubIdentity,
  GithubRepoEvidence,
  GithubRepoSummary,
  RepoSignals,
} from "@/types/github.types";

export const runtime = "nodejs";

/**
 * ¿La cuenta de GitHub analizada es la del usuario?
 *
 * Solo se puede afirmar cuando inició sesión con GitHub: Firebase guarda el id numérico de esa
 * cuenta y se compara con el de `githubUsername`. En cualquier otro caso queda "sin verificar" —no
 * se bloquea el análisis, pero la evidencia no se presenta como propia comprobada.
 */
async function resolveIdentity(uid: string, githubUsername: string): Promise<GithubIdentity> {
  try {
    const user = await adminAuth().getUser(uid);
    const provider = user.providerData.find((p) => p.providerId === "github.com");
    if (!provider) return { verified: false, method: null, linkedLogin: null };
    const githubId = await GithubSignalsService.getUserId(githubUsername);
    const verified = githubId !== null && String(githubId) === provider.uid;
    return {
      verified,
      method: "github_oauth",
      // Si la sesión está vinculada a OTRA cuenta, se dice cuál para que el usuario analice la suya.
      linkedLogin: verified ? githubUsername : await GithubSignalsService.getLoginById(provider.uid),
    };
  } catch (err) {
    console.warn("[github/aggregate] no se pudo resolver la identidad:", err instanceof Error ? err.message : err);
    return { verified: false, method: null, linkedLogin: null };
  }
}

function weightedMean(values: Array<{ value: number | null | undefined; weight: number }>): number | null {
  let sum = 0;
  let weights = 0;
  for (const { value, weight } of values) {
    if (value === null || value === undefined || !Number.isFinite(value) || weight <= 0) continue;
    sum += value * weight;
    weights += weight;
  }
  return weights > 0 ? Math.round(sum / weights) : null;
}

function topKey(counts: Record<string, number> | undefined): string | null {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * POST /api/github/aggregate
 * Combina la evidencia de todos los repositorios ya analizados de una cuenta en un único perfil,
 * pide UNA lectura a Groq GPT-OSS (a partir de números, nunca de código) y lo guarda en
 * `github_evidence/{uid}`, el documento que consumen el roadmap y el tamaño de The LINE.
 *
 * Body: { githubUsername: string }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const githubUsername = typeof body?.githubUsername === "string" ? body.githubUsername.trim() : "";
  if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
    return NextResponse.json({ error: "invalid_github_username" }, { status: 400 });
  }

  try {
    const limit = await consumeRateLimit(adminDb(), "github_aggregate", uid, GITHUB_RATE_LIMITS.aggregate);
    if (!limit.allowed) return rateLimitedResponse(limit);

    const profileRef = adminDb().collection("github_evidence").doc(uid);
    // Defensa en profundidad: limita a 100 repos aunque /api/github/repos ya poda a ese máximo.
    // Protege contra race conditions o fallos en la poda upstream.
    const [snap, previousSnap] = await Promise.all([
      profileRef.collection("repos").limit(100).get(),
      profileRef.get(),
    ]);
    const repos = snap.docs
      .map((doc) => doc.data() as GithubRepoEvidence)
      .filter(
        (r) =>
          r.githubUsername?.toLowerCase() === githubUsername.toLowerCase() &&
          r.engineVersion === GITHUB_ENGINE_VERSION,
      );

    if (repos.length === 0) {
      return NextResponse.json({ error: "no_repos_analyzed" }, { status: 404 });
    }

    const aggregated = aggregateRepoEvidence(
      repos.map((r) => ({
        fullName: r.fullName,
        skillScores: r.skillScores,
        filesAnalyzed: r.filesAnalyzed ?? 0,
        languagesBytes: r.repoSignals?.languages ?? {},
        parsedLanguages: r.parsedLanguages ?? {},
      })),
    );

    const scores = aggregated.skillScores;
    // Mismos scores que el perfil guardado → su lectura sigue valiendo: no se paga otra llamada a Mistral
    // (p. ej. al volver a analizar sin cambios, o al verificar la cuenta).
    const previous = previousSnap.data() as GithubEvidence | undefined;
    const reusableFeedback =
      previous?.aiFeedback &&
      previous.githubUsername?.toLowerCase() === githubUsername.toLowerCase() &&
      sameSkillScores(previous.skillScores, scores)
        ? previous.aiFeedback
        : null;

    const [aiFeedback, identity] = await Promise.all([
      reusableFeedback ??
      generateGithubFeedback({
        architecture: scores.architecture,
        testing: scores.testing,
        security: scores.security,
        maintainability: scores.maintainability,
        documentation: scores.documentation,
        overall: scores.overall,
        topWeaknesses: scores.topWeaknesses,
      }),
      resolveIdentity(uid, githubUsername),
    ]);

    const withCode = repos.filter((r) => r.skillScores.hasASTData && (r.filesAnalyzed ?? 0) > 0);

    const repoSummaries: GithubRepoSummary[] = repos
      .map((r) => ({
        fullName: r.fullName,
        // Sin código analizable no hay nota técnica del repo: se muestra como tal, no como un número.
        overall: r.skillScores.hasASTData ? r.skillScores.overall : null,
        hasASTData: r.skillScores.hasASTData,
        filesAnalyzed: r.filesAnalyzed ?? 0,
        mainLanguage: topKey(r.repoSignals?.languages),
        isPrivate: r.isPrivate, // Phase 4: Include private flag
      }))
      .sort((a, b) => b.filesAnalyzed - a.filesAnalyzed);

    const metrics: EngineMetrics = {
      complexityScore: weightedMean(
        withCode.map((r) => ({ value: r.metrics?.complexityScore, weight: r.filesAnalyzed })),
      ),
      couplingScore: weightedMean(
        withCode.map((r) => ({ value: r.metrics?.couplingScore, weight: r.filesAnalyzed })),
      ),
      deadCodeScore: null,
      testingScore: scores.testing,
      documentationScore: scores.documentation,
    };

    // Señales agregadas de la cuenta (no de un repositorio concreto, de ahí repo "*").
    const repoSignals: RepoSignals = {
      owner: githubUsername,
      repo: "*",
      lastCommitSHA: "",
      commitFrequency90d: repos.reduce((n, r) => n + (r.repoSignals?.commitFrequency90d ?? 0), 0),
      languages: aggregated.languagesBytes,
      hasTests: repos.some((r) => r.repoSignals?.hasTests),
      hasCI: repos.some((r) => r.repoSignals?.hasCI),
      hasReadme: repos.some((r) => r.repoSignals?.hasReadme),
      readmeLength: Math.max(0, ...repos.map((r) => r.repoSignals?.readmeLength ?? 0)),
      sizeKB: repos.reduce((n, r) => n + (r.repoSignals?.sizeKB ?? 0), 0),
      stargazersCount: repos.reduce((n, r) => n + (r.repoSignals?.stargazersCount ?? 0), 0),
    };

    const evidence: GithubEvidence = {
      uid,
      githubUsername,
      analyzedRepo: `${aggregated.reposAnalyzed} repositorios`,
      lastCommitSHA: "",
      repoSignals,
      metrics,
      skillScores: scores,
      aiFeedback,
      analyzedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
      engineVersion: GITHUB_ENGINE_VERSION,
      reposAnalyzed: aggregated.reposAnalyzed,
      reposWithCode: aggregated.reposWithCode,
      filesAnalyzed: aggregated.filesAnalyzed,
      languagesBytes: aggregated.languagesBytes,
      parsedLanguages: aggregated.parsedLanguages,
      repos: repoSummaries,
      identity,
    };

    // Sin merge: el perfil agregado sustituye por completo al de la etapa de un solo repositorio.
    await profileRef.set(evidence);

    const response: GithubAggregateResponse = {
      reposAnalyzed: aggregated.reposAnalyzed,
      reposWithCode: aggregated.reposWithCode,
      filesAnalyzed: aggregated.filesAnalyzed,
      skillScores: scores,
      aiFeedback,
      languagesBytes: aggregated.languagesBytes,
      parsedLanguages: aggregated.parsedLanguages,
      repos: repoSummaries,
      identity,
      analyzedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[github/aggregate] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
