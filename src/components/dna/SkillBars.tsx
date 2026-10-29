import { cn } from "@/lib/utils";

/**
 * Barras del DNA técnico (nombre, % y barra de progreso). Las usan el CORE y el perfil, que antes
 * tenían cada uno su copia del mismo marcado.
 */
export function SkillBars({
  skills,
  emptyText,
  valueClassName = "text-xl",
  emptyClassName,
}: Readonly<{
  skills: { name: string; value: number }[];
  emptyText: string;
  /** Tamaño del porcentaje (el perfil lo muestra un poco más grande). */
  valueClassName?: string;
  emptyClassName?: string;
}>) {
  if (skills.length === 0) {
    return <div className={cn("py-12 text-center text-gray-400 italic", emptyClassName)}>{emptyText}</div>;
  }
  return (
    <>
      {skills.map((skill) => (
        <div key={skill.name} className="space-y-4">
          <div className="flex justify-between items-end">
            <p className="font-bold text-sm uppercase tracking-widest text-black">{skill.name}</p>
            <span className={cn("font-black text-brand-blue italic", valueClassName)}>{skill.value}%</span>
          </div>
          <div className="h-3 rounded-full bg-gray-50 overflow-hidden border border-gray-100">
            <div
              className="h-full bg-brand-blue rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${skill.value}%` }}
            />
          </div>
        </div>
      ))}
    </>
  );
}
