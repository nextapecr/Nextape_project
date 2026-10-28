import { describe, it, expect } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { readPrivateReposAllowlist } from "./github-allowlist";

/** Firestore mínimo: registra qué colección se lee y devuelve los datos dados. */
function fakeDb(docs: Record<string, Record<string, unknown> | undefined>) {
  const reads: string[] = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          reads.push(`${name}/${id}`);
          return { data: () => docs[`${name}/${id}`] };
        },
      }),
    }),
  } as unknown as Firestore;
  return { db, reads };
}

describe("readPrivateReposAllowlist", () => {
  it("lee de github_tokens/{uid}, donde la guarda /api/github/repos/allowlist", async () => {
    const { db, reads } = fakeDb({
      "github_tokens/u1": { privateReposAllowlist: ["me/secret"] },
      "users/u1": { privateReposAllowlist: ["NO-ES-AQUI/x"] },
    });
    expect(await readPrivateReposAllowlist(db, "u1")).toEqual(["me/secret"]);
    expect(reads).toEqual(["github_tokens/u1"]);
  });

  it("sin documento o con datos raros devuelve []", async () => {
    expect(await readPrivateReposAllowlist(fakeDb({}).db, "u1")).toEqual([]);
    const { db } = fakeDb({ "github_tokens/u1": { privateReposAllowlist: ["ok/repo", 3, null] } });
    expect(await readPrivateReposAllowlist(db, "u1")).toEqual(["ok/repo"]);
  });
});
