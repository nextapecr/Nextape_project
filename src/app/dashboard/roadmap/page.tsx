"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Zap,
  Loader2,
  Map,
  CheckCircle2,
  Lock,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Check,
  Flag,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase/client";
import { RoadmapService } from "@/services/roadmap.service";
import { computeRoadmap } from "@/lib/roadmap-engine";
import { LEVELS, LEVEL_LABELS } from "@/lib/levels";
import {
  TARGET_ROLES,
  type TargetRole,
  type SeniorityLevel,
} from "@/services/github-engine/role-mapping/role-weights";
import type { RoadmapItem, RoadmapRoute, Skill, ScoreSource } from "@/types/roadmap.types";
import { practiceTechnologyForSkill, technologyLabel } from "@/lib/skill-technology-map";
import { onAuthStateChanged, User } from "firebase/auth";

const ROLE_OPTIONS: { id: TargetRole; label: string }[] = [
  { id: "backend", label: "Backend (MVP)" },
  { id: "frontend", label: "Frontend" },
  { id: "fullstack", label: "Fullstack" },
  { id: "devops", label: "DevOps" },
  { id: "mobile", label: "Mobile" },
];

const CATEGORY_LABELS: Record<string, string> = {
  language: "Lenguaje & Runtime",
  database: "Bases de Datos",
  "api-design": "Diseño de APIs",
  infrastructure: "Infraestructura",
  testing: "Testing & Calidad",
  security: "Seguridad",
  architecture: "Arquitectura",
  tooling: "Herramientas & Entorno",
  observability: "Observabilidad",
};

/** De dónde sale el score de una skill, en palabras que reconoce el usuario. */
const SCORE_SOURCE_LABELS: Record<ScoreSource, string> = {
  line: "The LINE",
  github: "tu actividad en GitHub",
  "category-inferred": "el promedio de pruebas parecidas",
  none: "sin datos todavía",
};

/** "The LINE (React, Next.js)" cuando la nota sale de tecnologías relacionadas con la skill. */
function scoreSourceLabel(item: RoadmapItem): string {
  if (item.scoreSource === "line" && item.evidenceTechnologies?.length) {
    return `The LINE (${item.evidenceTechnologies.map(technologyLabel).join(", ")})`;
  }
  return SCORE_SOURCE_LABELS[item.scoreSource];
}

export default function RoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [targetRole, setTargetRole] = useState<TargetRole>("backend");
  const [inferredLevel, setInferredLevel] = useState<SeniorityLevel>("junior");
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /**
   * Niveles reales de la ruta que se cargó (puede no coincidir con el nivel inferido cuando el
   * MVP usa el fallback a "backend_junior_to_mid"). Es la fuente de verdad para la escalera de
   * niveles: nunca inventa un nivel que la ruta cargada no respalde.
   */
  const [routeLevels, setRouteLevels] = useState<{ from: SeniorityLevel; to: SeniorityLevel } | null>(null);

  /**
   * Skills que además se pueden practicar en The LINE (tienen repertorio precargado).
   *
   * Cierra el ciclo roadmap → práctica → DNA: sin esto el roadmap dice qué te falta pero no
   * ofrece cómo cubrirlo. Solo se muestra el atajo cuando la skill existe de verdad en el banco;
   * enviar al usuario a una combinación sin preguntas sería peor que no ofrecer nada.
   */
  const [practicable, setPracticable] = useState<Record<string, string[]>>({});
  /** Tecnologías que The LINE le evalúa al usuario (su perfil). Solo esas se pueden practicar. */
  const [lineTechs, setLineTechs] = useState<string[]>([]);

  useEffect(() => {
    apiGet<{ available: Record<string, string[]>; combined?: { technologies: string[] } }>("/api/line/catalog")
      .then((res) => {
        setPracticable(res.available);
        setLineTechs(res.combined?.technologies ?? []);
      })
      .catch(() => setPracticable({}));
  }, []);

  const calculateUserRoadmap = useCallback(async (uid: string, role: TargetRole) => {
    setComputing(true);
    setErrorMsg(null);
    try {
      // 1. Obtener DNA del usuario (The LINE)
      const userSkillsDoc = await RoadmapService.getDNA(uid);
      const dna = userSkillsDoc?.scores || {};

      // 2. Inferir nivel actual a partir de SENIORITY_THRESHOLDS
      const currentLevel = RoadmapService.inferUserLevel(dna);
      setInferredLevel(currentLevel);

      // Definir nivel objetivo según nivel inferido
      const targetLevel: SeniorityLevel = currentLevel === "junior" ? "mid" : "senior";
      const routeId = `${role}_${currentLevel}_to_${targetLevel}`;

      // 3. Cargar la ruta desde Firestore
      let route = await RoadmapService.getRoute(routeId);

      // Fallback para MVP si no se encuentra la ruta específica de otro rol
      if (!route && role === "backend") {
        route = await RoadmapService.getRoute("backend_junior_to_mid");
      }

      if (!route) {
        setItems([]);
        setRouteLevels(null);
        setErrorMsg(
          `La ruta ${role.toUpperCase()} (${currentLevel} → ${targetLevel}) aún no está disponible en el catálogo MVP. Ruta activa disponible: Backend Junior → Mid.`
        );
        return;
      }

      // Nivel real de la ruta cargada (puede diferir del `targetLevel` calculado arriba si se usó
      // el fallback de MVP): es lo que se muestra en la escalera de niveles.
      setRouteLevels({ from: route.fromLevel, to: route.toLevel });

      // 4. Cargar las skills requeridas por la ruta desde skill_catalog
      const skillIds = Object.keys(route.skillWeights);
      const catalog = await RoadmapService.getCatalogSkills(skillIds);

      if (catalog.length === 0) {
        setItems([]);
        setErrorMsg(
          "El catálogo de habilidades aún no ha sido poblado en Firestore. Ejecuta 'npm run seed:catalog -- --yes' para precargar las 18 skills."
        );
        return;
      }

      // 5. Cargar evidencia del GitHub Engine (opcional como proxy)
      const githubDoc = await RoadmapService.getGithubEvidence(uid);
      const githubScores = githubDoc?.skillScores;

      // 6. Computar roadmap determinístico
      const computedResult = computeRoadmap({
        route,
        catalog,
        dna,
        githubScores,
      });

      setItems(computedResult.items);
    } catch (error) {
      console.error("Error computing roadmap:", error);
      setRouteLevels(null);
      setErrorMsg("Ocurrió un error al procesar el roadmap determinístico.");
    } finally {
      setComputing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        calculateUserRoadmap(currentUser.uid, targetRole);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [calculateUserRoadmap, targetRole]);

  const handleRoleChange = (newRole: TargetRole) => {
    setTargetRole(newRole);
    if (user) {
      calculateUserRoadmap(user.uid, newRole);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  const completed = items.filter((i) => i.status === "completed");
  const available = items.filter((i) => i.status === "gap");
  const blocked = items.filter((i) => i.status === "blocked");
  const unmeasured = items.filter((i) => i.status === "unknown");

  // El motor ya ordena topológicamente y prioriza: el primer hueco disponible ES el siguiente paso.
  const [nextStep, ...restAvailable] = available;
  const evaluated = completed.length + available.length + blocked.length;
  const progress = evaluated > 0 ? Math.round((completed.length / evaluated) * 100) : 0;

  // Todos los items de una misma ruta comparten el mismo umbral: SENIORITY_THRESHOLDS[route.toLevel].
  const masteryThreshold = items[0]?.targetScore ?? null;
  const currentLevelLabel = LEVEL_LABELS[inferredLevel];
  // El nivel objetivo "real" es el de la ruta cargada; si aún no llegó, se cae al mismo cálculo
  // que usa calculateUserRoadmap para no mostrar nada antes de tener datos.
  const targetLevel: SeniorityLevel = routeLevels?.to ?? (inferredLevel === "junior" ? "mid" : "senior");
  const targetLevelLabel = LEVEL_LABELS[targetLevel];
  const nextLevelAfterTarget = LEVELS[LEVELS.indexOf(targetLevel) + 1] as SeniorityLevel | undefined;
  const routeIsComplete =
    items.length > 0 && completed.length > 0 && available.length === 0 && blocked.length === 0;

  // Nombres legibles para los IDs de skills que aparecen en `blockedBy` (el motor solo da IDs).
  // Objeto plano, no Map: el icono `Map` de lucide-react ya ocupa ese nombre en este archivo.
  const skillNameById: Record<string, string> = {};
  for (const item of items) skillNameById[item.skillId] = item.skillName;

  /**
   * Única acción real que el usuario puede tomar para mover una skill: practicarla en The LINE si
   * hay repertorio cargado, o reforzar su evidencia en GitHub si el score de hoy viene de ahí.
   * Nunca ofrece un enlace a algo que no puede resolver ninguna de las dos cosas.
   */
  function getSkillAction(item: RoadmapItem): { label: string; href: string } | null {
    // La skill del catálogo casi nunca es una tecnología de The LINE: se ofrece practicar la
    // tecnología relacionada que sí tenga preguntas (p. ej. react-fundamentals → React).
    const tech = practiceTechnologyForSkill(item.skillId, practicable);
    if (tech) {
      // The LINE ya no deja elegir tecnología: evalúa las del perfil. Si esta no está, se ofrece
      // agregarla al perfil (máx. 6) en vez de un enlace que no la va a evaluar.
      return lineTechs.includes(tech)
        ? { label: "Evaluar en The LINE", href: "/dashboard/line" }
        : { label: `Agregar ${technologyLabel(tech)} a tu perfil`, href: "/dashboard/onboarding" };
    }
    if (item.scoreSource === "github") {
      return { label: "Reforzar en GitHub", href: "/dashboard/github" };
    }
    return null;
  }

  const nextStepAction = nextStep ? getSkillAction(nextStep) : null;

  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-black italic">Roadmap.</h1>
          <p className="text-gray-500 font-medium text-sm">
            Tu ruta hacia {ROLE_OPTIONS.find((r) => r.id === targetRole)?.label ?? targetRole},
            calculada a partir de tu DNA técnico.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => user && calculateUserRoadmap(user.uid, targetRole)}
          disabled={computing}
          className="rounded-2xl h-12 px-6 border-gray-200 font-bold uppercase tracking-widest text-[10px]"
        >
          {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Recalcular
        </Button>
      </header>

      {/* Rol objetivo */}
      <div className="flex flex-wrap gap-2">
        {ROLE_OPTIONS.map((role) => (
          <button
            key={role.id}
            onClick={() => handleRoleChange(role.id)}
            className={cn(
              "lift px-5 py-2.5 rounded-2xl text-[11px] font-bold uppercase tracking-widest",
              targetRole === role.id
                ? "bg-black text-white"
                : "bg-white text-gray-500 border border-gray-100 hover:text-black"
            )}
          >
            {role.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-6 bg-brand-orange/5 border border-brand-orange/20 rounded-[2rem] flex items-start gap-4 text-sm">
          <AlertCircle className="h-5 w-5 text-brand-orange shrink-0 mt-0.5" />
          <p className="font-medium text-gray-700">{errorMsg}</p>
        </div>
      )}

      {items.length === 0 && !errorMsg ? (
        <div className="p-16 text-center bg-white rounded-[2.5rem] border border-dashed border-gray-200 flex flex-col items-center space-y-5">
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center">
            <Map className="h-7 w-7 text-gray-300" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-bold italic">Aún no podemos trazar tu ruta.</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
              Completa una prueba en The LINE para que tu DNA técnico tenga datos con los que
              calcular tu progresión.
            </p>
          </div>
          <Link href="/dashboard/line">
            <Button className="bg-black text-white rounded-2xl h-12 px-8 font-bold uppercase tracking-widest text-[10px]">
              Ir a The LINE <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Escalera de niveles — dónde estás y a qué escalón apunta esta ruta */}
          {routeLevels && (
            <LevelLadder current={inferredLevel} target={targetLevel} masteryThreshold={masteryThreshold} />
          )}

          {/* Progreso hacia el nivel objetivo */}
          <section className="bg-white rounded-[2.5rem] p-8 shadow-apple border border-gray-50 space-y-5">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 block mb-1">
                  Progreso de {currentLevelLabel} a {targetLevelLabel}
                </span>
                <span className="text-3xl font-black italic tracking-tighter">
                  {completed.length}
                  <span className="text-gray-300"> / {evaluated}</span>
                </span>
                <span className="text-xs text-gray-400 font-medium ml-2">habilidades dominadas</span>
              </div>
              <span className="text-4xl font-black italic tracking-tighter text-brand-blue">{progress}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-50 overflow-hidden border border-gray-100">
              <div
                className="h-full bg-brand-blue rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </section>

          {/* SIGUIENTE PASO — el motor calcula exactamente esto; es lo único que hay que decidir hoy */}
          {nextStep && (
            <section className="bg-gray-950 text-white rounded-[2.5rem] p-10 shadow-apple-lg space-y-8 relative overflow-hidden">
              <div className="relative z-10 space-y-6">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-blue">
                  Tu siguiente paso
                </span>
                <div className="space-y-3">
                  <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter leading-none">
                    {nextStep.skillName}
                  </h2>
                  <p className="text-sm text-gray-400 font-medium">
                    {CATEGORY_LABELS[nextStep.category] ?? nextStep.category}
                    {nextStep.scoreSource !== "none" && (
                      <> · medido con {scoreSourceLabel(nextStep)}</>
                    )}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                    <span className="text-gray-500">Ahora {nextStep.currentScore}%</span>
                    <span className="text-brand-blue">Objetivo {nextStep.targetScore}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden relative">
                    <div
                      className="h-full bg-brand-blue rounded-full"
                      style={{ width: `${Math.min(nextStep.currentScore, 100)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 border-l-2 border-dashed border-white/40"
                      style={{ left: `${Math.min(nextStep.targetScore, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 font-medium">
                    Te faltan {nextStep.deficit} puntos para dominarla.
                  </p>
                </div>

                {nextStepAction && (
                  <Link href={nextStepAction.href}>
                    <Button className="h-14 px-8 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px]">
                      {nextStepAction.label} <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
              <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-brand-blue/10 rounded-full blur-3xl" />
            </section>
          )}

          {/* Ruta completa — sin gaps ni bloqueadas: hay que decir qué sigue, no dejarlo en el aire */}
          {routeIsComplete && (
            <section className="bg-gray-950 text-white rounded-[2.5rem] p-10 shadow-apple-lg space-y-4 relative overflow-hidden">
              <div className="relative z-10 space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-blue">
                  Ruta completa
                </span>
                <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter leading-none">
                  Dominas todas las habilidades medidas de esta ruta.
                </h2>
                {unmeasured.length > 0 && (
                  <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-xl">
                    Aún te quedan {unmeasured.length}{" "}
                    {unmeasured.length === 1 ? "habilidad sin medir" : "habilidades sin medir"}. Complétalas
                    en The LINE para que cuenten en tu progreso.
                  </p>
                )}
                <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-xl">
                  {nextLevelAfterTarget
                    ? `El siguiente escalón es la ruta de ${targetLevelLabel} a ${LEVEL_LABELS[nextLevelAfterTarget]}. Vuelve a recalcular más adelante para verla.`
                    : `${targetLevelLabel} es el nivel más alto que NEXTAPE evalúa hoy.`}
                </p>
              </div>
              <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-brand-blue/10 rounded-full blur-3xl" />
            </section>
          )}

          {/* Resto de habilidades disponibles */}
          {restAvailable.length > 0 && (
            <section className="space-y-4">
              <SectionTitle icon={Zap} label="Disponibles ahora" count={restAvailable.length} />
              <div className="space-y-3">
                {restAvailable.map((item) => (
                  <div
                    key={item.skillId}
                    className="bg-white rounded-2xl p-5 border border-gray-50 shadow-apple flex flex-wrap items-center gap-4"
                  >
                    <div className="flex-grow min-w-0 space-y-1">
                      <p className="font-bold truncate">{item.skillName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                        {item.scoreSource !== "none" && <> · {scoreSourceLabel(item)}</>}
                      </p>
                    </div>
                    <ScoreGap item={item} />
                    {(() => {
                      const action = getSkillAction(item);
                      return action ? (
                        <Link href={action.href}>
                          <Button variant="ghost" className="rounded-xl text-brand-blue font-bold uppercase tracking-widest text-[9px]">
                            {action.label}
                          </Button>
                        </Link>
                      ) : null;
                    })()}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bloqueadas — lo importante es POR QUÉ, que el motor ya calcula y antes no se leía bien */}
          {blocked.length > 0 && (
            <section className="space-y-4">
              <SectionTitle icon={Lock} label="Se desbloquean después" count={blocked.length} />
              <div className="space-y-3">
                {blocked.map((item) => (
                  <div
                    key={item.skillId}
                    className="bg-gray-50/60 rounded-2xl p-5 border border-gray-100 flex flex-wrap items-center gap-4"
                  >
                    <div className="flex-grow min-w-0 space-y-1.5">
                      <p className="font-bold text-gray-500 truncate">{item.skillName}</p>
                      {item.blockedBy.length > 0 && (
                        <p className="text-[11px] text-gray-400 font-medium">
                          Domina primero{" "}
                          <span className="text-gray-600 font-bold">
                            {item.blockedBy.map((id) => skillNameById[id] ?? id).join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                    <Lock className="h-4 w-4 text-gray-300 shrink-0" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sin medir todavía — desaparecían de la UI; sin verlas, el usuario no sabe que existen */}
          {unmeasured.length > 0 && (
            <section className="space-y-4">
              <SectionTitle icon={HelpCircle} label="Sin medir todavía" count={unmeasured.length} />
              <div className="space-y-3">
                {unmeasured.map((item) => {
                  const action = getSkillAction(item);
                  return (
                    <div
                      key={item.skillId}
                      className="bg-white rounded-2xl p-5 border border-dashed border-gray-200 flex flex-wrap items-center gap-4"
                    >
                      <div className="flex-grow min-w-0 space-y-1">
                        <p className="font-bold truncate">{item.skillName}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
                          {CATEGORY_LABELS[item.category] ?? item.category} · Sin datos
                        </p>
                      </div>
                      {action ? (
                        <Link href={action.href}>
                          <Button variant="ghost" className="rounded-xl text-brand-blue font-bold uppercase tracking-widest text-[9px]">
                            {action.label}
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
                          Aún no medible
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Dominadas — logro, no ruido: compactas y al final */}
          {completed.length > 0 && (
            <section className="space-y-4">
              <SectionTitle icon={CheckCircle2} label="Ya dominas" count={completed.length} />
              <div className="flex flex-wrap gap-2">
                {completed.map((item) => (
                  <span
                    key={item.skillId}
                    className="inline-flex items-center gap-2 bg-white border border-gray-100 rounded-full py-2 px-4 text-xs font-bold text-gray-600 shadow-apple"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />
                    {item.skillName}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof Zap;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-gray-300" />
      <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-400">{label}</h2>
      <span className="text-[11px] font-bold text-gray-300">{count}</span>
    </div>
  );
}

/**
 * Escalera Junior → Mid → Senior: dónde está el usuario hoy y a qué escalón apunta la ruta
 * cargada. Deja explícito que dominar la ruta actual es lo que empuja al siguiente nivel, y
 * explica con qué umbral real se mide "dominar" una habilidad.
 */
function LevelLadder({
  current,
  target,
  masteryThreshold,
}: {
  current: SeniorityLevel;
  target: SeniorityLevel;
  masteryThreshold: number | null;
}) {
  const currentIdx = LEVELS.indexOf(current);
  const targetIdx = LEVELS.indexOf(target);

  return (
    <section className="bg-white rounded-[2.5rem] p-8 shadow-apple border border-gray-50 space-y-8">
      <div className="flex items-center">
        {LEVELS.map((level, idx) => {
          const isCurrent = idx === currentIdx;
          const isPassed = idx < currentIdx;
          // Solo se marca "Meta" cuando de verdad está por delante de donde está el usuario hoy.
          const isTarget = !isCurrent && idx === targetIdx && targetIdx > currentIdx;

          return (
            <div key={level} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div
                  className={cn(
                    "h-11 w-11 rounded-full flex items-center justify-center border-2 shrink-0",
                    isCurrent && "bg-black border-black text-white",
                    isTarget && "bg-white border-brand-blue text-brand-blue",
                    !isCurrent && !isTarget && "bg-gray-50 border-gray-100 text-gray-300"
                  )}
                >
                  {isPassed ? (
                    <Check className="h-4 w-4" />
                  ) : isTarget ? (
                    <Flag className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-black">{idx + 1}</span>
                  )}
                </div>
                <div className="text-center space-y-0.5">
                  <p
                    className={cn(
                      "text-xs font-bold",
                      isCurrent ? "text-black" : isTarget ? "text-brand-blue" : "text-gray-400"
                    )}
                  >
                    {LEVEL_LABELS[level]}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-300 h-3">
                    {isCurrent ? "Estás aquí" : isTarget ? "Meta" : ""}
                  </p>
                </div>
              </div>
              {idx < LEVELS.length - 1 && <div className="h-0.5 flex-1 mx-3 rounded-full bg-gray-100" />}
            </div>
          );
        })}
      </div>
      <p className="text-sm text-gray-500 font-medium leading-relaxed">
        {masteryThreshold !== null ? (
          <>
            Dominas una habilidad cuando tu puntuación llega a{" "}
            <span className="font-bold text-black">{masteryThreshold}%</span>. Ese número sale de The
            LINE cuando la practicaste ahí, o de tu actividad en GitHub cuando todavía no.
          </>
        ) : (
          "Completa una prueba para conocer el umbral que necesitas en cada habilidad."
        )}
      </p>
    </section>
  );
}

/** Score actual frente al objetivo, en una barra compacta. */
function ScoreGap({ item }: { item: RoadmapItem }) {
  return (
    <div className="w-32 shrink-0 space-y-1.5">
      <div className="flex justify-between text-[10px] font-bold">
        <span className="text-gray-500">{item.currentScore}%</span>
        <span className="text-gray-300">{item.targetScore}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-brand-blue rounded-full"
          style={{ width: `${Math.min(item.currentScore, 100)}%` }}
        />
      </div>
    </div>
  );
}
