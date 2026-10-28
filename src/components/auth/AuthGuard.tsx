"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { UserService } from "@/services/users.service";

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
          // Si el usuario acaba de registrarse, el perfil puede tardar un segundo
          let retryCount = 0;
          const checkProfile = async () => {
             const p = await UserService.getUser(user.uid);
             if (p) {
               setStatus("authenticated");
             } else if (retryCount < 5) {
               retryCount++;
               setTimeout(checkProfile, 500);
             } else {
               // Si después de 5 reintentos no hay perfil, lo dejamos pasar pero avisamos
               setStatus("authenticated");
             }
          };
          checkProfile();
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