"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";

// Formulario de contacto. El backend todavía no expone un endpoint de mensajes,
// así que el envío NO simula una operación exitosa: solo explica el estado.
export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "pending">("idle");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("pending");
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="contact-name">
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className={inputClass}
            placeholder="Tu nombre"
          />
        </Field>
        <Field label="Correo electrónico" htmlFor="contact-email">
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            placeholder="tu@correo.com"
          />
        </Field>
      </div>

      <Field label="Asunto" htmlFor="contact-subject">
        <select id="contact-subject" name="subject" className={inputClass} defaultValue="pedido">
          <option value="pedido">Mi pedido</option>
          <option value="tallas">Tallas y disponibilidad</option>
          <option value="cambios">Cambios y devoluciones</option>
          <option value="otro">Otro asunto</option>
        </select>
      </Field>

      <Field label="Mensaje" htmlFor="contact-message">
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          className={`${inputClass} h-auto resize-y py-3`}
          placeholder="Cuéntanos en qué podemos ayudarte."
        />
      </Field>

      <button
        type="submit"
        className="mt-1 inline-flex h-12 items-center justify-center rounded-full bg-carbon px-7 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
      >
        Enviar mensaje
      </button>

      {status === "pending" ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-terracotta/25 bg-terracotta/5 p-3 text-xs leading-relaxed text-coffee-deep"
        >
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-deep" aria-hidden="true" />
          El envío de mensajes todavía no está disponible: falta el endpoint de contacto en el
          backend. Tu mensaje no fue enviado ni almacenado.
        </p>
      ) : null}
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon placeholder:text-muted-foreground/70 focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold tracking-wide text-coffee-deep uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}
