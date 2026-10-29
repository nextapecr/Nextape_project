"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Users, Loader2, Briefcase, ShieldCheck, PlusCircle, Trophy, AlertCircle } from "lucide-react";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useJobAccordion } from "@/hooks/use-job-accordion";
import { JobService } from "@/services/jobs.service";
import type { JobOpportunity } from "@/types/job.types";

type VacancyRow = JobOpportunity & { id: string };

export default function CandidatesPage() {
  const { user, authLoading } = useAuthUser();
  const [vacancies, setVacancies] = useState<VacancyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { jobStates, handleOpenJob, handleLoadMore, handleRetry } = useJobAccordion(
    user?.uid || ""
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const jobs = await JobService.getJobsByRecruiter(user.uid);
        setVacancies(jobs as VacancyRow[]);
      } catch (error) {
        console.error("Error fetching vacancies:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData(); // los errores se manejan dentro (try/catch)
  }, [user, authLoading]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  // Conteo total de candidatos cargados (suma de todas las vacantes abiertas)
  const totalLoadedMatches = Object.values(jobStates).reduce(
    (sum, state) => sum + state.matches.length,
    0
  );
  // Candidatos verificados únicos (userId distintos)
  const verifiedCandidates = new Set(
    Object.values(jobStates).flatMap((state) => state.matches.map((m) => m.userId))
  ).size;

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-black italic">Candidatos.</h1>
        <p className="text-gray-500 font-medium">
          Talento que ha completado la prueba técnica (The LINE) de tus vacantes, rankeado por su DNA verificado.
        </p>
      </header>

      {vacancies.length === 100 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sm">Mostrando tus 100 vacantes más recientes</p>
            <p className="text-xs mt-1 text-amber-700">
              Si tienes más vacantes, las más antiguas no se listan. Considera archivar las que ya no estén activas.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] shadow-apple border border-gray-50">
          <Briefcase className="h-5 w-5 text-brand-blue mb-4" />
          <span className="text-4xl font-black italic tracking-tighter">{vacancies.length}</span>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-2">Vacantes activas</p>
        </div>
        <div className="bg-white p-8 rounded-[2rem] shadow-apple border border-gray-50">
          <Users className="h-5 w-5 text-brand-green mb-4" />
          <span className="text-4xl font-black italic tracking-tighter">{totalLoadedMatches}</span>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-2">Aplicaciones cargadas</p>
        </div>
        <div className="bg-white p-8 rounded-[2rem] shadow-apple border border-gray-50">
          <ShieldCheck className="h-5 w-5 text-brand-purple mb-4" />
          <span className="text-4xl font-black italic tracking-tighter">{verifiedCandidates}</span>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-2">DNA verificados</p>
        </div>
      </div>

      {vacancies.length === 0 ? (
        <div className="py-32 text-center bg-white rounded-[3rem] border border-dashed border-gray-200 flex flex-col items-center space-y-6">
          <Users className="h-12 w-12 text-gray-200" />
          <div className="space-y-2">
            <p className="text-xl font-bold text-black italic">Aún no hay candidatos.</p>
            <p className="text-sm text-gray-400 max-w-md">
              Publica una vacante con su prueba técnica para empezar a recibir talento con DNA verificado.
            </p>
          </div>
          <Link href="/dashboard/vacancies/new">
            <Button className="bg-black text-white rounded-xl uppercase tracking-widest text-[10px] font-bold">
              <PlusCircle className="mr-2 h-4 w-4" /> Publicar Vacante
            </Button>
          </Link>
        </div>
      ) : (
        <Accordion type="single" collapsible className="space-y-6">
          {vacancies.map((job) => {
            const jobState = jobStates[job.id];
            const applicantsCount = job.applicantsCount || 0;

            return (
              <AccordionItem
                key={job.id}
                value={job.id}
                className="bg-white rounded-[2.5rem] border border-gray-50 shadow-apple overflow-hidden"
              >
                <AccordionTrigger
                  className="px-8 md:px-10 py-8 hover:no-underline hover:bg-gray-50/50 transition-colors"
                  onClick={() => handleOpenJob(job.id)}
                >
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="space-y-2 text-left">
                      <h2 className="text-2xl font-bold italic leading-none">{job.title}</h2>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(job.requiredSkills || []).map((s) => (
                          <Badge
                            key={s}
                            className="bg-brand-blue/5 text-brand-blue border-none rounded-full py-1.5 px-4 text-[8px] font-bold uppercase tracking-widest"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black italic tracking-tighter">
                        {applicantsCount}
                      </span>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                        Candidatos
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-8 md:px-10 pb-8">
                  <div className="pt-6 border-t border-gray-50 space-y-4">
                    {jobState?.error && (
                      <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-2xl flex items-center justify-between">
                        <span className="text-sm">{jobState.error}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(job.id)}
                          className="ml-4"
                        >
                          Reintentar
                        </Button>
                      </div>
                    )}

                    {jobState?.loaded && jobState.matches.length === 0 && !jobState.error && (
                      <p className="text-sm text-gray-400 font-medium flex items-center gap-2 py-4">
                        <ShieldCheck className="h-4 w-4 text-gray-300" />
                        Aún nadie ha completado la prueba de esta vacante. Los candidatos aparecerán aquí rankeados por su DNA.
                      </p>
                    )}

                    {jobState?.matches && jobState.matches.length > 0 && (
                      <div className="space-y-3">
                        {jobState.matches.map((m, idx) => (
                          <div
                            key={m.userId}
                            className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4 md:p-5"
                          >
                            <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-full bg-white shadow-apple text-sm font-black italic text-gray-400">
                              {idx === 0 ? (
                                <Trophy className="h-4 w-4 text-brand-orange" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <div className="flex-grow min-w-0">
                              <p className="font-bold italic leading-tight truncate">
                                {m.candidateName}
                              </p>
                              {m.candidate && (
                                <p className="text-xs text-gray-500 font-medium truncate">
                                  {[m.candidate.headline, m.candidate.selfLevel, m.candidate.yearsOfExperience, m.candidate.location]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1.5 pt-1.5">
                                {Object.entries(m.skills || {}).map(([skill, val]) => (
                                  <Badge
                                    key={skill}
                                    className="bg-white text-gray-500 border-none rounded-full py-1 px-3 text-[8px] font-bold uppercase tracking-widest"
                                  >
                                    {skill} {val}
                                  </Badge>
                                ))}
                              </div>
                              {/* Perfil declarado por el candidato (no verificado): contexto, no score. */}
                              {m.candidate ? (
                                <details className="pt-2 group/details">
                                  <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-brand-blue w-fit">
                                    Ver perfil profesional
                                  </summary>
                                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 font-medium">
                                    {[
                                      { title: "Experiencia", items: m.candidate.recentWork },
                                      { title: "Estudios", items: m.candidate.education },
                                      { title: "Idiomas", items: m.candidate.languages },
                                      {
                                        title: "Disponibilidad",
                                        items: [m.candidate.availability, m.candidate.workModes.join(" / ")].filter(Boolean),
                                      },
                                    ]
                                      .filter((g) => g.items.length > 0)
                                      .map((g) => (
                                        <DetailGroup key={g.title} title={g.title} items={g.items} />
                                      ))}
                                    {(m.candidate.linkedinUrl || m.candidate.portfolioUrl) && (
                                      <div className="flex flex-wrap gap-3">
                                        {m.candidate.linkedinUrl && (
                                          <a href={m.candidate.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-brand-blue hover:underline">
                                            LinkedIn
                                          </a>
                                        )}
                                        {m.candidate.portfolioUrl && (
                                          <a href={m.candidate.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-brand-blue hover:underline">
                                            Portafolio
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </details>
                              ) : (
                                <p className="pt-2 text-[10px] text-gray-400">Sin perfil profesional completado.</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-2xl font-black italic tracking-tighter text-brand-blue">
                                {m.score}%
                              </div>
                              <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">
                                The LINE
                              </p>
                            </div>
                            <div className="text-right shrink-0 hidden sm:block border-l border-gray-200 pl-4">
                              <div className="text-2xl font-black italic tracking-tighter">
                                {m.matchPercent}%
                              </div>
                              <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">
                                Afinidad CORE
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {jobState?.loadingMore && (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
                      </div>
                    )}

                    {jobState?.hasMore && !jobState.loadingMore && (
                      <Button
                        variant="ghost"
                        onClick={() => handleLoadMore(job.id)}
                        className="w-full rounded-xl border border-gray-200 hover:bg-gray-50"
                      >
                        Ver más candidatos
                      </Button>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

/** Un bloque del perfil profesional del candidato (experiencia, estudios…). */
function DetailGroup({ title, items }: Readonly<{ title: string; items: string[] }>) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}
