"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, ArrowLeft, Target, Terminal } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-auth-user";
import { SkillPicker } from "@/components/vacancies/SkillPicker";

export default function NewVacancyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, authLoading } = useAuthUser();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    company: "",
    description: "",
    salary: "",
    location: "Remote",
    type: "Full-time",
    level: "senior",
    skills: [] as string[],
    // Vacío = automático (10 con GitHub analizado, 20 sin él).
    examQuestionCount: "",
    examTimeLimitMinutes: ""
  });

  // El nombre de la empresa se prefija con el del perfil, pero es editable: un reclutador puede
  // publicar para varias marcas. Antes estaba hardcodeado a "Empresa NEXTAPE" en TODA vacante,
  // así que el developer veía el mismo nombre de empresa en el listado de empleos.
  useEffect(() => {
    if (!authLoading && user && !formData.company) {
      setFormData((prev) => ({ ...prev, company: user.displayName ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    const skillsArray = formData.skills;
    if (skillsArray.length === 0) {
      toast({ title: "Elige al menos una habilidad", description: "La prueba de la vacante se compone a partir de ellas.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const jobData = {
      title: formData.title,
      description: formData.description,
      salary: formData.salary,
      location: formData.location,
      type: formData.type,
      level: formData.level,
      requiredSkills: skillsArray,
      createdBy: auth.currentUser.uid,
      company: formData.company.trim() || "Empresa",
      ...(formData.examQuestionCount
        ? { examQuestionCount: Math.min(Math.max(Math.round(Number(formData.examQuestionCount)), 10), 30) }
        : {}),
      // Minutos para responder la prueba (5–480). Vacío = 30, como una práctica de The LINE.
      ...(formData.examTimeLimitMinutes
        ? { examTimeLimitMinutes: Math.min(Math.max(Math.round(Number(formData.examTimeLimitMinutes)), 5), 480) }
        : {}),
      active: true,
      postedAt: Timestamp.now(),
      applicantsCount: 0,
      // El repertorio de preguntas aún no existe: lo crea /api/jobs/assessment justo debajo.
      assessmentReady: false
    };

    // 1) Crear la vacante. Si esto falla, no hay nada creado.
    let jobId: string;
    try {
      const docRef = await addDoc(collection(db, "jobs"), jobData);
      jobId = docRef.id;
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear la vacante.",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    // 2) Generar EN SERVIDOR el repertorio de preguntas de la vacante (banco protegido con la
    // clave de respuestas). Cada candidato responderá un sorteo de ese banco, sin volver a llamar
    // a la IA. Si falla, la vacante YA existe y el repertorio se creará en la primera simulación.
    try {
      const res = await apiPost<{ poolSize: number }>("/api/jobs/assessment", { jobId });
      toast({
        title: "¡Vacante publicada!",
        description: `The LINE lista con un repertorio de ${res.poolSize} preguntas.`
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      toast({
        title: "Vacante creada, prueba pendiente",
        description: code === "no_bank_for_skills"
          ? "Sus habilidades aún no tienen preguntas suficientes. Ajústalas desde Gestionar vacante."
          : "No se pudo crear la prueba ahora. Puedes crearla desde Gestionar vacante.",
        variant: "destructive"
      });
    }

    setLoading(false);
    router.push("/dashboard/vacancies");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <header className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()} className="rounded-full h-10 w-10 p-0 bg-white shadow-apple border border-gray-100">
           <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
           <h1 className="text-3xl font-bold tracking-tight text-black italic">Publicar Vacante.</h1>
           <p className="text-gray-400 font-medium text-sm uppercase tracking-widest font-bold mt-1">Configuración técnica de élite</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-8">
           <div className="bg-white p-10 rounded-[2.5rem] shadow-apple border border-gray-50 space-y-8">
              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">Título de la Posición</Label>
                 <Input 
                   required
                   value={formData.title}
                   onChange={e => setFormData({...formData, title: e.target.value})}
                   placeholder="Ej: Senior React Architect" 
                   className="h-14 bg-gray-50 border-none rounded-2xl px-6 text-lg font-bold"
                 />
              </div>

              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">Empresa</Label>
                 <Input
                   required
                   value={formData.company}
                   onChange={e => setFormData({...formData, company: e.target.value})}
                   placeholder="Nombre de tu empresa"
                   className="h-14 bg-gray-50 border-none rounded-2xl px-6 text-lg font-bold"
                 />
              </div>

              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">Descripción del Rol</Label>
                 <Textarea 
                   required
                   value={formData.description}
                   onChange={e => setFormData({...formData, description: e.target.value})}
                   placeholder="Describe las responsabilidades principales..." 
                   className="min-h-[200px] bg-gray-50 border-none rounded-2xl p-6 text-sm font-medium leading-relaxed"
                 />
              </div>

              <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">Salario Estimado</Label>
                    <Input 
                      value={formData.salary}
                      onChange={e => setFormData({...formData, salary: e.target.value})}
                      placeholder="Ej: $80k - $120k" 
                      className="h-12 bg-gray-50 border-none rounded-xl"
                    />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">Ubicación</Label>
                    <Input
                      value={formData.location}
                      onChange={e => setFormData({...formData, location: e.target.value})}
                      placeholder="Remoto / Ciudad"
                      className="h-12 bg-gray-50 border-none rounded-xl"
                    />
                 </div>
                 {/* Antes este campo existía en el estado con valor fijo "Full-time" y sin UI:
                     todas las vacantes se guardaban como tiempo completo. */}
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">Tipo de contrato</Label>
                    <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                       <SelectTrigger className="h-12 bg-gray-50 border-none rounded-xl">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent className="rounded-xl">
                          <SelectItem value="Full-time">Tiempo completo</SelectItem>
                          <SelectItem value="Part-time">Medio tiempo</SelectItem>
                          <SelectItem value="Contract">Por contrato</SelectItem>
                          <SelectItem value="Internship">Prácticas</SelectItem>
                       </SelectContent>
                    </Select>
                 </div>
              </div>
           </div>
        </div>

        <div className="space-y-8">
           <div className="bg-gray-950 p-10 rounded-[2.5rem] text-white space-y-8 shadow-apple-lg relative overflow-hidden">
              <div className="relative z-10 space-y-6">
                 <div className="w-12 h-12 bg-brand-blue/20 rounded-2xl flex items-center justify-center">
                    <Target className="h-6 w-6 text-brand-blue" />
                 </div>
                 <div className="space-y-2">
                    <h4 className="text-xl font-bold italic">Stack de Precisión.</h4>
                    <p className="text-[10px] text-gray-400 font-medium leading-relaxed">La IA usará estos datos para generar los desafíos técnicos en "The LINE".</p>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-2">
                       <Label className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Dificultad de la Prueba</Label>
                       <Select value={formData.level} onValueChange={v => setFormData({...formData, level: v})}>
                          <SelectTrigger className="bg-white/5 border-none h-12 rounded-xl text-white">
                             <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-apple-lg">
                             <SelectItem value="junior">Junior</SelectItem>
                             <SelectItem value="mid">Mid</SelectItem>
                             <SelectItem value="senior">Senior</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>

                    <div className="space-y-2">
                       <Label className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Habilidades</Label>
                       <SkillPicker tone="dark" value={formData.skills} onChange={(skills) => setFormData({ ...formData, skills })} />
                    </div>

                    <div className="space-y-2">
                       <Label className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Preguntas por examen</Label>
                       <Input
                         type="number"
                         min={10}
                         max={30}
                         placeholder="Automático"
                         value={formData.examQuestionCount}
                         onChange={e => setFormData({...formData, examQuestionCount: e.target.value})}
                         className="bg-white/5 border-none h-12 rounded-xl text-white px-4"
                       />
                       <p className="text-[9px] text-gray-500 leading-relaxed">
                         Déjalo vacío para usar el tamaño automático: 10 preguntas si el candidato tiene su
                         GitHub analizado, 20 si no. Si lo fijas, entre 10 y 30.
                       </p>
                    </div>

                    <div className="space-y-2">
                       <Label className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Tiempo límite (minutos)</Label>
                       <Input
                         type="number"
                         min={5}
                         max={480}
                         placeholder="30"
                         value={formData.examTimeLimitMinutes}
                         onChange={e => setFormData({...formData, examTimeLimitMinutes: e.target.value})}
                         className="bg-white/5 border-none h-12 rounded-xl text-white px-4"
                       />
                       <p className="text-[9px] text-gray-500 leading-relaxed">
                         Cuánto tiempo tiene cada candidato para responder. Déjalo vacío para 30 minutos.
                         Puedes poner entre 5 y 480 (8 horas). Al acabarse, la prueba se envía sola.
                       </p>
                    </div>
                 </div>

                 <Button 
                   type="submit"
                   disabled={loading}
                   className="w-full h-14 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-apple-lg active:scale-95 transition-all"
                 >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="animate-spin h-4 w-4" /> DISEÑANDO...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /> LANZAR VACANTE
                      </span>
                    )}
                 </Button>
              </div>
              <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-brand-blue/10 rounded-full blur-2xl" />
           </div>

           <div className="p-8 bg-white rounded-[2rem] shadow-apple border border-gray-50 flex items-center gap-4">
              <Terminal className="h-5 w-5 text-brand-blue" />
              <p className="text-[10px] font-bold text-gray-400 leading-tight">
                 NOTIFICACIÓN: Se activará un entorno neural único para esta vacante tras la publicación.
              </p>
           </div>
        </div>
      </form>
    </div>
  );
}
