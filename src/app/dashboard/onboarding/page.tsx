"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthUser } from "@/hooks/use-auth-user";
import { UserService } from "@/services/users.service";
import { useToast } from "@/hooks/use-toast";
import { CandidateProfileForm } from "@/components/candidate/CandidateProfileForm";
import { emptyCandidateProfile, normalizeCandidateProfile, type CandidateProfile } from "@/lib/candidate-profile";

/**
 * Cuestionario del candidato: experiencia, estudios, dónde trabajó, idiomas…
 *
 * Se abre solo después de registrarse como candidato (AuthModal) y desde "Completar perfil" en el
 * panel o "Editar" en el perfil. Las empresas no lo usan: se las manda al panel.
 */
export default function OnboardingPage() {
  const { user, authLoading } = useAuthUser();
  const router = useRouter();
  const { toast } = useToast();
  const [initial, setInitial] = useState<CandidateProfile | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    UserService.getUser(user.uid)
      .then((profile) => {
        if (profile?.role === "recruiter") {
          router.replace("/dashboard");
          return;
        }
        if (profile?.candidateProfile) {
          setIsEdit(true);
          const saved = normalizeCandidateProfile(profile.candidateProfile);
          // Si borró todos los idiomas, se vuelve a ofrecer la fila por defecto para no dejarla vacía.
          setInitial(saved.languages.length ? saved : { ...saved, languages: emptyCandidateProfile().languages });
        } else {
          setInitial(emptyCandidateProfile());
        }
      })
      .catch((err) => {
        console.error("[onboarding] no se pudo leer el perfil:", err);
        setInitial(emptyCandidateProfile());
      });
  }, [user, authLoading, router]);

  const save = async (profile: CandidateProfile) => {
    if (!user) return;
    setSaving(true);
    try {
      await UserService.saveCandidateProfile(user.uid, profile);
      toast({ title: "Perfil guardado", description: "Las empresas lo verán cuando postules a una vacante." });
      router.push(isEdit ? "/dashboard/profile" : "/dashboard");
    } catch (err) {
      console.error("[onboarding] error al guardar:", err);
      toast({ title: "No se pudo guardar", description: "Revisa tu conexión e inténtalo de nuevo.", variant: "destructive" });
      setSaving(false);
    }
  };

  if (!initial) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="max-w-3xl mx-auto space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-black italic">
          {isEdit ? "Tu perfil profesional." : "Cuéntanos de ti."}
        </h1>
        <p className="text-gray-500 font-medium text-sm">
          Toma unos 3 minutos. Las empresas lo ven junto con tu resultado de The LINE cuando postulas.
        </p>
      </header>
      <CandidateProfileForm
        initial={initial}
        saving={saving}
        onSave={save}
        onSkip={() => router.push(isEdit ? "/dashboard/profile" : "/dashboard")}
      />
    </div>
  );
}
