"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Mail, Loader2 } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { useRouter } from "next/navigation";
import { 
  signInWithGoogle, 
  signInWithGithub, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "@/lib/firebase/auth";
import { auth } from "@/lib/firebase/client";
import { UserService } from "@/services/users.service";
import { Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function AuthModal({ isOpen, onClose }: Readonly<{ isOpen: boolean; onClose: () => void }>) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<"developer" | "recruiter">("developer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      if (mode === "register") {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await UserService.saveUser(user.uid, {
          uid: user.uid,
          displayName: name || user.displayName || "User",
          email: user.email!,
          role: accountType,
          createdAt: Timestamp.now() as any
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      
      toast({ title: mode === "login" ? "Acceso correcto" : "Cuenta creada con éxito" });
      onClose();
      // Un candidato recién registrado pasa primero por el cuestionario de perfil profesional.
      router.push(mode === "register" && accountType === "developer" ? "/dashboard/onboarding" : "/dashboard");
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        title: "Error de autenticación",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'github') => {
    setLoading(true);
    try {
      const result = provider === 'google' ? await signInWithGoogle() : await signInWithGithub();
      const user = result.user;
      
      const existing = await UserService.getUser(user.uid);
      const isNewDeveloper = !existing && accountType === "developer";
      if (!existing) {
        await UserService.saveUser(user.uid, {
          uid: user.uid,
          displayName: user.displayName || "User",
          email: user.email!,
          photoURL: user.photoURL || undefined,
          role: accountType,
          createdAt: Timestamp.now() as any
        });
      }
      onClose();
      router.push(isNewDeveloper ? "/dashboard/onboarding" : "/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[92vw] sm:max-w-[450px] border-none shadow-apple-lg rounded-[2.5rem] p-6 sm:p-10 bg-white overflow-y-auto max-h-[90vh] z-[150]">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-4 sm:mb-6 italic">
            {mode === "login" ? "Bienvenido." : "Únete a Nextape."}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleAuth} className="space-y-4 sm:space-y-6">
          {/* Tipo de cuenta: visible siempre. El registro social (Google/GitHub) también crea la
              cuenta y necesita el rol elegido; en el login de un usuario existente se ignora. */}
          <div className="space-y-2 sm:space-y-3">
              <Label className="font-bold text-[10px] uppercase tracking-widest text-gray-400">Tipo de cuenta</Label>
              <RadioGroup
                defaultValue="developer"
                onValueChange={(val) => setAccountType(val as any)}
                className="grid grid-cols-2 gap-2 sm:gap-3"
              >
                <div className={cn(
                  "flex items-center space-x-2 border rounded-2xl p-4 transition-all cursor-pointer",
                  accountType === "developer" ? "border-brand-blue bg-brand-blue/5 shadow-sm" : "border-gray-100 hover:bg-gray-50"
                )}>
                  <RadioGroupItem value="developer" id="developer-modal" className="hidden" />
                  <Label htmlFor="developer-modal" className="flex-1 cursor-pointer text-center font-bold text-[10px] tracking-widest uppercase">Desarrollador</Label>
                </div>
                <div className={cn(
                  "flex items-center space-x-2 border rounded-2xl p-4 transition-all cursor-pointer",
                  accountType === "recruiter" ? "border-brand-blue bg-brand-blue/5 shadow-sm" : "border-gray-100 hover:bg-gray-50"
                )}>
                  <RadioGroupItem value="recruiter" id="recruiter-modal" className="hidden" />
                  <Label htmlFor="recruiter-modal" className="flex-1 cursor-pointer text-center font-bold text-[10px] tracking-widest uppercase">Empresa</Label>
                </div>
              </RadioGroup>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="font-bold text-[10px] uppercase tracking-widest text-gray-400 ml-1">Nombre Completo</Label>
                <Input 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: John Doe" 
                  className="bg-gray-50 border-none h-12 sm:h-14 rounded-2xl px-5 focus-visible:ring-1" 
                />
              </div>
            )}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="font-bold text-[10px] uppercase tracking-widest text-gray-400 ml-1">Email Corporativo</Label>
              <Input 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email" 
                required
                placeholder="name@company.com" 
                className="bg-gray-50 border-none h-12 sm:h-14 rounded-2xl px-5 focus-visible:ring-1" 
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="font-bold text-[10px] uppercase tracking-widest text-gray-400 ml-1">Contraseña</Label>
              <Input 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password" 
                required
                placeholder="••••••••" 
                className="bg-gray-50 border-none h-12 sm:h-14 rounded-2xl px-5 focus-visible:ring-1" 
              />
            </div>
          </div>

          <Button 
            type="submit"
            disabled={loading}
            className="w-full h-12 sm:h-14 text-base sm:text-lg font-bold rounded-2xl bg-black text-white hover:bg-black/90 shadow-apple transition-all uppercase tracking-widest"
          >
            {loading && <Loader2 className="animate-spin h-5 w-5" />}
            {!loading && (mode === "login" ? "Acceder" : "Crear Perfil")}
          </Button>

          <div className="relative py-2 sm:py-4">
            <div className="absolute inset-0 flex items-center">
              <Separator className="bg-gray-100" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-white px-4 font-bold tracking-widest text-gray-300">O autenticarse vía</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Button onClick={() => handleSocialAuth('github')} type="button" variant="outline" className="border-gray-100 rounded-2xl h-12 sm:h-14 font-bold hover:bg-gray-50 text-xs sm:text-sm">
              <GithubIcon className="mr-2 h-4 w-4" /> Github
            </Button>
            <Button onClick={() => handleSocialAuth('google')} type="button" variant="outline" className="border-gray-100 rounded-2xl h-12 sm:h-14 font-bold hover:bg-gray-50 text-xs sm:text-sm">
              <Mail className="mr-2 h-4 w-4" /> Google
            </Button>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-xs font-bold text-gray-400 hover:text-brand-blue transition-colors uppercase tracking-widest"
            >
              {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}