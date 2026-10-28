/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CandidateProfileForm } from "./CandidateProfileForm";
import { emptyCandidateProfile, type CandidateProfile } from "@/lib/candidate-profile";

afterEach(cleanup);
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

const aboutDone = (): CandidateProfile => ({
  ...emptyCandidateProfile(),
  headline: "Desarrollador frontend",
  yearsOfExperience: "1-3",
  selfLevel: "junior",
});

const renderForm = (initial: CandidateProfile, onSave = vi.fn(), onSkip = vi.fn()) => {
  render(createElement(CandidateProfileForm, { initial, saving: false, onSave, onSkip }));
  return { onSave, onSkip };
};

const next = () => fireEvent.click(screen.getByRole("button", { name: /siguiente|guardar perfil/i }));

describe("CandidateProfileForm", () => {
  it("no deja avanzar sin lo mínimo y explica qué falta", () => {
    renderForm(emptyCandidateProfile());
    next();
    expect(screen.getByRole("alert").textContent).toMatch(/cómo te presentas/i);
    expect(screen.getByText(/paso 1 de 4/i)).toBeTruthy();
  });

  it("valida cada trabajo agregado y exige al menos un estudio", () => {
    renderForm(aboutDone());

    next(); // → Experiencia
    expect(screen.getByText(/paso 2 de 4/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /agregar trabajo/i }));
    next(); // trabajo vacío: error
    expect(screen.getByRole("alert").textContent).toMatch(/falta la empresa/i);

    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "Acme" } }); // empresa
    fireEvent.change(inputs[1], { target: { value: "Dev Jr" } }); // puesto
    const start = document.querySelector('input[type="month"]') as HTMLInputElement;
    fireEvent.change(start, { target: { value: "2023-02" } });
    next(); // → Estudios

    expect(screen.getByText(/paso 3 de 4/i)).toBeTruthy();
    next(); // sin estudios: error
    expect(screen.getByRole("alert").textContent).toMatch(/al menos un estudio/i);
  });

  it("'Completar después' llama a onSkip sin guardar", () => {
    const { onSave, onSkip } = renderForm(aboutDone());
    fireEvent.click(screen.getByRole("button", { name: /completar después/i }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("con todo completo, el último paso guarda", () => {
    const full: CandidateProfile = {
      ...aboutDone(),
      education: [{ institution: "UCR", program: "Computación", level: "bachelor", status: "in-progress", year: "2027" }],
    };
    const { onSave } = renderForm(full);
    next(); // about → work (sin trabajos: permitido)
    next(); // work → education
    next(); // education → extras
    expect(screen.getByText(/paso 4 de 4/i)).toBeTruthy();
    next(); // guardar
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({ headline: "Desarrollador frontend", education: [{ institution: "UCR" }] });
  });
});
