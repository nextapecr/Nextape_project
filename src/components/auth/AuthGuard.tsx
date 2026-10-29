"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { UserService } from "@/services/users.service";

/** Espera a que exista `users/{uid}`: hasta `retries` reintentos cada `delayMs`. No lanza si no aparece. */
async function waitForProfile(uid: string, retries = 5, delayMs = 500): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (await UserService.getUser(uid)) return;
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  console.warn("Profile still missing after retries; letting the user in.");
}

export function AuthGuard({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus("unauthenticated");
        if (pathname.startsWith("/dashboard")) {
          router.push("/");
        }
        return;
      }

      try {
        const profile = await UserService.getUser(user.uid);
        if (!profile && pathname.startsWith("/dashboard")) {
          console.warn("Profile not yet available in Firestore, waiting...");
          // Si el usuario acaba de registrarse, el perfil puede tardar un segundo. Pase lo que pase
          // se le deja entrar; un fallo de red cae en el catch de abajo (antes quedaba como promesa
          // rechazada sin manejar).
          await waitForProfile(user.uid);
          setStatus("authenticated");
        } else {
          setStatus("authenticated");
        }
      } catch (err) {
        console.error("Auth guard error:", err);
        setStatus("authenticated"); // Dejar pasar para no bloquear al usuario por errores de red
      }
    });

    return () => unsubscribe();
  }, [router, pathname]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}