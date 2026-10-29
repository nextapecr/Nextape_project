"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, Target, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobService } from "@/services/jobs.service";
import { SkillsService } from "@/services/skills.service";
import { useAuthUser } from "@/hooks/use-auth-user";

export default function CompatibilityPage() {
  const { user, authLoading } = useAuthUser();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgMatch, setAvgMatch] = useState(0);

  const calculateLiveCompatibility = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [jobs, skillData] = await Promise.all([
        JobService.getLatestJobs(),
        SkillsService.getSkills(user.uid)
      ]);

      const userScores = skillData?.scores || {};
      const calculated = jobs.map(job => {
        const score = JobService.calculateMatch(job.requiredSkills || [], userScores);
        return {
          ...job,
          matchScore: score
        };
      }).sort((a, b) => b.matchScore - a.matchScore);

      setMatches(calculated);

      if (calculated.length > 0) {
        const sum = calculated.reduce((acc, curr) => acc + curr.matchScore, 0);
        setAvgMatch(Number((sum / calculated.length / 10).toFixed(1)));
      } else {
        setAvgMatch(0);
      }
    } catch (error) {
      console.error("Error in compatibility analysis:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void calculateLiveCompatibility(); // los errores se manejan dentro (try/catch)
  }, [user, authLoading, calculateLiveCompatibility]);

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
          <h1 className="text-4xl font-bold tracking-tight text-black italic">Motor de Compatibilidad.</h1>
          <p className="text-gray-500 font-medium text-sm">Análisis de brecha técnica basado en tu CORE real vs mercado.</p>
        </div>
        <Button
          onClick={() => calculateLiveCompatibility()}
          disabled={loading}
          className="h-14 px-8 bg-brand-blue rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-apple hover:scale-105 transition-all text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
          Recalcular Auditoría
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <div className="col-span-1 md:col-span-2 bg-gray-950 p-12 rounded-[2.5rem] text-white flex flex-col md:flex-row justify-between items-center gap-10 shadow-apple-lg relative overflow-hidden">
            <div className="space-y-4 relative z-10">
               <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-brand-blue rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-blue">ANÁLISIS DE MERCADO EN VIVO</span>
               </div>
               <h2 className="text-3xl font-bold tracking-tight leading-tight">Tu potencial de <br /><span className="text-brand-blue">contratación verificado.</span></h2>
               <p className="text-gray-400 text-sm max-w-sm">Este score refleja tu afinidad con las vacantes actuales según tus resultados en The LINE.</p>
            </div>
            <div className="text-center relative z-10 bg-white/5 p-10 rounded-[2.5rem] border border-white/10 backdrop-blur-3xl">
               <span className="text-7xl font-black italic tracking-tighter text-brand-blue leading-none">{avgMatch || "0.0"}</span>
               <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-4">Índice de Rango</span>
            </div>
         </div>
         
         <div className="bg-white p-12 rounded-[2.5rem] shadow-apple border border-gray-50 flex flex-col justify-center space-y-8">
            <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
               <Target className="h-7 w-7 text-brand-blue" />
            </div>
            <div className="space-y-2">
               <h4 className="font-bold text-2xl text-black leading-none italic">Brecha de Habilidades.</h4>
               <p className="text-sm text-gray-400 font-medium leading-relaxed mt-2">
                 {avgMatch > 8 ? "Tu perfil es excepcional. No hay brechas críticas." : "Identificamos habilidades clave para desbloquear puestos Tier 1."}
               </p>
            </div>
         </div>
      </div>

      <div className="space-y-8">
         <h3 className="text-2xl font-bold tracking-tight px-2 text-black italic">Coincidencias de Alta Fidelidad.</h3>
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {matches.length > 0 ? matches.map((job, idx) => (
              <div key={idx} className="bg-white rounded-[2.5rem] p-10 border border-gray-50 shadow-apple space-y-10 group hover:shadow-apple-lg transition-all">
                 <div className="flex justify-between items-start">
                    <div className="space-y-2">
                       <h4 className="text-3xl font-bold group-hover:text-brand-blue transition-colors text-black leading-none italic">{job.title}</h4>
                       <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-2">{job.company}</p>
                    </div>
                    <div className="text-5xl font-black text-brand-blue tracking-tighter italic">{job.matchScore}%</div>
                 </div>
                 
                 <div className="space-y-6">
                    <div className="p-6 bg-gray-50 rounded-[1.5rem] space-y-3">
                       <span className="text-[9px] font-bold uppercase tracking-widest text-brand-blue">Análisis de Compatibilidad</span>
                       <p className="text-sm font-medium text-gray-600 italic leading-relaxed">
                         Match basado en {job.requiredSkills?.length || 0} habilidades verificadas en tu CORE.
                       </p>
                    </div>
                 </div>

                 <Link href={`/dashboard/line?jobId=${job.id}`} className="pt-8 border-t border-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-black transition-colors">
                       <Briefcase className="h-4 w-4" /> Postular con tu Identidad
                    </div>
                    <ArrowRight className="h-6 w-6 text-brand-blue group-hover:translate-x-2 transition-transform" />
                 </Link>
              </div>
            )) : (
              <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border border-dashed text-gray-400 italic">
                No hay vacantes disponibles para comparar en este momento.
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
