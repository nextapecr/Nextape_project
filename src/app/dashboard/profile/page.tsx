"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Zap, Loader2, User as UserIcon, Github, ArrowRight, Briefcase, Pencil } from "lucide-react";
import { SkillsService } from "@/services/skills.service";
import { UserService } from "@/services/users.service";
import { UserProfile } from "@/types/user.types";
import { useAuthUser } from "@/hooks/use-auth-user";
import Link from "next/link";
import { getTechnicalGrade } from "@/lib/grading";
import { normalizeCandidateProfile, summarizeCandidate } from "@/lib/candidate-profile";
import { findTechnology } from "@/lib/technologies";

export default function ProfilePage() {
  const { user, authLoading } = useAuthUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<{name: string, value: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState("N/A");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const loadProfileData = async () => {
      try {
        const [userData, skillData] = await Promise.all([
          UserService.getUser(user.uid),
          SkillsService.getSkills(user.uid)
        ]);

        setProfile(userData);

        if (skillData?.scores) {
          const formatted = Object.entries(skillData.scores).map(([name, val]) => ({
            name: name.toUpperCase(),
            value: val as number
          }));
          setSkills(formatted);
          setGrade(getTechnicalGrade(skillData.scores));
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, [user, authLoading]);

  const candidate = profile?.candidateProfile ? normalizeCandidateProfile(profile.candidateProfile) : null;
  const summary = candidate ? summarizeCandidate(candidate) : null;

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-16">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gray-100 rounded-[2rem] flex items-center justify-center border border-gray-200">
               <UserIcon className="h-10 w-10 text-gray-400" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-black italic leading-none">{profile?.displayName || "Candidato"}</h1>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2">{profile?.role === "recruiter" ? "Empresa" : "Desarrollador"} · identidad verificada</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-10 rounded-[2.5rem] shadow-apple border border-gray-50 text-center min-w-[240px]">
          <span className="text-7xl font-black tracking-tighter text-brand-blue leading-none italic">{grade}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] block mt-4 text-gray-300">Grado Técnico</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          <div className="bg-white p-12 rounded-[3rem] shadow-apple border border-gray-50 space-y-12">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-brand-blue/10 rounded-2xl">
                 <Zap className="h-7 w-7 text-brand-blue" />
              </div>
              <h2 className="text-2xl font-bold text-black italic">DNA Técnico</h2>
            </div>
            
            <div className="space-y-10">
              {skills.length > 0 ? skills.map(skill => (
                <div key={skill.name} className="space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="font-bold text-sm uppercase tracking-widest text-black">{skill.name}</p>
                    <span className="font-black text-2xl text-brand-blue italic">{skill.value}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-50 overflow-hidden border border-gray-100">
                    <div 
                      className="h-full bg-brand-blue rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${skill.value}%` }}
                    />
                  </div>
                </div>
              )) : (
                <div className="py-12 text-center text-gray-400 italic font-medium">
                  DNA técnico no sincronizado. Completa una prueba en "The LINE" para activar tu perfil.
                </div>
              )}
            </div>
          </div>

          {profile?.role !== "recruiter" && (
            <div className="bg-white p-12 rounded-[3rem] shadow-apple border border-gray-50 space-y-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-brand-blue/10 rounded-2xl">
                    <Briefcase className="h-7 w-7 text-brand-blue" />
                  </div>
                  <h2 className="text-2xl font-bold text-black italic">Perfil profesional</h2>
                </div>
                <Link href="/dashboard/onboarding">
                  <span className="lift inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-black">
                    <Pencil className="h-3 w-3" /> {summary ? "Editar" : "Completar"}
                  </span>
                </Link>
              </div>

              {summary && candidate ? (
                <div className="space-y-8 text-sm">
                  <div className="space-y-1">
                    <p className="text-xl font-bold italic">{summary.headline}</p>
                    <p className="text-gray-400 font-medium">
                      {[summary.selfLevel, summary.yearsOfExperience, summary.location, summary.workModes.join(" / "), summary.availability && `Disponibilidad: ${summary.availability}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {[
                    { title: "Experiencia", items: summary.recentWork, empty: "Sin experiencia laboral declarada." },
                    { title: "Estudios", items: summary.education, empty: "Sin estudios declarados." },
                    { title: "Certificaciones", items: candidate.certifications, empty: "" },
                    { title: "Idiomas", items: summary.languages, empty: "" },
                    { title: "Tecnologías que usa", items: candidate.technologies.map((t) => findTechnology(t)?.label ?? t), empty: "" },
                  ]
                    .filter((g) => g.items.length > 0 || g.empty)
                    .map((g) => (
                      <div key={g.title} className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">{g.title}</p>
                        {g.items.length > 0 ? (
                          <ul className="space-y-1 font-medium text-gray-700">
                            {g.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-400 italic">{g.empty}</p>
                        )}
                      </div>
                    ))}
                  {candidate.lookingFor && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Qué busca</p>
                      <p className="font-medium text-gray-700 whitespace-pre-line">{candidate.lookingFor}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-6 text-center text-gray-400 italic font-medium">
                  Aún no completaste tu perfil profesional: experiencia, estudios y dónde has trabajado.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-8">
           {/* La tarjeta completa vive en /dashboard/github, con su entrada de menú: aquí quedaba
               en la tercera columna bajo el DNA y en pantallas pequeñas nadie la encontraba. */}
           <Link href="/dashboard/github" className="block">
             <div className="lift-sm bg-white p-8 rounded-[2.5rem] shadow-apple border border-gray-50 hover:shadow-apple-lg space-y-4">
               <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center">
                 <Github className="h-6 w-6 text-white" />
               </div>
               <h3 className="text-xl font-bold italic">Evidencia de GitHub.</h3>
               <p className="text-xs text-gray-400 font-medium leading-relaxed">
                 Analiza tu código real y súmalo a tu identidad técnica.
               </p>
               <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-blue">
                 Abrir <ArrowRight className="h-3 w-3" />
               </span>
             </div>
           </Link>

           <div className="bg-gray-950 p-12 rounded-[3rem] text-white space-y-10 shadow-apple-lg relative overflow-hidden group">
             <Fingerprint className="h-12 w-12 text-brand-blue relative z-10" />
             <div className="space-y-4 relative z-10">
                <h3 className="text-2xl font-bold tracking-tight italic">Estado del CORE.</h3>
                <p className="text-sm text-gray-400 font-medium leading-relaxed">
                  Tu identidad técnica está activa. Cuando actives el emparejamiento con vacantes, tu DNA verificado podrá compartirse con las empresas.
                </p>
             </div>
             <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-brand-blue/10 rounded-full blur-3xl group-hover:scale-125 transition-transform" />
           </div>
        </div>
      </div>
    </div>
  );
}
