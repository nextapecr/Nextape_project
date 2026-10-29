
"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Zap, Target, Activity, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SkillsService } from "@/services/skills.service";
import { useAuthUser } from "@/hooks/use-auth-user";
import { getTechnicalGrade } from "@/lib/grading";
import { SkillBars } from "@/components/dna/SkillBars";

export default function CorePage() {
  const { user, authLoading } = useAuthUser();
  const [skills, setSkills] = useState<{name: string, value: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState("N/A");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const loadCoreData = async () => {
      try {
        const skillData = await SkillsService.getSkills(user.uid);
        const scores = skillData?.scores || {};
        const formattedSkills = Object.entries(scores).map(([name, value]) => ({
          name: name.toUpperCase(),
          value: value as number
        }));

        setSkills(formattedSkills);
        setGrade(getTechnicalGrade(scores));
      } catch (error) {
        console.error("Error loading CORE data:", error);
      } finally {
        setLoading(false);
      }
    };

    void loadCoreData(); // los errores se manejan dentro (try/catch)
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
          <div className="inline-flex items-center gap-2 bg-brand-blue/10 text-brand-blue px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
            <Activity className="h-3 w-3" /> Identidad Verificada
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-black italic">CORE.</h1>
          <p className="text-gray-500 font-medium text-sm">Tu representación técnica verificada mediante simulación técnica.</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-apple border border-gray-50 text-center min-w-[200px]">
          <span className="text-6xl font-black tracking-tighter text-brand-blue leading-none italic">{grade}</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] block mt-3 text-gray-300">Grado Técnico</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 bg-white p-12 rounded-[3rem] shadow-apple border border-gray-50 space-y-12">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
                 <Fingerprint className="h-6 w-6 text-brand-blue" />
              </div>
              <h2 className="text-2xl font-bold italic tracking-tight">DNA Técnico.</h2>
           </div>
           
           <div className="space-y-10">
              <SkillBars
                skills={skills}
                emptyText={"Tu DNA técnico está vacío. Completa una simulación en \"The LINE\" para generar datos."}
              />
           </div>
        </div>

        <div className="space-y-8">
           <Card className="rounded-[2.5rem] border-none shadow-apple p-8 space-y-6">
              <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
                 <Zap className="h-6 w-6 text-brand-blue" />
              </div>
              <div className="space-y-2">
                 <h4 className="font-bold text-xl">Potencial.</h4>
                 <p className="text-sm text-gray-400 font-medium leading-relaxed italic">
                   {grade === "N/A" ? "Completa una prueba en The LINE para calcular tu grado técnico." : `Tu grado técnico actual es ${grade}.`}
                 </p>
              </div>
           </Card>

           <Card className="rounded-[2.5rem] border-none shadow-apple p-8 space-y-6 bg-black text-white">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-brand-blue">
                 <Target className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                 <h4 className="font-bold text-xl">Visibilidad.</h4>
                 <p className="text-sm text-gray-400 font-medium leading-relaxed">Tu DNA está listo para compartirse con empresas cuando actives el emparejamiento con vacantes.</p>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}
