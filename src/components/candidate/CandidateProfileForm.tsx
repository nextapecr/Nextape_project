"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Briefcase, Check, GraduationCap, Loader2, Plus, Sparkles, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, THEORY_TECHNOLOGY_ID, findTechnology, technologiesByCategory } from "@/lib/technologies";
import {
  AVAILABILITY,
  EDUCATION_LEVELS,
  EDUCATION_STATUS,
  LANGUAGE_LEVELS,
  LIMITS,
  PROFILE_STEPS,
  SELF_LEVELS,
  WORK_MODES,
  YEARS_OF_EXPERIENCE,
  emptyEducation,
  emptyWork,
  stepErrors,
  type CandidateProfile,
  type ProfileStep,
} from "@/lib/candidate-profile";

const STEP_META: Record<ProfileStep, { title: string; subtitle: string; icon: typeof User }> = {
  about: { title: "Sobre ti.", subtitle: "Cómo te presentas a una empresa.", icon: User },
  work: { title: "Experiencia.", subtitle: "Dónde has trabajado. Si buscas tu primer empleo, puedes seguir sin agregar nada.", icon: Briefcase },
  education: { title: "Estudios.", subtitle: "Carreras, técnicos, bootcamps o formación autodidacta.", icon: GraduationCap },
  extras: { title: "Lo demás.", subtitle: "Tecnologías, idiomas, enlaces y qué buscas.", icon: Sparkles },
};

const fieldClass = "bg-gray-50 border-none h-12 rounded-xl px-4 focus-visible:ring-1";
const labelClass = "text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label className={labelClass}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 ml-1">{hint}</p>}
    </div>
  );
}

function OptionSelect<T extends readonly { id: string; label: string }[]>({
  value,
  options,
  onChange,
  placeholder = "Elige una opción",
}: {
  value: string;
  options: T;
  onChange: (v: T[number]["id"]) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v as T[number]["id"])}>
      <SelectTrigger className={fieldClass}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-2xl border-none shadow-apple-lg">
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "lift inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold",
        selected ? "bg-brand-blue text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100",
      )}
    >
      {selected && <Check className="h-3 w-3" />}
      {children}
    </button>
  );
}

/**
 * Cuestionario del candidato, en 4 pasos. No escribe nada por sí solo: entrega el perfil a
 * `onSave` (la página decide dónde guardarlo). `onSkip` permite dejarlo para después.
 */
export function CandidateProfileForm({
  initial,
  saving,
  onSave,
  onSkip,
  savedTechnologies = [],
  dnaScores = {},
  bankAvailable,
}: {
  initial: CandidateProfile;
  saving: boolean;
  onSave: (profile: CandidateProfile) => void;
  onSkip?: () => void;
  /** Tecnologías que The LINE le evalúa HOY (antes de guardar). Para avisar de lo que se pierde. */
  savedTechnologies?: string[];
  /** DNA actual: nota por tecnología. */
  dnaScores?: Record<string, number>;
  /** Tecnologías con banco de preguntas (`/api/line/catalog`). `undefined` = aún cargando. */
  bankAvailable?: Record<string, string[]>;
}) {
  const [p, setP] = useState<CandidateProfile>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [techCategory, setTechCategory] = useState<string | null>(null);

  const step = PROFILE_STEPS[stepIndex];
  const meta = STEP_META[step];
  const errors = stepErrors(step, p);
  const isLast = stepIndex === PROFILE_STEPS.length - 1;

  const set = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => setP((prev) => ({ ...prev, [key]: value }));

  const next = () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (isLast) onSave(p);
    else {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const back = () => {
    setShowErrors(false);
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const toggleIn = <T extends string>(list: T[], value: T, max = Infinity): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : list.length < max ? [...list, value] : list;

  const updateAt = <K extends "work" | "education" | "languages">(
    key: K,
    index: number,
    patch: Partial<CandidateProfile[K][number]>,
  ) => setP((prev) => ({ ...prev, [key]: prev[key].map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  const removeAt = (key: "work" | "education" | "languages" | "certifications", index: number) =>
    setP((prev) => ({ ...prev, [key]: (prev[key] as unknown[]).filter((_, i) => i !== index) }));

  // La teoría de ingeniería de software no se elige: va en todas las pruebas.
  const groups = technologiesByCategory()
    .map((g) => ({ ...g, items: g.items.filter((t) => t.id !== THEORY_TECHNOLOGY_ID) }))
    .filter((g) => g.items.length > 0);
  /** Quitadas respecto a lo guardado y que ya tienen nota: se borran del DNA al guardar. */
  const losing = savedTechnologies
    .filter((t) => !p.technologies.includes(t) && typeof dnaScores[t] === "number")
    .map((t) => ({ id: t, label: findTechnology(t)?.label ?? t, score: dnaScores[t] }));

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Progreso */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
          <span>
            Paso {stepIndex + 1} de {PROFILE_STEPS.length}
          </span>
          {onSkip && (
            <button type="button" onClick={onSkip} className="hover:text-black transition-colors">
              Completar después
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {PROFILE_STEPS.map((s, i) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= stepIndex ? "bg-brand-blue" : "bg-gray-200")} />
          ))}
        </div>
      </div>

      <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-apple border border-gray-50 space-y-10">
        <header className="flex items-start gap-4">
          <div className="w-12 h-12 shrink-0 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
            <meta.icon className="h-6 w-6 text-brand-blue" />
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-bold italic tracking-tight">{meta.title}</h2>
            <p className="text-sm text-gray-400 font-medium">{meta.subtitle}</p>
          </div>
        </header>

        {step === "about" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Field label="¿Cómo te presentas? *" hint="Una línea. Ej.: «Desarrollador backend con Node.js y PostgreSQL».">
                <Input
                  value={p.headline}
                  maxLength={LIMITS.shortText}
                  onChange={(e) => set("headline", e.target.value)}
                  placeholder="Desarrollador frontend"
                  className={fieldClass}
                />
              </Field>
            </div>
            <Field label="Años de experiencia *">
              <OptionSelect value={p.yearsOfExperience} options={YEARS_OF_EXPERIENCE} onChange={(v) => set("yearsOfExperience", v)} />
            </Field>
            <Field label="Tu nivel *" hint="Cómo te ves hoy. The LINE lo mide aparte.">
              <OptionSelect value={p.selfLevel} options={SELF_LEVELS} onChange={(v) => set("selfLevel", v)} />
            </Field>
            <Field label="Ubicación">
              <Input
                value={p.location}
                maxLength={LIMITS.shortText}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Ciudad, país"
                className={fieldClass}
              />
            </Field>
            <Field label="Disponibilidad">
              <OptionSelect value={p.availability} options={AVAILABILITY} onChange={(v) => set("availability", v)} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Modalidad que te interesa">
                <div className="flex flex-wrap gap-2">
                  {WORK_MODES.map((m) => (
                    <Chip key={m.id} selected={p.workModes.includes(m.id)} onClick={() => set("workModes", toggleIn(p.workModes, m.id))}>
                      {m.label}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        )}

        {step === "work" && (
          <div className="space-y-6">
            {p.work.length === 0 && (
              <p className="text-sm text-gray-400 font-medium bg-gray-50 rounded-2xl p-6">
                Aún no agregaste trabajos. Incluye empleos, pasantías, freelance o proyectos para clientes.
              </p>
            )}
            {p.work.map((w, i) => (
              <div key={i} className="border border-gray-100 rounded-[2rem] p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">Trabajo {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeAt("work", i)} className="text-gray-400 hover:text-brand-red rounded-full">
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Empresa *">
                    <Input value={w.company} maxLength={LIMITS.shortText} onChange={(e) => updateAt("work", i, { company: e.target.value })} className={fieldClass} />
                  </Field>
                  <Field label="Puesto *">
                    <Input value={w.role} maxLength={LIMITS.shortText} onChange={(e) => updateAt("work", i, { role: e.target.value })} className={fieldClass} />
                  </Field>
                  <Field label="Desde *">
                    <Input type="month" value={w.start} onChange={(e) => updateAt("work", i, { start: e.target.value })} className={fieldClass} />
                  </Field>
                  <Field label="Hasta">
                    <Input
                      type="month"
                      value={w.current ? "" : w.end}
                      disabled={w.current}
                      onChange={(e) => updateAt("work", i, { end: e.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={w.current}
                    onChange={(e) => updateAt("work", i, { current: e.target.checked, end: e.target.checked ? "" : w.end })}
                    className="h-4 w-4 accent-[hsl(var(--brand-blue))]"
                  />
                  Trabajo aquí actualmente
                </label>
                <Field label="¿Qué hacías?" hint="Responsabilidades, logros y tecnologías.">
                  <Textarea
                    value={w.description}
                    maxLength={LIMITS.longText}
                    onChange={(e) => updateAt("work", i, { description: e.target.value })}
                    className="bg-gray-50 border-none rounded-xl p-4 min-h-[90px]"
                  />
                </Field>
              </div>
            ))}
            {p.work.length < LIMITS.work && (
              <Button type="button" variant="outline" onClick={() => set("work", [...p.work, emptyWork()])} className="rounded-2xl h-12 border-dashed border-gray-200 w-full font-bold">
                <Plus className="h-4 w-4" /> Agregar trabajo
              </Button>
            )}
          </div>
        )}

        {step === "education" && (
          <div className="space-y-6">
            {p.education.map((ed, i) => (
              <div key={i} className="border border-gray-100 rounded-[2rem] p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">Estudio {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeAt("education", i)} className="text-gray-400 hover:text-brand-red rounded-full">
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Tipo *">
                    <OptionSelect value={ed.level} options={EDUCATION_LEVELS} onChange={(v) => updateAt("education", i, { level: v })} />
                  </Field>
                  <Field label="Estado">
                    <OptionSelect value={ed.status} options={EDUCATION_STATUS} onChange={(v) => updateAt("education", i, { status: v })} />
                  </Field>
                  <Field label={ed.level === "self-taught" ? "Institución o plataforma" : "Institución *"}>
                    <Input value={ed.institution} maxLength={LIMITS.shortText} onChange={(e) => updateAt("education", i, { institution: e.target.value })} className={fieldClass} />
                  </Field>
                  <Field label="Carrera o programa">
                    <Input value={ed.program} maxLength={LIMITS.shortText} onChange={(e) => updateAt("education", i, { program: e.target.value })} className={fieldClass} />
                  </Field>
                  <Field label="Año de fin (o previsto)">
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={ed.year}
                      onChange={(e) => updateAt("education", i, { year: e.target.value.replace(/\D/g, "") })}
                      placeholder="2025"
                      className={fieldClass}
                    />
                  </Field>
                </div>
              </div>
            ))}
            {p.education.length < LIMITS.education && (
              <Button type="button" variant="outline" onClick={() => set("education", [...p.education, emptyEducation()])} className="rounded-2xl h-12 border-dashed border-gray-200 w-full font-bold">
                <Plus className="h-4 w-4" /> Agregar estudio
              </Button>
            )}

            <Field label="Cursos y certificaciones" hint="Uno por línea. Ej.: AWS Cloud Practitioner.">
              <Textarea
                value={p.certifications.join("\n")}
                onChange={(e) => set("certifications", e.target.value.split("\n").slice(0, LIMITS.certifications))}
                className="bg-gray-50 border-none rounded-xl p-4 min-h-[90px]"
              />
            </Field>
          </div>
        )}

        {step === "extras" && (
          <div className="space-y-8">
            <Field
              label={`Tecnologías que te evaluará The LINE * (${p.technologies.length}/${LIMITS.technologies})`}
              hint="Cada prueba mezcla preguntas de estas tecnologías (70 %) con teoría de ingeniería de software: SOLID, patrones y arquitectura (30 %). Puedes cambiarlas después, pero si quitas una que ya evaluaste, pierdes esos puntos."
            >
              <div className="flex flex-wrap gap-2 pb-2">
                {groups.map(({ category }) => (
                  <Chip key={category} selected={techCategory === category} onClick={() => setTechCategory(techCategory === category ? null : category)}>
                    {CATEGORY_LABELS[category]}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {groups
                  .flatMap((g) => g.items)
                  .filter((t) => (techCategory ? t.category === techCategory : p.technologies.includes(t.id)))
                  .map((t) => (
                    <Chip
                      key={t.id}
                      selected={p.technologies.includes(t.id)}
                      onClick={() => set("technologies", toggleIn(p.technologies, t.id, LIMITS.technologies))}
                    >
                      {t.label}
                      {bankAvailable && !bankAvailable[t.id]?.length && (
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">· sin preguntas aún</span>
                      )}
                    </Chip>
                  ))}
                {!techCategory && p.technologies.length === 0 && (
                  <p className="text-sm text-gray-400">Elige una categoría para ver sus tecnologías.</p>
                )}
              </div>
              {losing.length > 0 && (
                <div role="alert" className="mt-3 bg-brand-red/5 text-brand-red rounded-2xl p-4 text-sm font-medium">
                  Al guardar se borrarán de tu DNA los puntos de{" "}
                  {losing.map((l, i) => (
                    <span key={l.id}>
                      <span className="font-bold">
                        {l.label} ({l.score}%)
                      </span>
                      {i < losing.length - 1 ? ", " : ""}
                    </span>
                  ))}
                  . Si vuelves a agregarla, empiezas de cero.
                </div>
              )}
            </Field>

            <Field label="Idiomas">
              <div className="space-y-3">
                {p.languages.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                    <Input value={l.language} maxLength={40} onChange={(e) => updateAt("languages", i, { language: e.target.value })} placeholder="Inglés" className={fieldClass} />
                    <OptionSelect value={l.level} options={LANGUAGE_LEVELS} onChange={(v) => updateAt("languages", i, { level: v })} placeholder="Nivel" />
                    <Button type="button" variant="ghost" size="icon" aria-label="Quitar idioma" onClick={() => removeAt("languages", i)} className="text-gray-400 hover:text-brand-red rounded-full">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {p.languages.length < LIMITS.languages && (
                  <Button type="button" variant="ghost" onClick={() => set("languages", [...p.languages, { language: "", level: "" }])} className="rounded-xl font-bold text-brand-blue">
                    <Plus className="h-4 w-4" /> Agregar idioma
                  </Button>
                )}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="LinkedIn">
                <Input value={p.linkedinUrl} maxLength={LIMITS.url} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/in/tu-nombre" className={fieldClass} />
              </Field>
              <Field label="Portafolio o sitio web">
                <Input value={p.portfolioUrl} maxLength={LIMITS.url} onChange={(e) => set("portfolioUrl", e.target.value)} placeholder="tu-sitio.dev" className={fieldClass} />
              </Field>
            </div>

            <Field label="¿Qué buscas en tu próximo trabajo?" hint="Tipo de proyecto, equipo, crecimiento… Lo verá la empresa cuando postules.">
              <Textarea
                value={p.lookingFor}
                maxLength={LIMITS.longText}
                onChange={(e) => set("lookingFor", e.target.value)}
                className="bg-gray-50 border-none rounded-xl p-4 min-h-[110px]"
              />
            </Field>
          </div>
        )}

        {showErrors && errors.length > 0 && (
          <ul role="alert" className="bg-brand-red/5 text-brand-red rounded-2xl p-5 space-y-1 text-sm font-medium">
            {errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <Button type="button" variant="ghost" onClick={back} disabled={stepIndex === 0 || saving} className="rounded-2xl h-12 font-bold">
            <ArrowLeft className="h-4 w-4" /> Atrás
          </Button>
          <Button type="button" onClick={next} disabled={saving} className="bg-black text-white hover:bg-black/90 rounded-2xl h-12 px-8 font-bold uppercase tracking-widest text-xs">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLast ? (
              <>
                Guardar perfil <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Siguiente <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
