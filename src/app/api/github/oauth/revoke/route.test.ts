/**
 * Tests de la decisión de revocación del token OAuth de GitHub.
 *
 * Antes este archivo probaba constantes copiadas a mano (p. ej. `checkStatus === 200`), así que
 * pasaba aunque el handler cambiara. Ahora prueba la función real que usa el handler.
 */
import { describe, it, expect } from "vitest";
import { classifyRevocation, shouldDeleteEncryptedToken } from "@/lib/server/github-revoke";

describe("classifyRevocation", () => {
  it("check 200 + DELETE 204 → revocado, sin motivo", () => {
    expect(classifyRevocation(200, 204)).toEqual({ githubRevoked: true, reason: null });
  });

  it("check 404 → token de otra app o ya revocado: no se confirma", () => {
    expect(classifyRevocation(404)).toEqual({ githubRevoked: false, reason: "other_app" });
  });

  it("check 500 → error temporal de GitHub", () => {
    expect(classifyRevocation(500)).toEqual({ githubRevoked: false, reason: "temporary" });
  });

  it("check 200 + DELETE 500 → error temporal", () => {
    expect(classifyRevocation(200, 500)).toEqual({ githubRevoked: false, reason: "temporary" });
  });

  it("error de red en el check o en el DELETE → temporal", () => {
    expect(classifyRevocation("network_error")).toEqual({ githubRevoked: false, reason: "temporary" });
    expect(classifyRevocation(200, "network_error")).toEqual({ githubRevoked: false, reason: "temporary" });
  });

  it("un reintento que esta vez recibe 204 sí revoca", () => {
    expect(classifyRevocation(200, 500).githubRevoked).toBe(false);
    expect(classifyRevocation(200, 204).githubRevoked).toBe(true);
  });
});

describe("shouldDeleteEncryptedToken", () => {
  it("solo borra el token cifrado con revocación confirmada", () => {
    expect(shouldDeleteEncryptedToken(classifyRevocation(200, 204))).toBe(true);
    expect(shouldDeleteEncryptedToken(classifyRevocation(404))).toBe(false);
    expect(shouldDeleteEncryptedToken(classifyRevocation(200, 500))).toBe(false);
    expect(shouldDeleteEncryptedToken(classifyRevocation("network_error"))).toBe(false);
  });
});
