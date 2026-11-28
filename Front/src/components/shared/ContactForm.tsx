"use client";

import { useState, type FormEvent } from "react";
import { Check, AlertCircle } from "lucide-react";
import { apiSend } from "@/services/api/client";

type FormStatus = "idle" | "pending" | "success" | "error";

type ContactoPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

// Formulario de contacto publico. Envía el mensaje al endpoint
// POST /api/contacto del backend y muestra el estado al usuario.
export function ContactForm() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("pending");
    setErrorMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: ContactoPayload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      subject: String(formData.get("subject") || ""),
      message: String(formData.get("message") || ""),
    };

    try {
      await apiSend<{ message: string; id: string }>("/api/contacto", {
        method: "POST",
        body: payload,
      });

      setStatus("success");
      form.reset();
    } catch (error) {
      setStatus("error");
      if (error instanceof Error) {
        setErrorMessage(error.message || "No se pudo enviar el mensaje.");
      } else {
        setErrorMessage("No se pudo enviar el mensaje. Intentalo de nuevo.");
      }
    }
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
        disabled={status === "pending"}
        className="mt-1 inline-flex h-12 items-center justify-center rounded-full bg-carbon px-7 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "pending" ? "Enviando…" : "Enviar mensaje"}
      </button>

      {status === "success" ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-terracotta/25 bg-terracotta/5 p-3 text-xs leading-relaxed text-coffee-deep"
        >
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-deep" aria-hidden="true" />
          ¡Mensaje enviado! Te responderemos a tu correo en 1–2 días hábiles.
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red/25 bg-red/5 p-3 text-xs leading-relaxed text-red-deep"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-deep" aria-hidden="true" />
          {errorMessage}
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
