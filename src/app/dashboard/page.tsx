"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Fingerprint, Target, Users, Loader2, Briefcase, PlusCircle, Activity, UserPen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase/client";
import { collection, query, where, getDocs } from "firebase/firestore";
import { SkillsService } from "@/services/skills.service";
import { JobService } from "@/services/jobs.service";
import { UserService } from "@/services/users.service";
import { UserProfile } from "@/types/user.types";
import { useAuthUser } from "@/hooks/use-auth-user";
import { calculateAverageScore } from "@/lib/grading";
import { isCandidateProfileComplete, normalizeCandidateProfile } from "@/lib/candidate-profile";

export default function DashboardPage() {
  const { user, authLoading } = useAuthUser();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setMetrics] = useState({
    dnaIntegrity: null as number | null,
    assessmentsCount: 0,
    jobsMatchCount: 0,
    activeVacancies: 0,
    totalApplicants: 0
  });
  const [topMatches, setTopMatches] = useState<any[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const loadDashboardData = async () => {
      try {
        const userData = await UserService.getUser(user.uid);
        setProfile(userData as UserProfile);

        if (userData?.role === "recruiter") {
          const qJobs = query(collection(db, "jobs"), where("createdBy", "==", user.uid));
          const jobsSnap = await getDocs(qJobs);
          const totalApplicants = jobsSnap.docs.reduce(
            (sum, d) => sum + (d.data().applicantsCount || 0),
            0
          );

          setMetrics(prev => ({
            ...prev,
            activeVacancies: jobsSnap.size,
            totalApplicants
          }));
        } else {
          const skillData = await SkillsService.getSkills(user.uid);
          const scores = skillData?.scores || {};
          // `null` cuando no hay ninguna evaluación: no es un 0, es "aún sin medir".
          const avg = calculateAverageScore(scores);
          const avgScore = avg === null ? null : Math.round(avg);

          const qAttempts = query(collection(db, "assessment_attempts"), where("userId", "==", user.uid));
          const attemptsSnap = await getDocs(qAttempts);

          const jobs = await JobService.getLatestJobs();
          const matches = jobs.map(job => ({
            ...job,
            score: JobService.calculateMatch(job.requiredSkills || [], scores)
          })).sort((a, b) => b.score - a.score);

          setMetrics(prev => ({
            ...prev,
            dnaIntegrity: avgScore,
            assessmentsCount: attemptsSnap.size,
            jobsMatchCount: countStrongMatches(matches)
          }));
          setTopMatches(matches.slice(0, 2));
        }

      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user, authLoading]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (profile?.role === "recruiter") {
    return (
      <div className="space-y-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-black italic">Panel de Reclutador.</h1>
            <p className="text-gray-500 font-medium text-sm">Gestión de talento verificado por simulación neural.</p>
          </div>
          <Link href="/dashboard/vacancies/new">
            <Button className="bg-brand-blue text-white rounded-2xl h-14 px-8 font-bold uppercase tracking-widest text-[10px] shadow-apple-lg hover:scale-105 transition-all">
              <PlusCircle className="mr-2 h-4 w-4" /> Crear Nueva Vacante
            </Button>
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <Card className="rounded-[2.5rem] border-none shadow-apple p-10 bg-white">
              <div className="space-y-4">
                 <Briefcase className="h-8 w-8 text-brand-blue" />
                 <div>
                    <div className="text-5xl font-black italic tracking-tighter text-black">{stats.activeVacancies}</div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-2">Posiciones Activas</p>
                 </div>
              </div>
           </Card>
           
           <Card className="rounded-[2.5rem] border-none shadow-apple p-10 bg-black text-white">
              <div className="space-y-4">
                 <Users className="h-8 w-8 text-brand-blue" />
                 <div>
                    <div className="text-5xl font-black italic tracking-tighter text-white">{stats.totalApplicants}</div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-2">Candidatos en Pipeline</p>
                 </div>
              </div>
           </Card>

           <Card className="rounded-[2.5rem] border-none shadow-apple p-10 bg-brand-blue/5 border border-brand-blue/10 flex items-center justify-center">
              <div className="text-center space-y-2">
                 <Activity className="h-6 w-6 text-brand-blue mx-auto mb-2" />
                 <p className="text-[10px] font-bold text-brand-blue uppercase tracking-widest italic leading-relaxed">
                   IA ANALIZANDO <br /> TALENTO REAL
                 </p>
              </div>
           </Card>
        </div>

        <div className="bg-white rounded-[3rem] p-12 shadow-apple border border-gray-50 text-center space-y-6">
           <div className="w-16 h-16 bg-gray-50 rounded-full mx-auto flex items-center justify-center">
              <Target className="h-8 w-8 text-gray-200" />
           </div>
           <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-xl font-bold italic">Soberanía de Datos Técnicos.</h3>
              <p className="text-sm text-gray-400 font-medium">Nextape solo te muestra candidatos que han superado simulaciones técnicas reales en "The LINE".</p>
           </div>
           <Link href="/dashboard/vacancies" className="inline-block pt-4">
              <Button variant="outline" className="rounded-xl border-gray-100 font-bold uppercase tracking-widest text-[10px]">Administrar Vacantes</Button>
           </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black italic">Dashboard.</h1>
          <p className="text-gray-500 font-medium text-sm">Tu Identidad Técnica Verificada en tiempo real.</p>
        </div>
        <div className="bg-white shadow-apple px-6 py-3 rounded-full border border-gray-100 text-[10px] font-bold flex items-center gap-3">
          <div className="w-2 h-2 bg-brand-green rounded-full animate-pulse" />
          ESTADO: CORE SINCRONIZADO
        </div>
      </header>

      {/* Quien se registró antes de existir el cuestionario, o lo dejó para después. */}
      {!isCandidateProfileComplete(profile?.candidateProfile ? normalizeCandidateProfile(profile.candidateProfile) : null) && (
        <Link href="/dashboard/onboarding" className="block">
          <div className="lift-sm flex flex-col sm:flex-row sm:items-center gap-4 bg-gray-950 text-white rounded-[2rem] p-6 md:p-8 shadow-apple-lg">
            <div className="w-12 h-12 shrink-0 bg-brand-blue/20 rounded-2xl flex items-center justify-center">
              <UserPen className="h-6 w-6 text-brand-blue" />
            </div>
            <div className="flex-grow space-y-1">
              <p className="text-lg font-bold italic">Completa tu perfil profesional.</p>
              <p className="text-sm text-gray-400 font-medium">
                Experiencia, estudios y dónde has trabajado. Las empresas lo ven junto con tu resultado de The LINE.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-blue shrink-0">
              Completar <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: "Integridad del DNA", value: stats.dnaIntegrity === null ? "—" : `${stats.dnaIntegrity}%`, color: "bg-brand-blue" },
          { label: "Simulaciones", value: stats.assessmentsCount.toString(), color: "bg-brand-green" },
          { label: "Oportunidades", value: stats.jobsMatchCount.toString(), color: "bg-brand-orange" }
        ].map((m, idx) => (
          <Card key={idx} className="border-none shadow-apple rounded-[2rem] overflow-hidden bg-white group hover:shadow-apple-lg transition-all border border-gray-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black tracking-tighter italic">{m.value}</div>
              <div className={`h-1.5 w-8 rounded-full mt-4 transition-all group-hover:w-16 ${m.color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold tracking-tight text-black italic">Coincidencias de Alta Prioridad.</h2>
            <Link href="/dashboard/jobs" className="text-brand-blue text-[10px] font-bold uppercase tracking-widest hover:underline flex items-center gap-2">
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          
          <div className="space-y-4">
            {topMatches.length > 0 ? topMatches.map((job, idx) => (
              <div key={idx} className="bg-white rounded-[2rem] p-8 border border-gray-50 shadow-apple flex justify-between items-center group cursor-pointer hover:scale-[1.01] transition-all">
                <div className="space-y-3">
                  <h3 className="text-xl font-bold text-black group-hover:text-brand-blue transition-colors italic">{job.title}</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{job.company}</p>
                  <div className="flex gap-2 pt-2">
                    {(job.requiredSkills || []).map((s: string) => (
                      <Badge key={s} variant="secondary" className="rounded-full px-4 py-1 text-[8px] font-bold bg-gray-50 text-gray-400 uppercase tracking-widest border-none">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-black text-brand-blue tracking-tighter italic">{job.score}%</div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300">Afinidad CORE</span>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center bg-white rounded-[2rem] border border-dashed text-gray-400 italic font-medium">
                No hay vacantes sincronizadas con tu DNA actualmente.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <h2 className="text-xl font-bold tracking-tight px-2 italic text-black">Huella Técnica.</h2>
          <div className="bg-gray-950 rounded-[2.5rem] p-10 text-white space-y-8 shadow-apple-lg relative overflow-hidden group">
            <div className="relative z-10 space-y-6">
              <div className="w-12 h-12 bg-brand-blue/20 rounded-2xl flex items-center justify-center">
                <Fingerprint className="h-6 w-6 text-brand-blue" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold italic tracking-tight">Tu CORE está activo.</h4>
                <p className="text-sm text-gray-400 font-medium leading-relaxed">
                  Realiza más simulaciones en The LINE para aumentar tu visibilidad ante empresas Tier 1.
                </p>
              </div>
              <Link href="/dashboard/line" className="block w-full">
                <Button className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white rounded-2xl h-14 font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all">
                  Iniciar Simulación
                </Button>
              </Link>
            </div>
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-brand-blue/10 rounded-full blur-3xl group-hover:scale-125 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Vacantes con más de 70 % de compatibilidad. */
function countStrongMatches(matches: ReadonlyArray<{ score: number }>): number {
  return matches.filter((m) => m.score > 70).length;
}
