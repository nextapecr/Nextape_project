"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { findTechnology } from "@/lib/technologies";
import { cn } from "@/lib/utils";
import { LEVEL_LABELS } from "@/lib/levels";
import { Terminal, Cpu, Loader2, CheckCircle2, AlertCircle, Timer } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { apiPost, apiGet, ApiError } from "@/lib/api";
import { JobService } from "@/services/jobs.service";
import { QuestionCard, QuestionTypeBadge } from "@/components/line/QuestionCard";
import type { Answer, PublicQuestion } from "@/types/question.types";

/** Tiempo por defecto de una prueba (debe coincidir con `PRACTICE_TIME_LIMIT_MINUTES` del servidor). */
const DEFAULT_TIME_LIMIT_MINUTES = 30;

/** Peso de cada nivel en el DNA. Solo para explicarlo en pantalla: el cálculo es del servidor. */
const LEVEL_WEIGHT_LABELS: Record<string, string> = { junior: "×0.6", mid: "×0.8", senior: "×1" };

/** "1:05:09" / "29:59". */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "14 h 5 min" / "35 min". */
function formatWait(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

interface CombinedInfo {
  technologies: string[];
  level: string | null;
  covered: string[];
  uncovered: string[];
  theoryAvailable: boolean;
  plan: { theory: number; technologies: number };
  retryAt: number | null;
}

interface SubmitResult {
  overall: number;
  skillScores: Record<string, number>;
  dnaScores: Record<string, number>;
  level: string | null;
  levelWeight: number;
}

function LineContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  
  const [status, setStatus] = useState<"idle" | "loading" | "active" | "finished">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  // La forma de cada respuesta depende del tipo de su pregunta (índice, booleano o array).
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<SubmitResult | null>(null);
  /** El tiempo se agotó y la prueba se envió sola. */
  const [timedOut, setTimedOut] = useState(false);
  /** Momento (reloj local) en que se acaba el tiempo, y segundos que quedan. */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  /** Evita enviar dos veces (al responder la última pregunta y al agotarse el tiempo a la vez). */
  const submittingRef = useRef(false);
  /** Respuestas actuales, para el envío automático desde el temporizador. */
  const answersRef = useRef<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Prueba combinada (sin vacante): el candidato NO elige tecnología ni nivel. El servidor arma
   * ~70 % de sus tecnologías del perfil + ~30 % de teoría de ingeniería de software, al nivel que
   * declaró. Aquí solo se muestra qué va a entrar y qué falta.
   */
  const [combined, setCombined] = useState<CombinedInfo | null>(null);

  /** Tamaño del examen antes de empezar: 10 con GitHub analizado, 20 sin él (lo decide el servidor). */
  const [examInfo, setExamInfo] = useState<{ examSize: number; hasGithub: boolean } | null>(null);
  /** Minutos de la prueba: 30 en práctica, o los que fije la vacante. */
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(DEFAULT_TIME_LIMIT_MINUTES);
  /** Horas entre intentos de una misma tecnología, y cuándo vuelve a estar libre cada una. */
  const [cooldownHours, setCooldownHours] = useState(24);
  /** Cuándo vuelve a estar disponible la prueba combinada (epoch ms), si ya se hizo hoy. */
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [loadingLabel, setLoadingLabel] = useState("Preparando tu prueba");

  useEffect(() => {
    if (jobId) {
      // La prueba de una vacante usa su propio repertorio; solo hace falta su tiempo límite
      // (la vacante es de lectura pública).
      JobService.getJob(jobId)
        .then((job) => {
          const t = job?.examTimeLimitMinutes;
          if (typeof t === "number" && t > 0) setTimeLimitMinutes(t);
        })
        .catch((err) => console.error("[line] no se pudo leer la vacante:", err));
      return;
    }
    apiGet<{
      combined: CombinedInfo;
      examSize: number;
      hasGithub: boolean;
      timeLimitMinutes?: number;
      cooldownHours?: number;
    }>("/api/line/catalog")
      .then((res) => {
        setCombined(res.combined);
        setRetryAt(res.combined?.retryAt ?? null);
        setExamInfo({ examSize: res.examSize, hasGithub: res.hasGithub });
        if (res.timeLimitMinutes) setTimeLimitMinutes(res.timeLimitMinutes);
        if (typeof res.cooldownHours === "number") setCooldownHours(res.cooldownHours);
      })
      .catch((err) => console.error("[line] no se pudo cargar tu prueba:", err));
  }, [jobId]);

  /** Milisegundos hasta poder volver a hacer la prueba (0 = disponible). */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const waitMs = !jobId && retryAt ? Math.max(0, retryAt - now) : 0;
  /** Sin vacante, hace falta nivel en el perfil y al menos una tecnología con preguntas (o teoría). */
  const setupMissing = jobId ? null : missingSetup(combined);

  /**
   * Bloquea el scroll del documento mientras el examen ocupa la pantalla.
   *
   * Sin esto la página sigue desplazándose DETRÁS del overlay. En móvil, al desplazarse la barra
   * de direcciones del navegador colapsa, el viewport cambia de altura y un elemento `fixed` queda
   * momentáneamente descuadrado: se ve una franja del fondo del `body` (#F5F5F7, gris claro) por
   * la parte superior. De ahí el "se corta arriba y se ve el fondo de detrás".
   */
  useEffect(() => {
    if (status !== "active") return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [status]);

  const startSimulation = async () => {
    setLoadingLabel("Preparando tu prueba");
    setStatus("loading");
    setError(null);
    setResult(null);
    setTimedOut(false);
    setAnswers([]);
    answersRef.current = [];
    submittingRef.current = false;
    setCurrentQIndex(0);
    try {
      // Las preguntas se sortean EN SERVIDOR de un repertorio ya existente y llegan SIN la
      // respuesta correcta.
      // Sin vacante no se manda tecnología ni nivel: el servidor los toma del perfil.
      const payload = jobId ? { jobId } : {};
      const data = await apiPost<{
        sessionId: string;
        questions: PublicQuestion[];
        timeLimitSeconds?: number;
        timeLimitMinutes?: number;
      }>("/api/line/start", payload);

      if (!data.questions || data.questions.length === 0) {
        setError("No se pudieron generar las preguntas. Inténtalo de nuevo en unos segundos.");
        setStatus("idle");
        return;
      }

      setSessionId(data.sessionId);
      setQuestions(data.questions);
      // El reloj cuenta en local desde ahora; el servidor tiene su propio vencimiento.
      const seconds = data.timeLimitSeconds ?? timeLimitMinutes * 60;
      if (data.timeLimitMinutes) setTimeLimitMinutes(data.timeLimitMinutes);
      setDeadline(Date.now() + seconds * 1000);
      setRemaining(seconds);
      setStatus("active");
    } catch (err) {
      console.error("Simulation failed to start:", err);
      const failure = describeStartError(err, { jobId, cooldownHours });
      if (failure.retryAt) setRetryAt(failure.retryAt);
      setError(failure.message);
      setStatus("idle");
    }
  };

  const finishSimulation = useCallback(
    async (finalAnswers: Answer[]) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setDeadline(null);
      setLoadingLabel("Calculando tu resultado");
      setStatus("loading");
      try {
        // La corrección y la escritura del DNA ocurren EN SERVIDOR (no falsificable en cliente).
        const data = await apiPost<SubmitResult>("/api/line/submit", {
          sessionId,
          answers: finalAnswers,
        });
        setResult(data);
        setStatus("finished");
      } catch (err) {
        console.error("Failed to submit simulation:", err);
        const code = err instanceof ApiError ? err.code : "";
        setError(
          code === "session_expired"
            ? "Se acabó el tiempo de la prueba antes de poder enviarla. El intento se contó igual."
            : "No se pudo calcular el resultado. Inténtalo de nuevo."
        );
        setStatus("idle");
      }
    },
    [sessionId]
  );

  /**
   * Temporizador. Al llegar a 0 envía lo respondido; las preguntas que faltan van como `null`
   * (sin responder) y cuentan como falladas. El servidor también lo hace cumplir.
   */
  useEffect(() => {
    if (status !== "active" || deadline === null) return;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        const padded: Answer[] = questions.map((_, i) => answersRef.current[i] ?? null);
        setTimedOut(true);
        void finishSimulation(padded);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, deadline, questions, finishSimulation]);

  const handleAnswer = async (answer: Answer) => {
    if (submittingRef.current) return;
    const updatedAnswers = [...answers, answer];
    setAnswers(updatedAnswers);
    answersRef.current = updatedAnswers;

    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex((i) => i + 1);
    } else {
      await finishSimulation(updatedAnswers);
    }
  };

  if (status === "loading") {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-brand-blue/10 rounded-3xl flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-blue" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-xl font-bold italic">{loadingLabel}.</p>
          <p className="text-sm text-gray-400 uppercase tracking-widest font-bold">Un momento</p>
        </div>
      </div>
    );
  }

  if (status === "finished") return <FinishedView result={result} timedOut={timedOut} />;

  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-black italic">The LINE.</h1>
        <p className="text-gray-500 font-medium text-sm">Evaluación técnica generada por IA para tu stack específico.</p>
      </header>

      {status === "idle" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-apple border border-gray-50 space-y-10">
            <div className="space-y-4">
               <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
                  <Cpu className="h-7 w-7 text-brand-blue" />
               </div>
               <h2 className="text-2xl font-bold italic">Configuración Neural.</h2>
               <p className="text-sm text-gray-400 font-medium leading-relaxed">
                 {jobId ? "Simulación personalizada para la vacante seleccionada." : "Prepara el entorno de simulación basado en tu perfil digital."}
               </p>
            </div>

            <div className="space-y-6">
              {!jobId && combined && <CombinedPlan combined={combined} setupMissing={setupMissing} />}

              {!jobId && examInfo && (
                <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl text-xs font-medium text-gray-500">
                  <GithubIcon className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                  <p className="leading-relaxed">
                    Tu prueba tendrá <span className="font-bold text-black">{examInfo.examSize} preguntas</span>.{" "}
                    {examInfo.hasGithub ? (
                      "Tu GitHub analizado aporta el resto de la evidencia."
                    ) : (
                      <>
                        Con tu GitHub analizado y verificado serían 10.{" "}
                        <Link href="/dashboard/github" className="font-bold text-brand-blue">
                          Analizar GitHub
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              )}

              <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl text-xs font-medium text-gray-500">
                <Timer className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                <p className="leading-relaxed">
                  Tendrás <span className="font-bold text-black">{timeLimitMinutes} minutos</span>. Al
                  acabarse el tiempo la prueba se envía sola. Puedes hacer 1 intento cada {cooldownHours} h{" "}
                  {jobId ? "por vacante" : "en The LINE"}, y el intento cuenta desde que empiezas.
                </p>
              </div>

              {waitMs > 0 && (
                <div className="flex items-center gap-2 text-brand-orange text-xs font-bold bg-brand-orange/5 p-4 rounded-xl">
                  <AlertCircle className="h-4 w-4 shrink-0" /> Ya hiciste tu prueba de hoy. Disponible en {formatWait(waitMs)}.
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-brand-red text-xs font-bold bg-brand-red/5 p-4 rounded-xl">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <Button
                onClick={startSimulation}
                disabled={waitMs > 0 || setupMissing !== null || (!jobId && !combined)}
                className="w-full h-16 bg-black text-white rounded-2xl text-base font-bold shadow-apple uppercase tracking-widest hover:scale-[1.02] transition-transform"
              >
                Iniciar Sincronización
              </Button>
            </div>
          </div>

          <div className="bg-brand-blue p-12 rounded-[2.5rem] text-white flex flex-col justify-center space-y-6 shadow-apple-lg relative overflow-hidden">
             <h3 className="text-4xl font-black italic tracking-tighter leading-none">Validación Dinámica.</h3>
             <p className="text-lg opacity-80 font-medium leading-relaxed">No evaluamos lo que sabes, sino cómo resuelves bajo presión técnica real.</p>
             <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          </div>
        </div>
      ) : (
        /* El scroll vive en el overlay, NO en la tarjeta.
           1) `justify-center` con contenido más alto que la pantalla desborda hacia ARRIBA y
              recorta la cabecera sin dejar forma de llegar a ella. El envoltorio `min-h-full`
              centra cuando cabe y crece cuando no, así que nunca se pierde nada por arriba.
           2) La tarjeta tenía `backdrop-blur-3xl` junto a `overflow-y-auto`: al hacer scroll, el
              navegador vuelve a muestrear el backdrop y deja bandas horizontales rasgadas — el
              "fondo blanco entrecortado". Sobre un fondo negro sólido el desenfoque no aportaba
              nada (no hay nada detrás que desenfocar), solo el artefacto. */
        <div className="fixed inset-0 z-[100] h-[100dvh] bg-black text-white overflow-y-auto overscroll-contain">
         <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-12 p-6 md:p-12">
          <div className="flex items-center justify-between w-full max-w-4xl border-b border-white/10 pb-8">
             <div className="flex items-center gap-4">
                <Terminal className="h-6 w-6 text-brand-blue" />
                <h2 className="text-xl font-black italic tracking-tighter uppercase">THE_LINE_ENV_01</h2>
             </div>
             <div className="flex items-center gap-6">
               {remaining !== null && (
                 <div
                   className={`flex items-center gap-2 font-mono text-sm font-bold tabular-nums ${
                     remaining <= 300 ? "text-brand-red" : "text-gray-300"
                   }`}
                   aria-label="Tiempo restante"
                 >
                   <Timer className="h-4 w-4" /> {formatClock(remaining)}
                 </div>
               )}
               <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">
                 Pregunta {currentQIndex + 1} de {questions.length}
               </div>
             </div>
          </div>

          <div className="max-w-2xl w-full p-8 md:p-12 bg-white/[0.06] rounded-[2.5rem] border border-white/10 space-y-10">
             <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-block px-3 py-1 bg-brand-blue/20 text-brand-blue rounded-full text-[9px] font-bold uppercase tracking-widest">
                    {questions[currentQIndex].tag}
                  </div>
                  <QuestionTypeBadge type={questions[currentQIndex].type} />
                </div>
                {questions[currentQIndex].briefing && (
                  <p className="text-sm text-gray-400 font-medium leading-relaxed border-l-2 border-white/10 pl-4">
                    {questions[currentQIndex].briefing}
                  </p>
                )}
                <p className="text-xl md:text-2xl font-bold leading-tight tracking-tight italic">
                  {questions[currentQIndex].text}
                </p>
             </div>
             {/* `key` reinicia el estado local del componente al cambiar de pregunta
                 (selecciones a medias de multi_select / ordering). */}
             <QuestionCard
               key={questions[currentQIndex].id}
               question={questions[currentQIndex]}
               onAnswer={handleAnswer}
             />
          </div>
         </div>
        </div>
      )}
    </div>
  );
}

export default function LinePage() {
  return (
    <Suspense fallback={<div className="h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
      <LineContent />
    </Suspense>
  );
}

/** Qué le falta al candidato para hacer la prueba combinada, o `null` si está listo. */
function missingSetup(combined: CombinedInfo | null): "profile" | "technologies" | "bank" | null {
  if (!combined) return null;
  if (!combined.level) return "profile";
  if (combined.technologies.length === 0) return "technologies";
  if (combined.covered.length === 0 && !combined.theoryAvailable) return "bank";
  return null;
}

/** Código de error de la API (`ApiError.code`) o el mensaje de un `Error`. */
function errorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  if (err instanceof Error) return err.message;
  return "";
}

/**
 * Cada motivo de fallo al empezar tiene su mensaje: antes cualquier error que no fuera "sin banco"
 * se mostraba como uno de conexión, también cuando el problema era la vacante.
 * `pool_not_seeded` es esperado y accionable: lo resuelve `npm run seed:questions`.
 */
const START_ERROR_MESSAGES: Record<string, string> = {
  pool_not_seeded: "Todavía no hay preguntas para tus tecnologías. Agrega otra en tu perfil o vuelve más tarde.",
  profile_incomplete: "Completa tu perfil profesional (tu nivel) para que armemos tu prueba.",
  no_technologies: "Elige tus tecnologías en tu perfil profesional para que armemos tu prueba.",
  job_incomplete: "Esta vacante no tiene skills o empresa asignadas, así que no se puede evaluar.",
  job_without_bank: "Las skills de esta vacante aún no tienen preguntas. La empresa debe ajustarlas.",
  job_closed: "Esta vacante está cerrada y ya no admite candidaturas.",
  job_not_found: "Esta vacante ya no existe.",
};

/** Mensaje para el usuario y, si se agotó el intento del día, cuándo vuelve a estar libre. */
function describeStartError(
  err: unknown,
  { jobId, cooldownHours }: { jobId: string | null; cooldownHours: number },
): { message: string; retryAt?: number } {
  const code = errorCode(err);
  if (code !== "rate_limited") {
    return {
      message: START_ERROR_MESSAGES[code] ?? "No se pudo iniciar la prueba. Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  const wait = err instanceof ApiError && err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : 0;
  const where = jobId ? "por vacante" : "en The LINE";
  const when = wait ? ` Podrás volver a intentarlo en ${formatWait(wait)}.` : "";
  return {
    message: `Solo se permite 1 intento cada ${cooldownHours} h ${where}.${when}`,
    retryAt: !jobId && wait ? Date.now() + wait : undefined,
  };
}

/** Resultado de la prueba: nota, cómo quedó el DNA y cómo se calcula. */
function FinishedView({ result, timedOut }: Readonly<{ result: SubmitResult | null; timedOut: boolean }>) {
  return (
    <div className="max-w-2xl mx-auto py-20 text-center space-y-10">
      <div className="w-24 h-24 bg-brand-green/10 rounded-full mx-auto flex items-center justify-center">
        <CheckCircle2 className="h-12 w-12 text-brand-green" />
      </div>
      <div className="space-y-4">
        <h2 className="text-5xl font-black italic tracking-tighter">SIMULACIÓN COMPLETADA.</h2>
        <p className="text-gray-500 font-medium">Tus resultados han sido integrados en tu identidad CORE.</p>
        {timedOut && (
          <p className="text-brand-orange text-sm font-bold">
            Se acabó el tiempo: las preguntas sin responder contaron como falladas.
          </p>
        )}
      </div>
      <div className="bg-white p-12 rounded-[3rem] shadow-apple border border-gray-50 inline-block">
        <span className="text-8xl font-black text-brand-blue tracking-tighter italic">{result?.overall ?? 0}%</span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.4em] text-gray-300 mt-4">Puntuación Verificada</span>
      </div>
      {result && Object.keys(result.dnaScores ?? {}).length > 0 && (
        <div className="max-w-md mx-auto bg-gray-50 rounded-[2rem] p-6 space-y-3 text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Tu DNA quedó así
            {result.level ? ` · nivel ${LEVEL_LABELS[result.level] ?? result.level} ${LEVEL_WEIGHT_LABELS[result.level] ?? ""}` : ""}
          </p>
          {Object.entries(result.dnaScores).map(([skill, dna]) => (
            <div key={skill} className="flex items-center justify-between text-sm">
              <span className="font-bold">{skill}</span>
              <span className="text-gray-500">
                prueba {result.skillScores[skill] ?? 0}% → DNA <span className="font-bold text-black">{dna}%</span>
              </span>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 leading-relaxed">
            El DNA es el promedio de tus últimos 3 intentos, ponderado por nivel: un 100 % en Junior
            aporta 60, en Mid 80 y en Senior 100.
          </p>
        </div>
      )}
      <div className="pt-10">
        <Button onClick={() => window.location.href = "/dashboard/core"} className="h-16 px-12 bg-black text-white rounded-2xl font-bold uppercase tracking-widest shadow-apple-lg">Ir al CORE</Button>
      </div>
    </div>
  );
}

/** Qué entra en la prueba combinada (tecnologías, teoría y nivel) y qué le falta al candidato. */
function CombinedPlan({
  combined,
  setupMissing,
}: Readonly<{ combined: CombinedInfo; setupMissing: "profile" | "technologies" | "bank" | null }>) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 ml-1">Tu prueba combinada</p>
        <div className="flex flex-wrap gap-2">
          {combined.technologies.map((t) => (
            <span
              key={t}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-bold",
                combined.covered.includes(t) ? "bg-brand-blue/10 text-brand-blue" : "bg-gray-100 text-gray-400 line-through",
              )}
              title={combined.covered.includes(t) ? undefined : "Aún no hay preguntas de esta tecnología"}
            >
              {findTechnology(t)?.label ?? t}
            </span>
          ))}
          {combined.theoryAvailable && (
            <span className="rounded-full px-4 py-2 text-xs font-bold bg-black text-white">
              + Ingeniería de software
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 font-medium leading-relaxed ml-1">
          {combined.level ? (
            <>
              Nivel <span className="font-bold text-black">{LEVEL_LABELS[combined.level] ?? combined.level}</span>, según tu perfil.{" "}
              {combined.theoryAvailable
                ? `${combined.plan.technologies} preguntas de tus tecnologías y ${combined.plan.theory} de teoría (SOLID, patrones, arquitectura).`
                : "La parte de teoría todavía no está disponible: todas las preguntas serán de tus tecnologías."}
            </>
          ) : (
            "Falta tu nivel en el perfil profesional."
          )}{" "}
          <Link href="/dashboard/onboarding" className="font-bold text-brand-blue">
            Cambiar en mi perfil
          </Link>
        </p>
      </div>

      {combined.uncovered.length > 0 && combined.covered.length > 0 && (
        <div className="flex items-start gap-2 text-brand-orange text-xs font-bold bg-brand-orange/5 p-4 rounded-xl">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Aún no hay preguntas de {combined.uncovered.map((t) => findTechnology(t)?.label ?? t).join(", ")}: por ahora
          no entran en tu prueba.
        </div>
      )}

      {setupMissing && (
        <div className="flex items-start gap-3 bg-gray-950 text-white p-5 rounded-2xl text-sm font-medium">
          <AlertCircle className="h-5 w-5 shrink-0 text-brand-blue" />
          <p className="leading-relaxed">
            {setupMissing === "profile" && "Antes de tu primera prueba, completa tu perfil profesional: con tu nivel armamos las preguntas."}
            {setupMissing === "technologies" && "Elige en tu perfil las tecnologías que quieres que te evaluemos (hasta 6)."}
            {setupMissing === "bank" && "Todavía no hay preguntas para ninguna de tus tecnologías. Agrega otra en tu perfil o vuelve más tarde."}{" "}
            <Link href="/dashboard/onboarding" className="font-bold text-brand-blue">
              Ir a mi perfil
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
