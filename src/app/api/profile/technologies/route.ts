import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";
import { MAX_LINE_TECHNOLOGIES, normalizeLineTechnologies, removedTechnologies } from "@/lib/line-technologies";
import { removeTechnologiesFromDna } from "@/lib/server/dna-removal";

export const runtime = "nodejs";

/**
 * POST /api/profile/technologies
 * Única forma de cambiar las tecnologías que The LINE le evalúa al candidato.
 *
 * - Guarda `users/{uid}.lineTechnologies` (server-only: la regla impide escribirlo desde el cliente)
 *   y copia la lista en `candidateProfile.technologies` para mostrarla.
 * - Si quita una tecnología que ya tenía nota, la borra del DNA (`user_skill_scores`, score e
 *   historial). Devuelve qué se perdió para que la UI lo confirme.
 * - Todo en una transacción: o cambian las dos cosas, o ninguna.
 *
 * Body: { technologies: string[] }  (ids del catálogo, máx. MAX_LINE_TECHNOLOGIES)
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.technologies)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.technologies.length > MAX_LINE_TECHNOLOGIES) {
    return NextResponse.json({ error: "too_many_technologies", max: MAX_LINE_TECHNOLOGIES }, { status: 400 });
  }
  const technologies = normalizeLineTechnologies(body.technologies);

  try {
    const db = adminDb();
    const userRef = db.collection("users").doc(uid);
    const scoresRef = db.collection("user_skill_scores").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const [userSnap, scoresSnap] = await Promise.all([tx.get(userRef), tx.get(scoresRef)]);
      const user = userSnap.data();
      if (!user) return { error: "user_not_found" as const };
      if (user.role === "recruiter") return { error: "not_a_candidate" as const };

      const removed = removedTechnologies(user.lineTechnologies, technologies);
      const { scores, history, lost } = removeTechnologiesFromDna(scoresSnap.data(), removed);

      tx.set(
        userRef,
        { lineTechnologies: technologies, candidateProfile: { technologies }, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      if (scoresSnap.exists && removed.length > 0) {
        // Reemplazo completo: con merge, las claves borradas de los mapas seguirían ahí.
        tx.set(scoresRef, { ...scoresSnap.data(), scores, history, updatedAt: FieldValue.serverTimestamp() });
      }
      return { technologies, removed, lost };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "user_not_found" ? 404 : 403 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[profile/technologies] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
