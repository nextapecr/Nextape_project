"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, CircleSlash, Code2, ListOrdered, ListChecks, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Answer, PublicQuestion, QuestionType } from "@/types/question.types";

/**
 * Renderiza una pregunta de The LINE según su tipo y devuelve la respuesta con la forma que
 * espera el servidor (`Answer`).
 *
 * Los tipos de respuesta inmediata (opción múltiple, código, verdadero/falso) llaman a `onAnswer`
 * en cuanto el candidato elige. Los que se construyen (selección múltiple, ordenar) mantienen
 * estado local y confirman con un botón.
 *
 * El componente se monta con `key={question.id}`, así que el estado local se reinicia solo al
 * cambiar de pregunta.
 */

const TYPE_LABEL: Record<QuestionType, { label: string; icon: typeof Check }> = {
  multiple_choice: { label: "Opción única", icon: Check },
  code_output: { label: "Análisis de código", icon: Code2 },
  multi_select: { label: "Selección múltiple", icon: ListChecks },
  true_false: { label: "Verdadero o falso", icon: CircleSlash },
  ordering: { label: "Ordenar pasos", icon: ListOrdered },
};

/** Etiqueta del tipo, para que el candidato sepa qué se le pide antes de responder. */
export function QuestionTypeBadge({ type }: Readonly<{ type: QuestionType }>) {
  const { label, icon: Icon } = TYPE_LABEL[type];
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-white/70 rounded-full text-[9px] font-bold uppercase tracking-widest">
      <Icon className="h-3 w-3" /> {label}
    </div>
  );
}

const optionButtonClass =
  "h-auto min-h-14 py-4 rounded-xl border-white/10 text-white hover:bg-white/10 justify-start px-6 font-bold text-base transition-all text-left bg-transparent whitespace-normal";

export function QuestionCard({
  question,
  onAnswer,
}: Readonly<{
  question: PublicQuestion;
  onAnswer: (answer: Answer) => void;
}>) {
  switch (question.type) {
    case "multiple_choice":
      return <ChoiceOptions options={question.options} onPick={onAnswer} />;

    case "code_output":
      return (
        <div className="space-y-6">
          <pre className="bg-black/60 border border-white/10 rounded-2xl p-5 overflow-x-auto text-xs md:text-sm font-mono text-brand-green leading-relaxed">
            <code>{question.code}</code>
          </pre>
          <ChoiceOptions options={question.options} onPick={onAnswer} />
        </div>
      );

    case "true_false":
      return (
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            onClick={() => onAnswer(true)}
            className="h-20 rounded-2xl border-white/10 text-white hover:bg-brand-green/20 hover:border-brand-green/40 font-black italic text-xl bg-transparent"
          >
            <Check className="mr-3 h-6 w-6 text-brand-green" /> Verdadero
          </Button>
          <Button
            variant="outline"
            onClick={() => onAnswer(false)}
            className="h-20 rounded-2xl border-white/10 text-white hover:bg-brand-red/20 hover:border-brand-red/40 font-black italic text-xl bg-transparent"
          >
            <X className="mr-3 h-6 w-6 text-brand-red" /> Falso
          </Button>
        </div>
      );

    case "multi_select":
      return <MultiSelect options={question.options} onConfirm={onAnswer} />;

    case "ordering":
      return <Ordering items={question.items} onConfirm={onAnswer} />;
  }
}

/** Lista de opciones de respuesta única (la usan opción múltiple y análisis de código). */
function ChoiceOptions({
  options,
  onPick,
}: Readonly<{
  options: string[];
  onPick: (index: number) => void;
}>) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {options.map((opt, i) => (
        <Button
          key={i}
          variant="outline"
          onClick={() => onPick(i)}
          className={cn(optionButtonClass, "hover:translate-x-2")}
        >
          <span className="text-brand-blue mr-4 font-black shrink-0">{i + 1}.</span>
          {opt}
        </Button>
      ))}
    </div>
  );
}

function MultiSelect({
  options,
  onConfirm,
}: Readonly<{
  options: string[];
  onConfirm: (indexes: number[]) => void;
}>) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (i: number) =>
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  return (
    <div className="space-y-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        Marca todas las correctas · los fallos restan
      </p>
      <div className="grid grid-cols-1 gap-3">
        {options.map((opt, i) => {
          const isOn = selected.includes(i);
          return (
            <Button
              key={i}
              variant="outline"
              onClick={() => toggle(i)}
              className={cn(
                optionButtonClass,
                isOn && "bg-brand-blue/20 border-brand-blue/50 hover:bg-brand-blue/25"
              )}
            >
              <span
                className={cn(
                  "mr-4 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center",
                  isOn ? "bg-brand-blue border-brand-blue" : "border-white/30"
                )}
              >
                {isOn && <Check className="h-3 w-3 text-white" />}
              </span>
              {opt}
            </Button>
          );
        })}
      </div>
      <Button
        onClick={() => onConfirm(selected)}
        disabled={selected.length === 0}
        className="w-full h-14 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-30"
      >
        Confirmar {selected.length > 0 && `(${selected.length})`}
      </Button>
    </div>
  );
}

function Ordering({
  items,
  onConfirm,
}: Readonly<{
  items: string[];
  onConfirm: (order: number[]) => void;
}>) {
  /** Índices de `items` en el orden elegido por el candidato. */
  const [order, setOrder] = useState<number[]>([]);

  const toggle = (i: number) =>
    setOrder((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const complete = order.length === items.length;

  return (
    <div className="space-y-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        Pulsa los pasos en el orden correcto · vuelve a pulsar para quitar
      </p>
      <div className="grid grid-cols-1 gap-3">
        {items.map((item, i) => {
          const position = order.indexOf(i);
          const isOn = position !== -1;
          return (
            <Button
              key={i}
              variant="outline"
              onClick={() => toggle(i)}
              className={cn(
                optionButtonClass,
                isOn && "bg-brand-blue/20 border-brand-blue/50 hover:bg-brand-blue/25"
              )}
            >
              <span
                className={cn(
                  "mr-4 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black",
                  isOn ? "bg-brand-blue text-white" : "border border-white/20 text-white/30"
                )}
              >
                {isOn ? position + 1 : "·"}
              </span>
              {item}
            </Button>
          );
        })}
      </div>
      <Button
        onClick={() => onConfirm(order)}
        disabled={!complete}
        className="w-full h-14 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-30"
      >
        {complete ? "Confirmar orden" : `Faltan ${items.length - order.length} pasos`}
      </Button>
    </div>
  );
}
