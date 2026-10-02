"use client";

import { useEffect, useState } from "react";
import { Lock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import type { GithubRepoListItem } from "@/types/github.types";

interface PrivateRepoSelectorProps {
  uid: string;
  /** Callback cuando se actualiza la selección exitosamente */
  onSelectionUpdated?: () => void;
}

/**
 * Selector manual de repos privados con opt-in explícito.
 * - Repos públicos: siempre analizados (no aparecen aquí)
 * - Repos privados: solo analizados si el usuario los marca
 * - Ninguno viene premarcado por defecto
 */
export function PrivateRepoSelector({ uid, onSelectionUpdated }: PrivateRepoSelectorProps) {
  const [allRepos, setAllRepos] = useState<GithubRepoListItem[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Cargar repos y allowlist actual
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Obtener lista de repos (sin filtrar, para mostrar todos los privados)
        const reposResponse = await fetch("/api/github/repos/raw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        });

        if (!reposResponse.ok) {
          throw new Error("No se pudieron cargar los repositorios");
        }

        const { repos } = await reposResponse.json();

        // Obtener allowlist actual
        const allowlistResponse = await fetch("/api/github/repos/allowlist");
        const allowlistData = allowlistResponse.ok
          ? await allowlistResponse.json()
          : { privateReposAllowlist: [] };

        if (!cancelled) {
          setAllRepos(repos || []);
          setSelectedRepos(new Set(allowlistData.privateReposAllowlist || []));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar repositorios");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const handleToggleRepo = (repoFullName: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoFullName)) {
        next.delete(repoFullName);
      } else {
        next.add(repoFullName);
      }
      return next;
    });
    setSuccess(false); // Reset success message when making changes
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await apiPost("/api/github/repos/allowlist", {
        privateRepos: Array.from(selectedRepos),
      });

      if (!response || typeof response !== "object") {
        throw new Error("Respuesta inválida del servidor");
      }

      setSuccess(true);
      onSelectionUpdated?.();

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la selección");
    } finally {
      setSaving(false);
    }
  };

  const privateRepos = allRepos.filter((repo) => repo.isPrivate);
  const hasPrivateRepos = privateRepos.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 bg-gray-50 rounded-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500 font-medium">Cargando repositorios...</span>
      </div>
    );
  }

  if (!hasPrivateRepos) {
    return null; // No mostrar nada si no hay repos privados
  }

  return (
    <div className="space-y-4 p-6 bg-gray-50 rounded-2xl border border-gray-100">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-gray-700" />
          <h3 className="text-sm font-bold text-black">Repositorios Privados</h3>
        </div>
        <p className="text-xs text-gray-600 font-medium leading-relaxed">
          Solo analizamos los repos privados que tú elijas explícitamente. 
          Tus repos públicos siempre se incluyen automáticamente.
        </p>
      </div>

      {/* Repo List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {privateRepos.map((repo) => {
          const isSelected = selectedRepos.has(repo.fullName);
          return (
            <label
              key={repo.fullName}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggleRepo(repo.fullName)}
                className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-gray-400 shrink-0" />
                  <span className="text-sm font-medium text-black truncate">{repo.fullName}</span>
                </div>
                {repo.language && (
                  <span className="text-xs text-gray-500">{repo.language}</span>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="text-xs text-gray-500 font-medium">
          {selectedRepos.size} de {privateRepos.length} seleccionados
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-10 px-6 bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Guardando...
            </>
          ) : (
            "Guardar Selección"
          )}
        </Button>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <span className="text-xs text-red-700 font-medium">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
          <span className="text-xs text-green-700 font-medium">
            Selección guardada exitosamente
          </span>
        </div>
      )}
    </div>
  );
}
