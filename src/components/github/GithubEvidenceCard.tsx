"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Github,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiPost } from "@/lib/api";
import { connectGithubOAuth } from "@/lib/firebase/auth";
import { useGithubOAuthStatus } from "@/hooks/use-github-oauth-status";
import { GithubEvidenceService } from "@/services/github-evidence.service";
import type {
  GithubAggregateResponse,
  GithubAIFeedback,
  GithubEvidence,
  GithubIdentity,
  GithubRepoListResponse,
  GithubRepoSummary,
  GithubSkillScores,
} from "@/types/github.types";

/**
 * Evidencia técnica de GitHub a partir de TODOS los repositorios de la cuenta.
 *
 * El análisis va repositorio a repositorio desde aquí (cada petición cabe en el tiempo de una
 * Netlify Function) y al final se combina en un perfil. Los repositorios sin cambios desde el último
 * análisis se saltan, así que repetirlo es rápido.
 *
 * Disparo SIEMPRE manual: al montarse solo se lee el último perfil guardado. Analizar consume cuota
 * de la API de GitHub y una llamada a Mistral.
 *
 * La evidencia solo acorta The LINE si la cuenta está verificada (vinculada por OAuth a la sesión):
 * el usuario se escribe a mano y podría ser el de otra persona. De ahí el botón «Verificar con GitHub».
 */

/** Repositorios analizados a la vez. */
const REPO_CONCURRENCY = 3;
/** Lenguajes y repositorios mostrados antes de resumir el resto. */
const MAX_LANGUAGES_SHOWN = 8;
const MAX_REPOS_SHOWN = 12;

interface ProfileView {
  githubUsername: string;
  /** null = perfil antiguo, de un solo repositorio. */
  reposAnalyzed: number | null;
  reposWithCode: number | null;
  filesAnalyzed: number | null;
  legacyRepo: string | null;
  skillScores: GithubSkillScores;
  aiFeedback: GithubAIFeedback | null;
  languagesBytes: Record<string, number>;
  repos: GithubRepoSummary[];
  identity: GithubIdentity | null;
  analyzedAt: string | null;
}

interface RunState {
  total: number;
  done: number;
  current: string | null;
  failed: string[];
}

/** Extrae el usuario de una URL de GitHub (`https://github.com/foo` → `foo`). */
export function parseGithubUsername(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  const match = trimmed.match(/github\.com\/([^/?#]+)/i);
  return (match ? match[1] : trimmed).trim();
}

/** Fecha legible tolerando Timestamp de Firestore, forma serializada o ISO. */
function formatAnalyzedAt(value: unknown): string | null {
  if (!value) return null;
  let ms: number | null = null;
  if (typeof value === "string") ms = Date.parse(value);
  else if (typeof value === "object") {
    const v = value as { seconds?: number; _seconds?: number; toDate?: () => Date };
    if (typeof v.toDate === "function") ms = v.toDate().getTime();
    else if (typeof v.seconds === "number") ms = v.seconds * 1000;
    else if (typeof v._seconds === "number") ms = v._seconds * 1000;
  }
  if (ms === null || Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

function fromEvidence(e: GithubEvidence): ProfileView {
  const multi = typeof e.reposAnalyzed === "number";
  return {
    githubUsername: e.githubUsername ?? "",
    reposAnalyzed: multi ? (e.reposAnalyzed ?? 0) : null,
    reposWithCode: multi ? (e.reposWithCode ?? 0) : null,
    filesAnalyzed: multi ? (e.filesAnalyzed ?? 0) : null,
    legacyRepo: multi ? null : e.analyzedRepo,
    skillScores: e.skillScores,
    aiFeedback: e.aiFeedback,
    languagesBytes: e.languagesBytes ?? e.repoSignals?.languages ?? {},
    repos: e.repos ?? [],
    identity: e.identity ?? null,
    analyzedAt: formatAnalyzedAt(e.analyzedAt),
  };
}

function fromAggregate(r: GithubAggregateResponse, githubUsername: string): ProfileView {
  return {
    githubUsername,
    reposAnalyzed: r.reposAnalyzed,
    reposWithCode: r.reposWithCode,
    filesAnalyzed: r.filesAnalyzed,
    legacyRepo: null,
    skillScores: r.skillScores,
    aiFeedback: r.aiFeedback,
    languagesBytes: r.languagesBytes,
    repos: r.repos,
    identity: r.identity,
    analyzedAt: formatAnalyzedAt(r.analyzedAt),
  };
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

const ERROR_MESSAGES: Record<string, (user: string) => string> = {
  github_user_not_found: (u) => `No existe la cuenta de GitHub "${u}".`,
  no_repos_found: (u) => `"${u}" no tiene repositorios propios con código (se excluyen forks y archivados).`,
  invalid_github_username: () => "Ese nombre de usuario de GitHub no es válido.",
  no_repos_analyzed: () => "No se pudo analizar ningún repositorio. Inténtalo de nuevo en unos minutos.",
  rate_limited: () => "Has lanzado demasiados análisis en poco tiempo. Espera unos minutos y vuelve a intentarlo.",
};

export function GithubEvidenceCard({ uid, githubUrl }: { uid: string; githubUrl?: string }) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  
  // Check OAuth status
  const oauthStatus = useGithubOAuthStatus(uid);
  
  // Username comes from OAuth, no manual input
  const username = oauthStatus?.githubUsername || "";

  // Solo lectura del último perfil. No analiza.
  useEffect(() => {
    let cancelled = false;
    GithubEvidenceService.getEvidence(uid)
      .then((stored) => {
        if (cancelled || !stored) return;
        setProfile(fromEvidence(stored));
      })
      .catch((err) => console.error("[GithubEvidenceCard] no se pudo leer la evidencia previa:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /**
   * Connect GitHub with OAuth (Phase 2).
   * Opens OAuth popup, captures token, stores on server.
   */
  const handleConnectOAuth = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connectGithubOAuth();
      setNotice(`Conectado exitosamente con GitHub`);
      // Trigger re-check of OAuth status
      window.location.reload();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : err instanceof Error
            ? err.message
            : "";
      
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User closed popup, no error needed
        return;
      }
      
      if (code === "no_access_token") {
        setError("No se pudo obtener el token de acceso de GitHub. Inténtalo de nuevo.");
      } else if (code === "incomplete_profile") {
        setError("No se pudo obtener tu información de GitHub. Inténtalo de nuevo.");
      } else {
        setError("No se pudo conectar con GitHub. Inténtalo de nuevo.");
      }
    } finally {
      setConnecting(false);
    }
  };

  /**
   * Disconnect GitHub OAuth.
   * Revokes token on server and locally.
   */
  const handleDisconnectOAuth = async () => {
    if (!confirm("¿Seguro que quieres desconectar tu cuenta de GitHub? Tendrás que volver a conectarla para analizar tus repositorios.")) {
      return;
    }
    
    setDisconnecting(true);
    setError(null);
    try {
      await apiPost("/api/github/oauth/revoke", {});
      setNotice("Cuenta de GitHub desconectada exitosamente.");
      // Trigger re-check of OAuth status
      window.location.reload();
    } catch (err) {
      setError("No se pudo desconectar la cuenta de GitHub. Inténtalo de nuevo.");
    } finally {
      setDisconnecting(false);
    }
  };

  const analyzeAll = async () => {
    const user = username.trim();
    if (!user) {
      setError("No se pudo obtener tu usuario de GitHub. Intenta desconectar y volver a conectar.");
      return;
    }
    setError(null);
    setNotice(null);
    setRun({ total: 0, done: 0, current: "Buscando tus repositorios", failed: [] });

    try {
      const { repos, totalRepos } = await apiPost<GithubRepoListResponse>("/api/github/repos", {
        githubUsername: user,
      });

      const pending = repos.filter((r) => !r.analyzed);
      const failed: string[] = [];
      let done = repos.length - pending.length;
      // Con el límite por usuario agotado, cada llamada restante fallaría igual: se para.
      let rateLimited = false;
      setRun({ total: repos.length, done, current: null, failed });

      await runWithConcurrency(pending, REPO_CONCURRENCY, async (repo) => {
        if (rateLimited) return;
        setRun((prev) => (prev ? { ...prev, current: repo.fullName } : prev));
        try {
          await apiPost("/api/github/evaluate", { githubUsername: user, repoName: repo.fullName });
        } catch (err) {
          if (err instanceof Error && err.message === "rate_limited") rateLimited = true;
          failed.push(repo.fullName);
        }
        done += 1;
        setRun((prev) => (prev ? { ...prev, done, failed: [...failed] } : prev));
      });

      // Sin combinar: un perfil a medias sustituiría al último completo.
      if (rateLimited) throw new Error("rate_limited");

      setRun((prev) => (prev ? { ...prev, current: "Combinando resultados" } : prev));
      const aggregate = await apiPost<GithubAggregateResponse>("/api/github/aggregate", {
        githubUsername: user,
      });
      setProfile(fromAggregate(aggregate, user));

      if (totalRepos > repos.length) {
        setNotice(`Se analizaron tus ${repos.length} repositorios con actividad más reciente (de ${totalRepos}).`);
      }
      if (failed.length > 0) {
        const shown = failed.slice(0, 4).join(", ");
        setError(
          `No se pudieron analizar ${failed.length} repositorios (${shown}${failed.length > 4 ? "…" : ""}). ` +
            "El perfil se calculó con el resto."
        );
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        ERROR_MESSAGES[code]?.(user) ?? "No se pudo completar el análisis. Inténtalo de nuevo en unos minutos."
      );
    } finally {
      setRun(null);
    }
  };

  /**
   * DEPRECATED: Legacy function kept for backwards compatibility.
   * New users should use handleConnectOAuth instead.
   */
  const verifyWithGithub = async () => {
    await handleConnectOAuth();
  };

  const running = run !== null;
  const hasOAuth = oauthStatus?.hasToken ?? false;
  const canAnalyze = hasOAuth;

  return (
    <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-apple border border-gray-50 space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center">
            <Github className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold italic">Evidencia de GitHub.</h2>
          <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-md">
            Analizamos todos tus repositorios propios, en cualquiera de los 20 lenguajes que lee el motor.
          </p>
        </div>
        {profile?.analyzedAt && (
          <div className="text-right">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-300">
              Último análisis
            </span>
            <span className="text-xs font-medium text-gray-500">{profile.analyzedAt}</span>
          </div>
        )}
      </header>

      {/* OAuth Connection Status */}
      {oauthStatus && !hasOAuth && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-brand-blue/5 p-5 border-2 border-brand-blue/20">
          <div className="space-y-1">
            <p className="text-sm font-bold text-black">
              Conecta tu cuenta de GitHub para analizar tus repositorios
            </p>
            <p className="text-xs font-medium text-gray-600 leading-relaxed">
              Necesitamos acceso a tus repos para analizarlos. Tu código nunca se guarda, solo se analizan las métricas de calidad.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleConnectOAuth}
            disabled={connecting}
            className="shrink-0 h-12 rounded-xl bg-black text-white text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
          >
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <Github className="mr-2 h-4 w-4" />
                Conectar con GitHub
              </>
            )}
          </Button>
        </div>
      )}

      {/* OAuth Connected - Show Disconnect Button */}
      {hasOAuth && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-brand-green/5 p-5 border border-brand-green/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-brand-green" />
            <div>
              <p className="text-sm font-bold text-black">
                Conectado como {oauthStatus?.githubUsername ? `@${oauthStatus.githubUsername}` : 'GitHub'}
              </p>
              <p className="text-xs font-medium text-gray-600">
                Listo para analizar tus repositorios
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleDisconnectOAuth}
            disabled={disconnecting || running}
            variant="outline"
            className="shrink-0 h-10 rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
          >
            {disconnecting ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Desconectando...
              </>
            ) : (
              "Desconectar GitHub"
            )}
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-brand-red/5 text-brand-red rounded-2xl p-4 text-xs font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {notice && <p className="text-[11px] text-gray-400 font-medium">{notice}</p>}

      {run && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex justify-between gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <span className="shrink-0">
              {run.total > 0 ? `Analizando ${run.done} de ${run.total}` : "Preparando"}
            </span>
            <span className="truncate normal-case tracking-normal font-medium">{run.current}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all duration-500"
              style={{ width: `${run.total > 0 ? Math.round((run.done / run.total) * 100) : 4}%` }}
            />
          </div>
        </div>
      )}

      <Button
        onClick={() => analyzeAll()}
        disabled={!canAnalyze || running || loading || connecting || disconnecting}
        className="w-full h-14 bg-black text-white rounded-2xl font-bold uppercase tracking-widest text-[11px] shadow-apple disabled:opacity-40 disabled:cursor-not-allowed"
        title={!hasOAuth ? "Conecta tu cuenta de GitHub primero" : undefined}
      >
        {running ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizando repositorios
          </>
        ) : !hasOAuth ? (
          <>
            <ShieldQuestion className="mr-2 h-4 w-4" />
            Conecta GitHub para analizar
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            {profile ? "Volver a analizar mi GitHub" : "Analizar todos mis repositorios"}
          </>
        )}
      </Button>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
        </div>
      ) : profile ? (
        <ProfileResult
          profile={profile}
          busy={running || connecting}
          onVerify={verifyWithGithub}
        />
      ) : (
        <p className="text-xs text-gray-400 text-center font-medium">Aún no has analizado tu GitHub.</p>
      )}
    </div>
  );
}

function ProfileResult({
  profile,
  busy,
  onVerify,
}: {
  profile: ProfileView;
  busy: boolean;
  onVerify: () => void;
}) {
  const s = profile.skillScores;
  const totalBytes = Object.values(profile.languagesBytes).reduce((n, v) => n + v, 0);
  const languages = Object.entries(profile.languagesBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LANGUAGES_SHOWN);

  return (
    <div className="space-y-8 pt-4 border-t border-gray-50">
      <div className="flex flex-wrap items-center gap-2">
        {profile.reposAnalyzed !== null ? (
          <>
            <Badge className="bg-gray-900 text-white border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest">
              {profile.reposAnalyzed} repositorios
            </Badge>
            <Badge className="bg-gray-100 text-gray-600 border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest">
              {profile.reposWithCode} con código analizable · {profile.filesAnalyzed} archivos
            </Badge>
          </>
        ) : (
          <Badge className="bg-brand-orange/10 text-brand-orange border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest">
            <AlertTriangle className="h-3 w-3 mr-1.5" /> Análisis anterior: solo {profile.legacyRepo}
          </Badge>
        )}
        {profile.identity?.verified ? (
          <Badge className="bg-brand-green/10 text-brand-green border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest">
            <ShieldCheck className="h-3 w-3 mr-1.5" /> Cuenta verificada con GitHub
          </Badge>
        ) : profile.identity ? (
          <Badge
            title="Inicia sesión con GitHub para vincular esta cuenta a tu perfil"
            className="bg-gray-100 text-gray-500 border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest"
          >
            <ShieldQuestion className="h-3 w-3 mr-1.5" /> Cuenta sin verificar
          </Badge>
        ) : null}
        {!s.hasASTData && (
          <Badge className="bg-brand-orange/10 text-brand-orange border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest">
            <AlertTriangle className="h-3 w-3 mr-1.5" /> Sin código analizable
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <ScoreTile label="Global" value={s.overall} highlight />
        <ScoreTile label="Arquitectura" value={s.architecture} />
        <ScoreTile label="Seguridad" value={s.security} />
        <ScoreTile label="Mantenibilidad" value={s.maintainability} />
        <ScoreTile label="Testing" value={s.testing} />
        <ScoreTile label="Documentación" value={s.documentation} />
      </div>

      {languages.length > 0 && totalBytes > 0 && (
        <section className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Lenguajes en tus repositorios</h3>
          <ul className="space-y-2">
            {languages.map(([name, bytes]) => {
              const pct = Math.max(1, Math.round((bytes / totalBytes) * 100));
              return (
                <li key={name} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-xs font-medium">
                  <span className="truncate text-gray-600">{name}</span>
                  <span className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <span className="block h-full bg-brand-blue rounded-full" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right text-gray-400">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {profile.repos.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Repositorios analizados</h3>
          <ul className="divide-y divide-gray-50">
            {profile.repos.slice(0, MAX_REPOS_SHOWN).map((repo) => (
              <li key={repo.fullName} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-bold truncate">{repo.fullName}</p>
                  <p className="text-gray-400">
                    {repo.mainLanguage ?? "Lenguaje desconocido"} · {repo.filesAnalyzed} archivos
                  </p>
                </div>
                {repo.overall !== null ? (
                  <span className="shrink-0 font-black italic text-lg">{repo.overall}</span>
                ) : (
                  <span className="shrink-0 text-[10px] font-bold text-gray-400">Sin código analizable</span>
                )}
              </li>
            ))}
          </ul>
          {profile.repos.length > MAX_REPOS_SHOWN && (
            <p className="text-[11px] text-gray-400 font-medium">
              y {profile.repos.length - MAX_REPOS_SHOWN} repositorios más.
            </p>
          )}
        </section>
      )}

      {profile.aiFeedback ? (
        <div className="bg-gray-50 rounded-[2rem] p-8 space-y-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-purple" />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Lectura del evaluador
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed text-gray-700">{profile.aiFeedback.feedback}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeedbackList title="Fortalezas" items={profile.aiFeedback.strengths} tone="green" />
            <FeedbackList title="A mejorar" items={profile.aiFeedback.improvements} tone="orange" />
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[11px] text-gray-400 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          La lectura escrita del evaluador no está disponible ahora; los scores son el resultado del
          análisis de tu código.
        </p>
      )}
    </div>
  );
}

/**
 * `null` significa "no analizable", NO cero: pintar un número convertiría un "no lo sé" en un
 * juicio sobre el candidato.
 */
function ScoreTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 ${highlight ? "bg-brand-blue text-white" : "bg-gray-50"}`}>
      <span
        className={`block text-[9px] font-black uppercase tracking-widest mb-2 ${
          highlight ? "text-white/60" : "text-gray-300"
        }`}
      >
        {label}
      </span>
      {value !== null ? (
        <span className="text-3xl font-black italic tracking-tighter">{value}</span>
      ) : (
        <span
          className={`text-xs font-bold ${highlight ? "text-white/70" : "text-gray-400"}`}
          title="No hay código analizable para esta dimensión"
        >
          No analizable
        </span>
      )}
    </div>
  );
}

function FeedbackList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "orange" }) {
  if (items.length === 0) return null;
  const dot = tone === "green" ? "bg-brand-green" : "bg-brand-orange";
  return (
    <div className="space-y-3">
      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{title}</span>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-xs font-medium text-gray-600 leading-relaxed">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
