"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  Save,
  Archive,
  ArchiveRestore,
  RefreshCw,
  Terminal,
  AlertTriangle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useToast } from "@/hooks/use-toast";
import { JobService } from "@/services/jobs.service";
import { apiPost } from "@/lib/api";
import type { JobOpportunity } from "@/types/job.types";
import { SkillPicker, normalizeJobSkills } from "@/components/vacancies/SkillPicker";

const byText = (a: string, b: string) => a.localeCompare(b);

/**
 * Gestión de una vacante publicada: editar sus datos, archivarla y regenerar su repertorio
 * de preguntas. Antes no existía — una vacante publicada era inmutable.
 */
export default function ManageVacancyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { user, authLoading } = useAuthUser();
  const { toast } = useToast();

  const [job, setJob] = useState<JobOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    company: "",
    description: "",
    salary: "",
    location: "",
    type: "Full-time",
    level: "senior",
    skills: [] as string[],
    examQuestionCount: "",
    examTimeLimitMinutes: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const data = await JobService.getJob(jobId);
        if (!data) {
          setError("Esta vacante no existe.");
          return;
        }
        // La regla de Firestore ya impide que un tercero escriba, pero sin este control la UI
        // dejaría abrir el formulario y solo fallaría al guardar.
        if (data.createdBy !== user.uid) {
          setError("Esta vacante no es tuya.");
          return;
        }
        setJob(data);
        setForm({
          title: data.title ?? "",
          company: data.company ?? "",
          description: data.description ?? "",
          salary: data.salary ?? "",
          location: data.location ?? "",
          type: data.type || "Full-time",
          level: data.level || "senior",
          skills: normalizeJobSkills(data.requiredSkills),
          examQuestionCount: data.examQuestionCount ? String(data.examQuestionCount) : "",
          examTimeLimitMinutes: data.examTimeLimitMinutes ? String(data.examTimeLimitMinutes) : "",
        });
      } catch (err) {
        console.error("Error loading vacancy:", err);
        setError("No se pudo cargar la vacante.");
      } finally {
        setLoading(false);
      }
    };

    void load(); // los errores se manejan dentro (try/catch)
  }, [jobId, user, authLoading]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skills = form.skills;
      if (skills.length === 0) {
        toast({ title: "Elige al menos una habilidad", variant: "destructive" });
        return;
      }
      const skillsChanged =
        JSON.stringify([...skills].sort(byText)) !== JSON.stringify(normalizeJobSkills(job?.requiredSkills).sort(byText));

      await JobService.updateJob(jobId, {
        title: form.title,
        company: form.company.trim() || "Empresa",
        description: form.description,
        salary: form.salary,
        location: form.location,
        type: form.type,
        level: form.level,
        requiredSkills: skills,
        examQuestionCount: form.examQuestionCount
          ? Math.min(Math.max(Math.round(Number(form.examQuestionCount)), 10), 30)
          : null,
        examTimeLimitMinutes: form.examTimeLimitMinutes
          ? Math.min(Math.max(Math.round(Number(form.examTimeLimitMinutes)), 5), 480)
          : null,
        updatedAt: Timestamp.now(),
      });
      // Si cambiaron las skills, la prueba anterior ya no evalúa el puesto: se recompone al momento
      // (desde el banco, sin IA). Antes había que acordarse de pulsar "Regenerar" aparte.
      if (skillsChanged) {
        try {
          const res = await apiPost<{ poolSize: number }>("/api/jobs/assessment", { jobId, force: true });
          setJob((prev) => (prev ? { ...prev, requiredSkills: skills, assessmentReady: true, assessmentPoolSize: res.poolSize } : prev));
          toast({ title: "Cambios guardados", description: `Prueba actualizada: ${res.poolSize} preguntas.` });
        } catch {
          // Las skills ya se guardaron; el servidor marcó la prueba como no lista. La pantalla lo refleja.
          setJob((prev) => (prev ? { ...prev, requiredSkills: skills, assessmentReady: false } : prev));
          toast({ title: "Cambios guardados", description: "Pero la prueba no se pudo actualizar: revisa las habilidades.", variant: "destructive" });
        }
      } else {
        toast({ title: "Cambios guardados" });
      }
    } catch (err) {
      toast({
        title: "No se pudo guardar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchived = async () => {
    if (!job) return;
    const nextActive = job.active === false;
    try {
      await JobService.updateJob(jobId, { active: nextActive, updatedAt: Timestamp.now() });
      setJob({ ...job, active: nextActive });
      toast({
        title: nextActive ? "Vacante reabierta" : "Vacante archivada",
        description: nextActive
          ? "Vuelve a aparecer en el listado de empleos."
          : "Deja de listarse y no admite nuevas pruebas. Sus candidatos se conservan.",
      });
    } catch (err) {
      toast({
        title: "No se pudo cambiar el estado",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await apiPost<{ poolSize: number }>("/api/jobs/assessment", {
        jobId,
        force: true,
      });
      setJob((prev) =>
        prev ? { ...prev, assessmentReady: true, assessmentPoolSize: res.poolSize } : prev
      );
      toast({
        title: "Repertorio regenerado",
        description: `${res.poolSize} preguntas nuevas para esta vacante.`,
      });
    } catch (err) {
      toast({
        title: "No se pudo regenerar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center space-y-6">
        <AlertTriangle className="h-10 w-10 text-brand-orange mx-auto" />
        <p className="text-xl font-bold italic">{error ?? "Vacante no disponible."}</p>
        <Button onClick={() => router.push("/dashboard/vacancies")} className="rounded-xl">
          Volver a mis vacantes
        </Button>
      </div>
    );
  }

  const archived = job.active === false;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <header className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/vacancies")}
          className="rounded-full h-10 w-10 p-0 bg-white shadow-apple border border-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-grow">
          <h1 className="text-3xl font-bold tracking-tight text-black italic">Gestionar vacante.</h1>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mt-1">
            {archived ? "Archivada" : "Activa"} · {job.applicantsCount || 0} aplicantes
          </p>
        </div>
      </header>

      {/* Estado de la prueba y acciones sobre el repertorio */}
      <div className="bg-gray-950 text-white p-8 rounded-[2.5rem] shadow-apple-lg space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold italic flex items-center gap-2">
              <Terminal className="h-5 w-5 text-brand-blue" /> Prueba The LINE
            </h2>
            <p className="text-[11px] text-gray-400 font-medium">
              {assessmentSummary(job)}
            </p>
          </div>
          <Button
            onClick={regenerate}
            disabled={regenerating}
            className="bg-brand-blue hover:bg-brand-blue/90 rounded-xl h-12 px-6 font-bold uppercase tracking-widest text-[10px]"
          >
            {regenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {job.assessmentReady ? "Regenerar repertorio" : "Generar repertorio"}
              </>
            )}
          </Button>
        </div>
        <p className="text-[10px] text-gray-500 leading-relaxed border-t border-white/10 pt-4">
          Regenerar sustituye todas las preguntas. Los resultados ya obtenidos por candidatos se
          conservan, pero dejarán de corresponder al repertorio actual.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-apple border border-gray-50 space-y-8">
          <Field label="Título de la posición">
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-14 bg-gray-50 border-none rounded-2xl px-6 text-lg font-bold"
            />
          </Field>

          <Field label="Empresa">
            <Input
              required
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="h-14 bg-gray-50 border-none rounded-2xl px-6 text-lg font-bold"
            />
          </Field>

          <Field label="Descripción del rol">
            <Textarea
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-[160px] bg-gray-50 border-none rounded-2xl p-6 text-sm font-medium leading-relaxed"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Salario estimado">
              <Input
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                className="h-12 bg-gray-50 border-none rounded-xl"
              />
            </Field>
            <Field label="Ubicación">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="h-12 bg-gray-50 border-none rounded-xl"
              />
            </Field>
            <Field label="Tipo de contrato">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
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
            </Field>
            <Field label="Nivel / dificultad">
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger className="h-12 bg-gray-50 border-none rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="junior">Junior</SelectItem>
                  <SelectItem value="mid">Mid</SelectItem>
                  <SelectItem value="senior">Senior</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Habilidades">
            <SkillPicker value={form.skills} onChange={(skills) => setForm({ ...form, skills })} />
            <p className="text-[10px] text-gray-400 mt-2 ml-1">
              Al guardar un cambio de habilidades, la prueba se actualiza sola.
            </p>
          </Field>

          <Field label="Preguntas por examen">
            <Input
              type="number"
              min={10}
              max={30}
              placeholder="Automático"
              value={form.examQuestionCount}
              onChange={(e) => setForm({ ...form, examQuestionCount: e.target.value })}
              className="h-12 bg-gray-50 border-none rounded-xl w-32"
            />
          </Field>

          <Field label="Tiempo límite (minutos)">
            <Input
              type="number"
              min={5}
              max={480}
              placeholder="30"
              value={form.examTimeLimitMinutes}
              onChange={(e) => setForm({ ...form, examTimeLimitMinutes: e.target.value })}
              className="h-12 bg-gray-50 border-none rounded-xl w-32"
            />
            <p className="text-[10px] text-gray-400 mt-2 ml-1">
              Entre 5 y 480. Vacío = 30 minutos. Aplica a las pruebas que empiecen después de guardar.
            </p>
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button
            type="submit"
            disabled={saving}
            className="h-14 px-8 bg-black text-white rounded-2xl font-bold uppercase tracking-widest text-[10px]"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar cambios
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={toggleArchived}
            className="h-14 px-8 rounded-2xl border-gray-200 font-bold uppercase tracking-widest text-[10px]"
          >
            {archived ? (
              <>
                <ArchiveRestore className="mr-2 h-4 w-4" /> Reabrir vacante
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" /> Archivar vacante
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/dashboard/candidates")}
            className="h-14 px-8 rounded-2xl font-bold uppercase tracking-widest text-[10px] text-gray-500"
          >
            <Users className="mr-2 h-4 w-4" /> Ver candidatos
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Texto que resume la prueba de la vacante para el reclutador. */
function assessmentSummary(job: JobOpportunity): string {
  if (!job.assessmentReady) {
    return "Sin prueba todavía. Se compone con preguntas del banco para las habilidades de la vacante.";
  }
  const perCandidate = job.examQuestionCount ? `${job.examQuestionCount}` : "10 si tiene GitHub analizado o 20 si no,";
  return `Repertorio de ${job.assessmentPoolSize ?? "?"} preguntas. Cada candidato responde ${perCandidate} sorteadas al azar, con ${job.examTimeLimitMinutes ?? 30} minutos para responder.`;
}
