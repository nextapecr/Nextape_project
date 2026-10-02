import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyRequestUid } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/**
 * POST /api/github/repos/allowlist
 * Actualiza la lista de repos privados que el usuario explícitamente seleccionó para analizar.
 * 
 * - Repos públicos: siempre se analizan (no requieren opt-in)
 * - Repos privados: solo se analizan si están en esta allowlist
 * 
 * Body: { privateRepos: string[] }  // formato: ["owner/repo1", "owner/repo2"]
 * 
 * Security: Solo actualizable vía route handler autenticado, NUNCA directo desde cliente.
 */
export async function POST(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const privateRepos = Array.isArray(body?.privateRepos) ? body.privateRepos : [];

  // Validar formato: cada item debe ser "owner/repo"
  const validFormat = privateRepos.every(
    (repo: unknown) => typeof repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(repo)
  );
  if (!validFormat) {
    return NextResponse.json(
      { error: "invalid_format", message: "Each repo must be in format: owner/repo" },
      { status: 400 }
    );
  }

  try {
    const tokenRef = adminDb().collection("github_tokens").doc(uid);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return NextResponse.json(
        { error: "no_github_token", message: "Connect GitHub first" },
        { status: 404 }
      );
    }

    // Actualizar allowlist
    await tokenRef.update({
      privateReposAllowlist: privateRepos,
      lastUsedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      privateReposCount: privateRepos.length,
      message: `Updated allowlist with ${privateRepos.length} private repos`,
    });
  } catch (err) {
    console.error("[github/repos/allowlist] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/**
 * GET /api/github/repos/allowlist
 * Obtiene la lista actual de repos privados permitidos.
 */
export async function GET(req: NextRequest) {
  const uid = await verifyRequestUid(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const tokenDoc = await adminDb().collection("github_tokens").doc(uid).get();

    if (!tokenDoc.exists) {
      return NextResponse.json(
        { error: "no_github_token", message: "Connect GitHub first" },
        { status: 404 }
      );
    }

    const data = tokenDoc.data();
    const privateReposAllowlist = Array.isArray(data?.privateReposAllowlist)
      ? data.privateReposAllowlist
      : [];

    return NextResponse.json({
      privateReposAllowlist,
      count: privateReposAllowlist.length,
    });
  } catch (err) {
    console.error("[github/repos/allowlist GET] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
