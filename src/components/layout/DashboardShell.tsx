"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Briefcase, 
  Fingerprint, 
  Map, 
  Target,
  Terminal,
  LogOut,
  Menu,
  User,
  PlusCircle,
  Users,
} from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { UserService } from "@/services/users.service";
import { UserProfile } from "@/types/user.types";

export function DashboardShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const data = await UserService.getUser(user.uid);
        setProfile(data);
      }
    });
    return () => unsubscribe();
  }, []);

  const developerItems = [
    { name: "Panel", icon: LayoutDashboard, href: "/dashboard" },
    { name: "The LINE", icon: Terminal, href: "/dashboard/line" },
    { name: "CORE", icon: Fingerprint, href: "/dashboard/core" },
    { name: "GitHub", icon: GithubIcon, href: "/dashboard/github" },
    { name: "Roadmap", icon: Map, href: "/dashboard/roadmap" },
    { name: "Empleos", icon: Briefcase, href: "/dashboard/jobs" },
    { name: "Compatibilidad", icon: Target, href: "/dashboard/compatibility" },
    { name: "Perfil", icon: User, href: "/dashboard/profile" },
  ];

  const recruiterItems = [
    { name: "Resumen", icon: LayoutDashboard, href: "/dashboard" },
    { name: "Mis Vacantes", icon: Briefcase, href: "/dashboard/vacancies" },
    { name: "Publicar", icon: PlusCircle, href: "/dashboard/vacancies/new" },
    { name: "Candidatos", icon: Users, href: "/dashboard/candidates" },
  ];

  const navItems = profile?.role === "recruiter" ? recruiterItems : developerItems;

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.name} href={item.href} onClick={onClick}>
            <div className={`lift-sm flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium ${isActive ? "bg-brand-blue text-white shadow-md shadow-brand-blue/20" : "text-gray-500 hover:bg-gray-100"}`}>
              <item.icon className={`h-5 w-5 ${isActive ? "text-white" : "text-gray-400"}`} />
              {item.name}
            </div>
          </Link>
        );
      })}
    </nav>
  );

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen bg-[#F5F5F7] font-body text-foreground">
      <aside className="hidden md:flex flex-col w-72 fixed top-0 bottom-0 bg-white/70 backdrop-blur-xl border-r border-gray-200 z-50">
        <div className="p-8">
          <Link href="/" aria-label="Nextape, ir al inicio" className="lift inline-flex items-center gap-2 rounded-xl">
            <div className="w-8 h-8 bg-brand-blue rounded-xl flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-full" />
            </div>
            <span className="text-xl font-bold tracking-tight text-black italic">Nextape.</span>
          </Link>
          {profile?.role === "recruiter" && (
            <div className="mt-2 text-[9px] font-black bg-black text-white px-2 py-0.5 rounded-md inline-block uppercase tracking-widest">Empresa</div>
          )}
        </div>
        
        <div className="flex-grow px-4 overflow-y-auto">
          <NavLinks />
        </div>

        <div className="p-6">
          <Button 
            variant="ghost" 
            onClick={handleSignOut}
            className="w-full justify-start gap-3 text-gray-400 hover:text-brand-red hover:bg-brand-red/5 rounded-2xl py-6 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      <header className="md:hidden fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-200 z-40 p-4 flex justify-between items-center h-16">
        <Link href="/" aria-label="Nextape, ir al inicio" className="lift text-xl font-bold tracking-tight text-black italic">Nextape.</Link>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full bg-gray-100 h-10 w-10">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 border-none p-0 bg-white">
            <SheetHeader className="p-8 border-b border-gray-50">
              <SheetTitle className="text-left flex items-center gap-2 text-black italic font-bold">
                 <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="lift">
                   Nextape.
                 </Link>
              </SheetTitle>
            </SheetHeader>
            <div className="p-6 overflow-y-auto h-full pb-20">
              <NavLinks onClick={() => setIsMobileMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <main className="flex-1 md:ml-72 pt-16 md:pt-0 min-h-screen">
        <div className="p-4 md:p-10 max-w-7xl mx-auto pb-20 md:pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
