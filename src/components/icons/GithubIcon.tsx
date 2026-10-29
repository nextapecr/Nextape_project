import { siGithub } from "simple-icons";
import { cn } from "@/lib/utils";

/**
 * Logo de GitHub. Reemplaza al icono `Github` de lucide-react, que está deprecado (lucide retira los
 * iconos de marca en v1.0 y recomienda Simple Icons). Misma API: `className` controla tamaño y color.
 */
export function GithubIcon({ className, title }: Readonly<{ className?: string; title?: string }>) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      className={cn("h-4 w-4", className)}
    >
      {title && <title>{title}</title>}
      <path d={siGithub.path} />
    </svg>
  );
}
