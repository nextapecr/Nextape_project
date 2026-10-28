"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth/AuthModal";
import Link from "next/link";
import {
  Zap,
  XCircle,
  Cpu,
  Terminal,
  Fingerprint,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Toaster } from "@/components/ui/toaster";

export default function Home() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F5F7] text-foreground">
      {/* Navbar - Fixed z-index */}
      <nav className={cn(
        "fixed top-0 w-full z-40 transition-all duration-500",
        scrolled 
          ? "bg-white/80 backdrop-blur-xl border-b border-gray-100 py-3" 
          : "bg-transparent py-6"
      )}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          {/* El logo vuelve al inicio. Ya en "/", sube hasta arriba y quita el #ancla de la URL. */}
          <Link
            href="/"
            aria-label="Nextape, ir al inicio"
            onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.history.replaceState(null, "", "/");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            className="lift text-xl md:text-2xl font-bold tracking-tighter flex items-center gap-2 rounded-lg"
          >
             <div className="w-6 h-6 md:w-8 md:h-8 bg-brand-blue rounded-lg" />
             <span className="text-black italic">Nextape</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#problem" className="lift inline-block text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-brand-blue">Problema</Link>
            <Link href="#how-it-works" className="lift inline-block text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-brand-blue">Cómo funciona</Link>
            <Link href="#faq" className="lift inline-block text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-brand-blue">FAQ</Link>
          </div>
          <Button 
            onClick={() => setIsAuthModalOpen(true)}
            className="bg-black text-white hover:bg-black/80 shadow-apple px-6 py-5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all"
          >
            Comenzar Gratis
          </Button>
        </div>
      </nav>

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="px-6 pt-32 md:pt-48 pb-20 md:pb-32 max-w-7xl mx-auto text-center relative">
          <div className="relative z-10 space-y-8">
            <div className="inline-flex items-center gap-2 bg-brand-blue/10 text-brand-blue px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">
              <Zap className="h-3 w-3" /> Contratación de precisión por IA
            </div>
            <h1 className="text-4xl sm:text-6xl md:text-[5.5rem] font-headline font-black leading-[1] md:leading-[0.9] tracking-tighter italic">
              Contrata <span className="text-brand-blue">talento</span> que <br className="hidden md:block" />
              demuestra lo que sabe, <br className="hidden md:block" />
              <span className="text-brand-red">no lo que dice.</span>
            </h1>
            <p className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto font-medium leading-relaxed px-4">
              Validamos habilidades técnicas reales a través de simulaciones generadas por IA. La confianza que necesitas para contratar desarrolladores de élite.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8 px-6 max-w-lg mx-auto">
              <Button
                onClick={() => setIsAuthModalOpen(true)}
                className="bg-brand-blue text-white hover:bg-brand-blue/90 h-16 px-12 rounded-2xl text-sm font-bold shadow-apple-lg uppercase tracking-widest w-full"
              >
                Ingresar como Candidato
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsAuthModalOpen(true)}
                className="border-gray-200 h-16 px-12 rounded-2xl text-sm font-bold hover:bg-gray-50 transition-all bg-white text-black uppercase tracking-widest w-full"
              >
                Soy Reclutador / Empresa
              </Button>
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section id="problem" className="py-24 md:py-40 px-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight text-black italic">
                La contratación técnica <br /> <span className="text-brand-red">está rota.</span>
              </h2>
              <div className="space-y-6">
                {[
                  { title: "CVs vs Realidad", text: "Un 'Senior' en papel puede no saber debugear una arquitectura distribuida real hoy." },
                  { title: "Pruebas Genéricas", text: "Los desafíos de algoritmos no predicen cómo un desarrollador reacciona ante un fallo en producción." },
                  { title: "Ruido y Fricción", text: "Las empresas pierden 40+ horas en entrevistas con candidatos que no tienen el nivel requerido." }
                ].map((item, i) => (
                  <div key={i} className="lift flex gap-4 p-6 bg-white rounded-[2rem] shadow-apple border border-gray-50 group hover:border-brand-blue/30">
                    <XCircle className="h-6 w-6 text-brand-red shrink-0" />
                    <div>
                      <h4 className="font-bold text-lg italic">{item.title}</h4>
                      <p className="text-gray-400 text-sm font-medium mt-1">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
               <div className="lift-sm bg-gray-950 p-12 rounded-[3rem] text-white shadow-apple-lg relative overflow-hidden group min-h-[400px] flex flex-col justify-center">
                  <div className="w-12 h-12 bg-brand-blue/20 rounded-xl mb-8 flex items-center justify-center">
                     <Cpu className="h-6 w-6 text-brand-blue" />
                  </div>
                  <h3 className="text-3xl font-black italic tracking-tight mb-4">"Buscamos precisión, <br /><span className="text-brand-blue">no volumen.</span>"</h3>
                  <p className="text-gray-400 font-medium leading-relaxed max-w-sm">Nextape filtra el ruido y nos entrega solo el DNA técnico que nuestro stack necesita.</p>
                  <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-brand-blue/10 rounded-full blur-3xl" />
               </div>
            </div>
          </div>
        </section>

        {/* How it works Section */}
        <section id="how-it-works" className="py-24 md:py-40 px-6">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-black italic">Cómo funciona.</h2>
              <p className="text-gray-500 font-medium leading-relaxed">
                Tres pasos para convertir habilidad real en un perfil que las empresas pueden verificar.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { icon: Terminal, step: "01", title: "The LINE", text: "Resuelve simulaciones técnicas generadas por IA sobre tu stack: anomalías de producción, no preguntas de sintaxis." },
                { icon: Fingerprint, step: "02", title: "CORE", text: "Cada resultado construye tu DNA técnico verificado: una huella de habilidades medida, no declarada." },
                { icon: Target, step: "03", title: "Match", text: "Tu DNA se compara con las vacantes para calcular tu compatibilidad real con cada posición." }
              ].map((item) => (
                <div key={item.step} className="lift bg-white p-10 rounded-[2.5rem] shadow-apple border border-gray-50 hover:border-brand-blue/30 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
                      <item.icon className="h-6 w-6 text-brand-blue" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">{item.step}</span>
                  </div>
                  <h3 className="text-2xl font-bold italic">{item.title}</h3>
                  <p className="text-gray-400 text-sm font-medium leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 md:py-40 px-6 bg-white">
          <div className="max-w-3xl mx-auto space-y-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center italic">Preguntas Frecuentes.</h2>
            <Accordion type="single" collapsible className="w-full">
              {[
                { q: "¿Es gratis para desarrolladores?", a: "Sí, Nextape es 100% gratuito para los desarrolladores. Nuestro modelo de negocio se basa en las empresas que buscan talento verificado." },
                { q: "¿Cómo funciona la simulación?", a: "Generamos escenarios técnicos reales basados en tu stack. Tendrás que resolver anomalías, optimizar código o diseñar arquitecturas en tiempo real." },
                { q: "¿Qué es el DNA técnico?", a: "Es tu huella técnica verificada. A diferencia de un CV, el DNA se construye con resultados de pruebas reales y es lo que las empresas consultan." }
              ].map((item, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="lift-sm border-b border-gray-50 py-4 rounded-2xl hover:bg-gray-50/60">
                  <AccordionTrigger className="text-left font-bold text-lg hover:no-underline hover:text-brand-blue transition-colors px-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-500 font-medium leading-relaxed px-4 pt-2">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <Toaster />
    </div>
  );
}