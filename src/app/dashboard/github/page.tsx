"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { useAuthUser } from "@/hooks/use-auth-user";
import { UserService } from "@/services/users.service";
import { GithubEvidenceCard } from "@/components/github/GithubEvidenceCard";
import type { UserProfile } from "@/types/user.types";

/**
 * Evidencia de GitHub. Tiene página propia y entrada en el menú porque en el perfil quedaba en la
 * tercera columna, por debajo del DNA: en cualquier pantalla menor a 1024px el grid se apila y la
 * tarjeta acababa fuera de la vista, así que en la práctica nadie la encontraba.
 */
export default function GithubPage() {
  const { user, authLoading } = useAuthUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    UserService.getUser(user.uid)
      .then(setProfile)
      .catch((err) => console.error("Error cargando el perfil:", err))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <header className="space-y-3">
        <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center">
          <GithubIcon className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-black italic">GitHub.</h1>
        <p className="text-gray-500 font-medium text-sm max-w-xl">
          Análisis determinístico de tu código real: arquitectura, seguridad, mantenibilidad,
          testing y documentación. Se ejecuta solo cuando tú lo pides.
        </p>
      </header>

      {user && <GithubEvidenceCard uid={user.uid} githubUrl={profile?.githubUrl} />}
    </div>
  );
}
