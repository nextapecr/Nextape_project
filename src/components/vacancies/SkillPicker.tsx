"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { MAX_SKILLS_PER_JOB, TECHNOLOGIES, findTechnology, resolveTechnologyId } from "@/lib/technologies";
import { cn } from "@/lib/utils";

/** Skills máximas por vacante; la misma constante limita la composición en servidor. */
export const MAX_JOB_SKILLS = MAX_SKILLS_PER_JOB;

/**
 * Convierte las skills guardadas de una vacante a ids del catálogo ("Next.js" → "nextjs").
 * Las que no se reconocen se conservan en minúsculas para que el reclutador las vea y las quite.
 */
export function normalizeJobSkills(skills: string[] | undefined | null): string[] {
  const out: string[] = [];
  for (const raw of skills ?? []) {
    const id = resolveTechnologyId(raw) ?? String(raw).trim().toLowerCase();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Selector de skills de una vacante, limitado al catálogo de tecnologías.
 *
 * Antes era texto libre ("react, nextjs, docker..."). Una skill escrita con otra grafía, o sin
 * preguntas en el banco, producía una vacante cuya prueba no se podía componer: el candidato pulsaba
 * "Postular" y recibía un error. Aquí solo se eligen tecnologías del catálogo y se distinguen las
 * que tienen preguntas, así que una vacante publicada con ellas tiene su prueba garantizada.
 */
export function SkillPicker({
  value,
  onChange,
  tone = "light",
}: Readonly<{
  value: string[];
  onChange: (next: string[]) => void;
  tone?: "light" | "dark";
}>) {
  const [available, setAvailable] = useState<Record<string, string[]> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const dark = tone === "dark";

  useEffect(() => {
    apiGet<{ available: Record<string, string[]> }>("/api/line/catalog")
      .then((res) => setAvailable(res.available))
      .catch(() => setAvailable({}));
  }, []);

  const withBank = useMemo(
    () => new Set(Object.keys(available ?? {}).filter((id) => Boolean(findTechnology(id)))),
    [available]
  );

  if (!available) {
    return (
      <div className={cn("flex items-center gap-2 text-xs", dark ? "text-gray-500" : "text-gray-400")}>
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando tecnologías…
      </div>
    );
  }

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_JOB_SKILLS) onChange([...value, id]);
  };

  // Skills guardadas que no están en el catálogo o no tienen preguntas (vacantes antiguas).
  const unknown = value.filter((v) => !findTechnology(v));
  const withoutBank = value.filter((v) => findTechnology(v) && !withBank.has(v));
  const visible = TECHNOLOGIES.filter((t) => showAll || withBank.has(t.id) || value.includes(t.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {visible.map((tech) => {
          const selected = value.includes(tech.id);
          const hasBank = withBank.has(tech.id);
          return (
            <button
              key={tech.id}
              type="button"
              onClick={() => toggle(tech.id)}
              disabled={!selected && (!hasBank || value.length >= MAX_JOB_SKILLS)}
              title={hasBank ? undefined : "Aún no hay preguntas para esta tecnología"}
              className={cn(
                "lift inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold",
                "disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                selected && "bg-brand-blue text-white",
                !selected && dark && "bg-white/5 text-gray-300 hover:bg-white/10",
                !selected && !dark && "bg-gray-50 text-gray-600 hover:bg-gray-100"
              )}
            >
              {selected && <Check className="h-3 w-3" />}
              {tech.label}
            </button>
          );
        })}
        {unknown.map((skill) => (
          <button
            key={skill}
            type="button"
            onClick={() => onChange(value.filter((v) => v !== skill))}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold bg-brand-orange/10 text-brand-orange"
          >
            {skill} <X className="h-3 w-3" />
          </button>
        ))}
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium",
          dark ? "text-gray-500" : "text-gray-400"
        )}
      >
        <span>
          {value.length}/{MAX_JOB_SKILLS} elegidas · {withBank.size} tecnologías con preguntas
        </span>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="font-bold text-brand-blue">
          {showAll ? "Ver solo las disponibles" : "Ver catálogo completo"}
        </button>
      </div>

      {(unknown.length > 0 || withoutBank.length > 0) && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl p-3 text-[11px] font-medium text-brand-orange",
            dark ? "bg-brand-orange/10" : "bg-brand-orange/5"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Sin preguntas para {[...unknown, ...withoutBank].join(", ")}: no se evaluarán en la prueba.
            Quítalas o elige otras.
          </span>
        </div>
      )}
    </div>
  );
}
