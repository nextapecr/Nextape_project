"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Loader2, Users, Calendar, ArrowRight, MoreVertical, Terminal, Briefcase, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuthUser } from "@/hooks/use-auth-user";
import { JobService } from "@/services/jobs.service";
import type { JobOpportunity } from "@/types/job.types";

/** Formatea de forma segura un campo de fecha de Firestore que podría no ser un Timestamp. */
function formatPostedAt(value: unknown): string {
  if (value instanceof Timestamp) {
    return format(value.toDate(), "d MMM, yyyy", { locale: es });
  }
  return "—";
}

type VacancyRow = JobOpportunity & { id: string };

export default function VacanciesPage() {
  const { user, authLoading } = useAuthUser();
  const [vacancies, setVacancies] = useState<VacancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchVacancies = async () => {
      try {
        setError(null);
        const jobs = await JobService.getJobsByRecruiter(user.uid);
        setVacancies(jobs as VacancyRow[]);
      } catch (err) {
        // Antes se tragaba el error en el console y se mostraba el estado vacío, así que un fallo
        // de permisos o de red era indistinguible de "no tienes vacantes".
        console.error("Error fetching vacancies:", err);
        setError("No se pudieron cargar tus vacantes. Recarga la página e inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    void fetchVacancies(); // los errores se manejan dentro (try/catch)
  }, [user, authLoading]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-black italic">Mis Vacantes.</h1>
          <p className="text-gray-500 font-medium">Gestiona tus posiciones activas y las pruebas técnicas asociadas.</p>
        </div>
        <Link href="/dashboard/vacancies/new">
          <Button className="h-14 px-8 bg-brand-blue rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-apple hover:scale-105 transition-all text-white">
            <PlusCircle className="mr-2 h-4 w-4" /> Publicar Vacante
          </Button>
        </Link>
      </header>

      {error && (
        <div className="flex items-center gap-3 bg-brand-red/5 text-brand-red rounded-2xl p-5 text-xs font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {vacancies.length > 0 ? vacancies.map((job) => (
          <div key={job.id} className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-gray-50 shadow-apple flex flex-col md:flex-row justify-between items-center gap-8 group hover:shadow-apple-lg transition-all">
            <div className="flex-grow space-y-6 w-full">
               <div className="flex justify-between items-start">
                  <div className="space-y-2">
                     <div className="flex items-center gap-3">
                       <h2 className="text-2xl font-bold italic leading-none">{job.title}</h2>
                       {job.active === false && (
                         <Badge className="bg-gray-100 text-gray-500 border-none rounded-full py-1 px-3 text-[8px] font-bold uppercase tracking-widest">
                           Archivada
                         </Badge>
                       )}
                     </div>
                     <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {formatPostedAt(job.postedAt)}</span>
                        <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {job.applicantsCount || 0} aplicantes</span>
                     </div>
                  </div>
                  {/* Antes este botón no tenía handler: era decorativo. Ahora abre la gestión. */}
                  <Link href={`/dashboard/vacancies/${job.id}`} aria-label={`Gestionar ${job.title}`}>
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100">
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </Button>
                  </Link>
               </div>

               <div className="flex flex-wrap gap-2">
                  {(job.requiredSkills || []).map((s: string) => (
                    <Badge key={s} className="bg-brand-blue/5 text-brand-blue border-none rounded-full py-1.5 px-4 text-[8px] font-bold uppercase tracking-widest">
                      {s}
                    </Badge>
                  ))}
               </div>

               <div className="pt-6 border-t border-gray-50 flex gap-4">
                  {/* Estado REAL de la prueba. Antes esto decía siempre "Activado", incluso cuando
                      la generación había fallado al publicar la vacante. */}
                  <div className="bg-gray-50 p-4 rounded-2xl flex-1">
                     <span className="text-[8px] font-black uppercase tracking-widest text-gray-300 block mb-1">Estado de la Prueba</span>
                     {job.assessmentReady ? (
                       <p className="text-xs font-bold text-brand-green uppercase tracking-widest flex items-center gap-2">
                          <Terminal className="h-3 w-3" />
                          The LINE Activado
                          {job.assessmentPoolSize ? (
                            <span className="text-gray-400 normal-case tracking-normal font-medium">
                              · {job.assessmentPoolSize} preguntas
                            </span>
                          ) : null}
                       </p>
                     ) : (
                       <p className="text-xs font-bold text-brand-orange uppercase tracking-widest flex items-center gap-2">
                          <AlertTriangle className="h-3 w-3" /> Prueba pendiente
                       </p>
                     )}
                  </div>
                  <Link href={`/dashboard/vacancies/${job.id}`}>
                    <Button variant="outline" className="rounded-2xl h-auto py-4 px-6 border-gray-100 font-bold uppercase tracking-widest text-[9px] hover:bg-gray-50">
                      Gestionar <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
                  <Link href="/dashboard/candidates">
                    <Button variant="outline" className="rounded-2xl h-auto py-4 px-6 border-gray-100 font-bold uppercase tracking-widest text-[9px] hover:bg-gray-50">
                      Candidatos <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
               </div>
            </div>
          </div>
        )) : (
          <div className="py-32 text-center bg-white rounded-[3rem] border border-dashed border-gray-200 flex flex-col items-center space-y-6">
             <Briefcase className="h-12 w-12 text-gray-200" />
             <div className="space-y-2">
                <p className="text-xl font-bold text-black italic">No tienes vacantes activas.</p>
                <p className="text-sm text-gray-400">Publica tu primera posición para empezar a recibir talento verificado.</p>
             </div>
             <Link href="/dashboard/vacancies/new">
                <Button className="bg-black text-white rounded-xl uppercase tracking-widest text-[10px] font-bold">Empezar</Button>
             </Link>
          </div>
        )}
      </div>
    </div>
  );
}
