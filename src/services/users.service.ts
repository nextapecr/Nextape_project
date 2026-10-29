import { Timestamp } from "firebase/firestore";
import { getDocById, setDocById } from "@/lib/firebase/firestore";
import { UserProfile } from "@/types/user.types";
import { normalizeCandidateProfile, type CandidateProfile } from "@/lib/candidate-profile";

export const UserService = {
  getUser: (uid: string) => getDocById<UserProfile>("users", uid),
  saveUser: (uid: string, profile: Partial<UserProfile>) => setDocById("users", uid, profile),
  /**
   * Guarda el cuestionario del candidato, siempre normalizado (recorta textos, descarta opciones
   * inválidas y entradas vacías). Reemplaza el perfil anterior completo.
   */
  saveCandidateProfile: (uid: string, profile: CandidateProfile) =>
    setDocById("users", uid, {
      candidateProfile: normalizeCandidateProfile({ ...profile, completedAt: Date.now() }),
      updatedAt: Timestamp.now(),
    }),
};
