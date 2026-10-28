import { FirestoreTimestamp } from "./firebase.types";
import type { CandidateProfile } from "@/lib/candidate-profile";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  githubUrl?: string;
  role: "developer" | "recruiter";
  /**
   * Cuestionario del candidato (experiencia, estudios, trabajos…). Solo `developer`. Lo escribe el
   * propio usuario; normalizarlo siempre con `normalizeCandidateProfile` antes de usarlo.
   */
  candidateProfile?: CandidateProfile;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface UserSkills {
  uid: string;
  scores: { [skillName: string]: number };
  updatedAt: FirestoreTimestamp;
}
