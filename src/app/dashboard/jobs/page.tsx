"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Briefcase, DollarSign, Search, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JobService } from "@/services/jobs.service";
import { SkillsService } from "@/services/skills.service";
import { useAuthUser } from "@/hooks/use-auth-user";
import Link from "next/link";

export default function JobsPage() {
  const { user, authLoading } = useAuthUser();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const loadJobs = async () => {
      try {
        const [jobsList, skillData] = await Promise.all([
          JobService.getLatestJobs(),
          SkillsService.getSkills(user.uid)
        ]);

        const userScores = skillData?.scores || {};
        const jobsWithMatch = jobsList.map(job => ({
          ...job,
          match: JobService.calculateMatch(job.requiredSkills || [], userScores)
        })).sort((a, b) => b.match - a.match);

        setJobs(jobsWithMatch);
      } catch (error) {
        console.error("Error loading jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    void loadJobs(); // los errores se manejan dentro (try/catch)
  }, [user, authLoading]);

  const filteredJobs = jobs.filter(job =>
    (job.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.company || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-black italic">Oportunidades.</h1>
        <p className="text-gray-500 font-medium">Posiciones curadas según tu perfil técnico real y verificado.</p>
      </header>

      <div className="flex gap-4 items-center bg-white p-6 rounded-[2rem] shadow-apple border border-gray-50">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Buscar por rol, empresa o stack..." 
            className="pl-12 bg-gray-50 border-none h-14 rounded-2xl" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <Loader2 className="h-10 w-10 animate-spin text-brand-blue" />
        </div>
      ) : (
        <div className="space-y-6">
          {filteredJobs.length > 0 ? filteredJobs.map((job) => (
            <div key={job.id} className="bg-white rounded-[2.5rem] p-8 md:p-10 flex flex-col md:flex-row gap-8 items-center border border-gray-50 shadow-apple hover:shadow-apple-lg transition-all group border border-transparent hover:border-brand-blue/10">
              <div className="flex-grow space-y-6 w-full">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-black leading-none italic group-hover:text-brand-blue transition-colors">{job.title}</h2>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">{job.company}</p>
                  </div>
                  <div className="md:hidden text-right">
                    <div className="text-3xl font-black text-brand-blue italic">{job.match}%</div>
                    <div className="text-[8px] font-bold uppercase tracking-widest text-gray-300">Match</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-blue" /> {job.location || "Remoto"}</div>
                  <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-brand-blue" /> {job.type || "Tiempo completo"}</div>
                  <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-brand-blue" /> {job.salary || "No especificado"}</div>
                  
                </div>

                <div className="flex flex-wrap gap-2">
                  {(job.requiredSkills || []).map((s: string) => (
                    <Badge key={s} className="bg-gray-50 text-gray-400 border-none rounded-full py-1.5 px-4 text-[9px] font-bold uppercase tracking-widest">
                      {s}
                    </Badge>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                   <p className="text-[9px] font-medium text-gray-400 max-w-xs leading-tight">
                     Al completar la prueba, tu resultado verificado se comparte con el reclutador de esta vacante.
                   </p>
                   <Link href={`/dashboard/line?jobId=${job.id}`}>
                    <Button variant="ghost" className="text-brand-blue font-black italic tracking-tight hover:bg-brand-blue/5 h-12 px-6 rounded-xl">
                      POSTULAR CON THE LINE <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                   </Link>
                </div>
              </div>
              <div className="hidden md:block text-right shrink-0 border-l border-gray-50 pl-10">
                 <div className="text-6xl font-black text-brand-blue tracking-tighter italic">{job.match}%</div>
                 <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300 mt-2">Afinidad CORE</div>
              </div>
            </div>
          )) : (
            <div className="p-20 text-center bg-white rounded-[3rem] border border-dashed text-gray-400 italic font-medium">
              No hay vacantes sincronizadas con tu DNA actualmente.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
