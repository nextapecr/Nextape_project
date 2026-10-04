"use client";

import { auth } from "@/lib/firebase/client";
import type { GithubErrorResponse } from "@/types/github.types";

/**
 * Enhanced Error class for API calls.
 * Preserves error details from backend for diagnosis.
 */
export class ApiError extends Error {
  public code: string;
  public httpStatus?: number;
  public stage?: string;
  public retryable?: boolean;

  constructor(
    code: string,
    message?: string,
    httpStatus?: number,
    stage?: string,
    retryable?: boolean
  ) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.stage = stage;
    this.retryable = retryable;
  }
}

/**
 * POST autenticado a los route handlers de NEXTAPE (`/api/*`).
 * Adjunta el Firebase ID token del usuario actual como `Authorization: Bearer` para que el
 * servidor pueda verificar la identidad con el Admin SDK. Lanza `ApiError` con detalles
 * clasificados del servidor si la respuesta no es 2xx.
 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  // Espera a que Firebase Auth resuelva el estado inicial antes de leer currentUser
  // (evita enviar la petición sin token si se llama justo tras cargar).
  await auth.authStateReady();
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Partial<GithubErrorResponse>;
    
    // Preserve all error details from backend
    throw new ApiError(
      data.error || `request_failed_${res.status}`,
      data.message,
      data.httpStatus || res.status,
      data.stage,
      data.retryable
    );
  }
  return res.json() as Promise<T>;
}

/**
 * GET autenticado a los route handlers de NEXTAPE. Mismo contrato que `apiPost`: adjunta el
 * Firebase ID token y lanza `ApiError` con detalles clasificados si la respuesta no es 2xx.
 */
export async function apiGet<T>(path: string): Promise<T> {
  await auth.authStateReady();
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Partial<GithubErrorResponse>;
    
    // Preserve all error details from backend
    throw new ApiError(
      data.error || `request_failed_${res.status}`,
      data.message,
      data.httpStatus || res.status,
      data.stage,
      data.retryable
    );
  }
  return res.json() as Promise<T>;
}
