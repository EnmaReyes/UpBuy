"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "./fields";

// Campo de contraseña con botón de mostrar/ocultar.
//
// El `type` se cambia sobre el mismo nodo (no se remonta el input), así que el
// valor, el cursor y el autocompletado del navegador se conservan. El toggle no
// envía el formulario y devuelve el foco al input manteniendo la selección.

type PasswordInputProps = {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  placeholder?: string;
  describedBy?: string;
};

export function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
  placeholder = "••••••••",
  describedBy,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;

    setVisible((current) => !current);

    // Tras el cambio de tipo se restaura el foco y la selección. Se hace en el
    // siguiente frame para que el navegador ya haya pintado el nuevo tipo.
    window.requestAnimationFrame(() => {
      const next = inputRef.current;
      if (!next) return;
      next.focus();
      if (start === null || end === null) return;
      try {
        next.setSelectionRange(start, end);
      } catch {
        // Algunos navegadores no permiten seleccionar en ciertos tipos.
      }
    });
  };

  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className={cn(inputClass, "pr-12")}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-controls={id}
        aria-pressed={visible}
        title={label}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-coffee-deep transition-colors hover:text-carbon focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-terracotta"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
