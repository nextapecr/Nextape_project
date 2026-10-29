/**
 * @fileOverview Servicio de lectura del Roadmap Determinístico.
 *
 * Responsabilidades:
 *   - Leer la ruta y el catálogo de skills desde Firestore.
 *   - Leer el DNA del usuario (user_skill_scores) y la evidencia del GitHub Engine.
 *   - Inferir el fromLevel del usuario desde su DNA.
 *
 * El cómputo del roadmap en sí (score resolution, prioridad, topological sort)
 * vive en src/lib/roadmap-engine.ts — función pura, testeable aislada.
 *
 * ⚠️ detectGaps() fue REEMPLAZADO por computeRoadmap() de roadmap-engine.ts.
 * La lógica anterior comparaba 5 dimensiones agregadas con un umbral plano.
 * El nuevo algoritmo usa ROLE_WEIGHTS × SENIORITY_THRESHOLDS por ruta y aplica
 * Kahn's topological sort sobre el grafo de prerequisitos del catálogo.
 *
 * Nota de arquitectura — excepción al patrón server-trust:
 * El cómputo del roadmap se ejecuta client-side (ver src/lib/roadmap-engine.ts).
 * Este servicio solo hace lecturas de Firestore; no escribe datos verificados.
 */

import { getDocById } from "@/lib/firebase/firestore";
import { inferFromLevel } from "@/lib/roadmap-engine";
import type { Skill, RoadmapRoute } from "@/types/roadmap.types";
import type { UserSkills } from "@/types/user.types";
import type { GithubEvidence } from "@/types/github.types";
import type { SeniorityLevel } from "@/services/github-engine/role-mapping/role-weights";

export const RoadmapService = {
  /**
   * Carga una ruta de progresión desde Firestore.
   * Colección: `roadmap_routes/{routeId}`.
   */
  getRoute: (routeId: string) =>
    getDocById<RoadmapRoute>("roadmap_routes", routeId),

  /**
   * Carga múltiples skills del catálogo por sus IDs.
   * Realiza N lecturas individuales (N = skills de la ruta, ej: 18 para MVP Backend).
   *
   * Optimización futura (V2): usar batch query cuando el catálogo crezca
   * y se quiera reducir los round-trips a 1.
   */
  async getCatalogSkills(skillIds: string[]): Promise<Skill[]> {
    const results = await Promise.all(
      skillIds.map((id) => getDocById<Skill>("skill_catalog", id))
    );
    // Filtrar nulls (skills que no existen en el catálogo — dato inconsistente)
    return results.filter((s): s is Skill => s !== null);
  },

  /**
   * Carga el DNA técnico del usuario.
   * Colección: `user_skill_scores/{uid}` (lectura del owner, write:false).
   */
  getDNA: (uid: string) => getDocById<UserSkills>("user_skill_scores", uid),

  /**
   * Carga la evidencia del GitHub Engine para el usuario (opcional).
   * Colección: `github_evidence/{uid}` (lectura del owner, write:false).
   * Si no existe, el score resolution usará solo The LINE o 0.
   */
  getGithubEvidence: (uid: string) =>
    getDocById<GithubEvidence>("github_evidence", uid),

  /**
   * Infiere el nivel actual (`fromLevel`) del usuario desde su DNA.
   * Usa SENIORITY_THRESHOLDS: { junior: 50, mid: 70, senior: 85 }.
   *
   * El usuario nunca elige el fromLevel manualmente — se determina
   * automáticamente a partir del promedio de sus scores DNA.
   */
  inferUserLevel: (dna: Record<string, number>): SeniorityLevel =>
    inferFromLevel(dna),

  /**
   * Carga la ruta MVP por defecto para el rol backend.
   * Conveniencia: evita que la página construya el routeId manualmente.
   */
  getDefaultRoute: (targetRole: string, fromLevel: SeniorityLevel, toLevel: SeniorityLevel) => {
    const routeId = `${targetRole}_${fromLevel}_to_${toLevel}`;
    return getDocById<RoadmapRoute>("roadmap_routes", routeId);
  },
};
