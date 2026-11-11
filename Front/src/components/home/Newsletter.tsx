"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";

// Newsletter: el formulario queda preparado, pero NO simula una suscripción.
// Mientras el backend no exponga un endpoint de suscripción, el envío muestra
// un aviso explícito de integración pendiente (ver docs/BACKEND_INTEGRATION.md).
export function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "pending">("idle");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("pending");
  };

  return (
    <section className="section-y bg-carbon text-cream">
      <div className="container-page">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <h2 className="font-heading text-[clamp(1.5rem,3vw,2.5rem)] leading-tight font-bold tracking-tight">
              Un paso adelante
            </h2>
            <p className="mt-3 max-w-lg text-base text-cream/70">
              Drops, nuevas colecciones y beneficios. Un correo al mes, sin ruido.
            </p>
          </div>

          <div className="lg:col-span-6">
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="newsletter-email" className="sr-only">
                  Correo electrónico
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@correo.com"
                  className="h-12 w-full rounded-lg border border-cream/30 bg-transparent px-4 text-sm text-cream placeholder:text-cream/60 focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={status === "pending"}
                className="h-12 rounded-full bg-terracotta-deep px-7 text-sm font-semibold text-cream transition-colors hover:bg-[#8F3900] disabled:cursor-not-allowed disabled:opacity-70"
              >
                Suscribirme
              </button>
            </form>

            {status === "pending" ? (
              <p
                role="status"
                className="mt-3 flex items-start gap-2 text-xs text-cream/70"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta" aria-hidden="true" />
                La suscripción todavía no está disponible: falta el endpoint de newsletter en el
                backend. Tu correo no fue almacenado.
              </p>
            ) : (
              <p className="mt-3 text-xs text-cream/50">
                Integración pendiente: el backend aún no expone un endpoint de suscripción.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
