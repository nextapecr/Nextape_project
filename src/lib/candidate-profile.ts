/**
 * Perfil profesional del candidato: lo que contesta al registrarse (experiencia, estudios, dónde
 * trabajó, idiomas…). Vive en `users/{uid}.candidateProfile` y lo escribe el propio usuario.
 *
 * Es lo DECLARADO por el candidato; lo VERIFICADO sigue siendo el DNA de The LINE. Por eso nunca
 * alimenta scores ni el match: solo da contexto al reclutador.
 *
 * Este módulo no depende de Firebase: se usa en el cliente (formulario) y en el servidor
 * (`/api/line/submit`, que copia un resumen a la candidatura). `normalizeCandidateProfile` es la
 * única puerta de entrada: recorta textos, descarta valores fuera de las opciones y limita
 * cuántas entradas hay, porque el documento `users/{uid}` lo escribe el cliente.
 */

/* ───────────────────────────── Opciones ───────────────────────────── */

export const YEARS_OF_EXPERIENCE = [
  { id: "0-1", label: "Menos de 1 año" },
  { id: "1-3", label: "1 a 3 años" },
  { id: "3-5", label: "3 a 5 años" },
  { id: "5-10", label: "5 a 10 años" },
  { id: "10+", label: "Más de 10 años" },
] as const;

export const SELF_LEVELS = [
  { id: "trainee", label: "Trainee / Practicante" },
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
  { id: "lead", label: "Lead / Arquitecto" },
] as const;

export const WORK_MODES = [
  { id: "remote", label: "Remoto" },
  { id: "hybrid", label: "Híbrido" },
  { id: "onsite", label: "Presencial" },
] as const;

export const AVAILABILITY = [
  { id: "now", label: "Inmediata" },
  { id: "2w", label: "En 2 semanas" },
  { id: "1m", label: "En 1 mes" },
  { id: "passive", label: "No busco activamente, pero escucho ofertas" },
] as const;

export const EDUCATION_LEVELS = [
  { id: "secondary", label: "Secundaria" },
  { id: "technical", label: "Técnico" },
  { id: "bootcamp", label: "Bootcamp" },
  { id: "bachelor", label: "Bachillerato / Licenciatura" },
  { id: "master", label: "Maestría" },
  { id: "phd", label: "Doctorado" },
  { id: "self-taught", label: "Autodidacta" },
] as const;

export const EDUCATION_STATUS = [
  { id: "completed", label: "Terminado" },
  { id: "in-progress", label: "En curso" },
  { id: "incomplete", label: "Sin terminar" },
] as const;

export const LANGUAGE_LEVELS = [
  { id: "basic", label: "Básico" },
  { id: "intermediate", label: "Intermedio" },
  { id: "advanced", label: "Avanzado" },
  { id: "native", label: "Nativo" },
] as const;

type Id<T extends readonly { id: string }[]> = T[number]["id"];

/* ───────────────────────────── Tipos ───────────────────────────── */

export interface WorkExperience {
  company: string;
  role: string;
  /** "2023" o "2023-05". */
  start: string;
  /** Vacío si `current`. */
  end: string;
  current: boolean;
  /** Qué hizo, con qué tecnologías. */
  description: string;
}

export interface Education {
  institution: string;
  /** Carrera o programa, p. ej. "Ingeniería en Sistemas". */
  program: string;
  level: Id<typeof EDUCATION_LEVELS> | "";
  status: Id<typeof EDUCATION_STATUS> | "";
  /** Año de fin (o previsto). */
  year: string;
}

export interface LanguageSkill {
  language: string;
  level: Id<typeof LANGUAGE_LEVELS> | "";
}

export interface CandidateProfile {
  /** Cómo se presenta: "Desarrollador frontend con foco en React". */
  headline: string;
  yearsOfExperience: Id<typeof YEARS_OF_EXPERIENCE> | "";
  selfLevel: Id<typeof SELF_LEVELS> | "";
  /** Ciudad y país. */
  location: string;
  workModes: Id<typeof WORK_MODES>[];
  availability: Id<typeof AVAILABILITY> | "";
  work: WorkExperience[];
  education: Education[];
  /** Cursos o certificaciones, uno por entrada. */
  certifications: string[];
  /** Ids del catálogo de The LINE (`src/lib/technologies.ts`). */
  technologies: string[];
  languages: LanguageSkill[];
  linkedinUrl: string;
  portfolioUrl: string;
  /** Qué busca en su próximo trabajo. */
  lookingFor: string;
  /** Epoch ms de la última vez que guardó el formulario completo. */
  completedAt: number | null;
}

/* ───────────────────────────── Límites ───────────────────────────── */

export const LIMITS = {
  work: 10,
  education: 6,
  certifications: 10,
  technologies: 20,
  languages: 6,
  shortText: 120,
  longText: 600,
  url: 200,
} as const;

export function emptyWork(): WorkExperience {
  return { company: "", role: "", start: "", end: "", current: false, description: "" };
}

export function emptyEducation(): Education {
  return { institution: "", program: "", level: "", status: "", year: "" };
}

export function emptyCandidateProfile(): CandidateProfile {
  return {
    headline: "",
    yearsOfExperience: "",
    selfLevel: "",
    location: "",
    workModes: [],
    availability: "",
    work: [],
    education: [],
    certifications: [],
    technologies: [],
    languages: [{ language: "Español", level: "native" }],
    linkedinUrl: "",
    portfolioUrl: "",
    lookingFor: "",
    completedAt: null,
  };
}

/* ───────────────────────────── Normalización ───────────────────────────── */

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Texto largo: conserva los saltos de línea, colapsa los espacios repetidos. */
function longText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function oneOf<T extends readonly { id: string }[]>(value: unknown, options: T): Id<T> | "" {
  return options.some((o) => o.id === value) ? (value as Id<T>) : "";
}

/** Año ("2023") o año-mes ("2023-05"), entre 1950 y el año que viene. Si no, vacío. */
export function normalizeYearMonth(value: unknown, now = new Date()): string {
  const v = text(value, 7);
  const m = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(v);
  if (!m) return "";
  const year = Number(m[1]);
  if (year < 1950 || year > now.getFullYear() + 1) return "";
  return v;
}

/** Solo http(s). Añade https:// si falta. Cualquier otra cosa (javascript:, etc.) → vacío. */
export function normalizeUrl(value: unknown): string {
  let v = text(value, LIMITS.url);
  if (!v) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/**
 * Deja el perfil en forma segura y predecible: recorta, descarta lo que no está en las opciones,
 * quita entradas vacías y aplica los límites. Se usa al guardar (cliente) y al leer (servidor).
 */
export function normalizeCandidateProfile(raw: unknown, now = new Date()): CandidateProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

  const work = arr(r.work)
    .map((w) => {
      const o = obj(w);
      const current = o.current === true;
      return {
        company: text(o.company, LIMITS.shortText),
        role: text(o.role, LIMITS.shortText),
        start: normalizeYearMonth(o.start, now),
        end: current ? "" : normalizeYearMonth(o.end, now),
        current,
        description: longText(o.description, LIMITS.longText),
      };
    })
    .filter((w) => w.company || w.role)
    .slice(0, LIMITS.work);

  const education = arr(r.education)
    .map((e) => {
      const o = obj(e);
      return {
        institution: text(o.institution, LIMITS.shortText),
        program: text(o.program, LIMITS.shortText),
        level: oneOf(o.level, EDUCATION_LEVELS),
        status: oneOf(o.status, EDUCATION_STATUS),
        year: normalizeYearMonth(o.year, now).slice(0, 4),
      };
    })
    .filter((e) => e.institution || e.program)
    .slice(0, LIMITS.education);

  const languages = arr(r.languages)
    .map((l) => {
      const o = obj(l);
      return { language: text(o.language, 40), level: oneOf(o.level, LANGUAGE_LEVELS) };
    })
    .filter((l) => l.language)
    .slice(0, LIMITS.languages);

  const unique = <T extends string>(xs: T[]): T[] => [...new Set(xs)];

  return {
    headline: text(r.headline, LIMITS.shortText),
    yearsOfExperience: oneOf(r.yearsOfExperience, YEARS_OF_EXPERIENCE),
    selfLevel: oneOf(r.selfLevel, SELF_LEVELS),
    location: text(r.location, LIMITS.shortText),
    workModes: unique(arr(r.workModes).filter((m) => WORK_MODES.some((o) => o.id === m)) as Id<typeof WORK_MODES>[]),
    availability: oneOf(r.availability, AVAILABILITY),
    work,
    education,
    certifications: unique(arr(r.certifications).map((c) => text(c, LIMITS.shortText)).filter(Boolean)).slice(
      0,
      LIMITS.certifications,
    ),
    technologies: unique(
      arr(r.technologies)
        .map((t) => text(t, 40).toLowerCase())
        .filter(Boolean),
    ).slice(0, LIMITS.technologies),
    languages,
    linkedinUrl: normalizeUrl(r.linkedinUrl),
    portfolioUrl: normalizeUrl(r.portfolioUrl),
    lookingFor: longText(r.lookingFor, LIMITS.longText),
    completedAt: typeof r.completedAt === "number" && Number.isFinite(r.completedAt) ? r.completedAt : null,
  };
}

/* ───────────────────────────── Validación por paso ───────────────────────────── */

export const PROFILE_STEPS = ["about", "work", "education", "extras"] as const;
export type ProfileStep = (typeof PROFILE_STEPS)[number];

/**
 * Qué le falta a cada paso para poder seguir. Vacío = el paso está bien.
 * Lo obligatorio es lo mínimo para que una empresa entienda quién es: titular, años de experiencia,
 * nivel y al menos un estudio. La experiencia laboral NO es obligatoria (hay quien busca su primer
 * trabajo), pero si se empieza una entrada, tiene que tener empresa y puesto.
 */
export function stepErrors(step: ProfileStep, p: CandidateProfile): string[] {
  const errors: string[] = [];
  switch (step) {
    case "about":
      if (!p.headline) errors.push("Escribe cómo te presentas (por ejemplo, «Desarrollador frontend»).");
      if (!p.yearsOfExperience) errors.push("Elige tus años de experiencia.");
      if (!p.selfLevel) errors.push("Elige tu nivel.");
      break;
    case "work":
      p.work.forEach((w, i) => {
        if (!w.company || !w.role) errors.push(`Trabajo ${i + 1}: falta la empresa o el puesto.`);
        if (!w.start) errors.push(`Trabajo ${i + 1}: falta el año de inicio.`);
        if (!w.current && w.end && w.start && w.end < w.start) {
          errors.push(`Trabajo ${i + 1}: la fecha de fin es anterior a la de inicio.`);
        }
      });
      break;
    case "education":
      if (p.education.length === 0) errors.push("Agrega al menos un estudio (también vale «Autodidacta»).");
      p.education.forEach((e, i) => {
        if (!e.level) errors.push(`Estudio ${i + 1}: elige el tipo.`);
        if (!e.institution && e.level !== "self-taught") errors.push(`Estudio ${i + 1}: falta la institución.`);
      });
      break;
    case "extras":
      break;
  }
  return errors;
}

/** ¿El candidato ya completó el cuestionario al menos una vez? */
export function isCandidateProfileComplete(p: CandidateProfile | null | undefined): boolean {
  return Boolean(p?.completedAt) && PROFILE_STEPS.every((s) => stepErrors(s, p as CandidateProfile).length === 0);
}

/* ───────────────────────────── Resumen para la empresa ───────────────────────────── */

const label = <T extends readonly { id: string; label: string }[]>(options: T, id: string) =>
  options.find((o) => o.id === id)?.label ?? "";

/** Lo que ve el reclutador junto a la candidatura. Pequeño y sin datos de contacto. */
export interface CandidateSummary {
  headline: string;
  yearsOfExperience: string;
  selfLevel: string;
  location: string;
  workModes: string[];
  availability: string;
  /** Hasta 3 trabajos, el más reciente primero: "Puesto · Empresa (2021–actual)". */
  recentWork: string[];
  /** Hasta 2 estudios: "Programa · Institución (Terminado)". */
  education: string[];
  languages: string[];
  linkedinUrl: string;
  portfolioUrl: string;
}

export function summarizeCandidate(raw: unknown): CandidateSummary | null {
  const p = normalizeCandidateProfile(raw);
  if (!p.headline && p.work.length === 0 && p.education.length === 0) return null;

  const period = (w: WorkExperience) => {
    const start = w.start.slice(0, 4);
    const end = w.current ? "actual" : w.end.slice(0, 4);
    return start || end ? ` (${start || "?"}–${end || "?"})` : "";
  };
  const sortKey = (w: WorkExperience) => (w.current ? "9999" : w.end || w.start);

  return {
    headline: p.headline,
    yearsOfExperience: label(YEARS_OF_EXPERIENCE, p.yearsOfExperience),
    selfLevel: label(SELF_LEVELS, p.selfLevel),
    location: p.location,
    workModes: p.workModes.map((m) => label(WORK_MODES, m)),
    availability: label(AVAILABILITY, p.availability),
    recentWork: [...p.work]
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
      .slice(0, 3)
      .map((w) => [w.role, w.company].filter(Boolean).join(" · ") + period(w)),
    education: p.education.slice(0, 2).map((e) => {
      const what = [e.program || label(EDUCATION_LEVELS, e.level), e.institution].filter(Boolean).join(" · ");
      const status = label(EDUCATION_STATUS, e.status);
      return status ? `${what} (${status})` : what;
    }),
    languages: p.languages.map((l) => (l.level ? `${l.language} (${label(LANGUAGE_LEVELS, l.level)})` : l.language)),
    linkedinUrl: p.linkedinUrl,
    portfolioUrl: p.portfolioUrl,
  };
}
