"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/services/api/client";
import { login, register } from "@/services/auth";
import { Field, FormMessage, SubmitButton, inputClass } from "./fields";

// Registro. El backend no emite sesión al crear la cuenta, así que después de
// registrarse se inicia sesión con las mismas credenciales (endpoints reales).
const MIN_PASSWORD = 8;

export function RegisterForm() {
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldError({});

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    const nextFieldErrors: Record<string, string> = {};
    if (username.length < 3) nextFieldErrors.username = "Mínimo 3 caracteres.";
    if (!/^\S+@\S+\.\S+$/.test(email)) nextFieldErrors.email = "Correo inválido.";
    if (password.length < MIN_PASSWORD) {
      nextFieldErrors.password = `Mínimo ${MIN_PASSWORD} caracteres.`;
    }
    if (password !== confirm) nextFieldErrors.confirm = "Las contraseñas no coinciden.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldError(nextFieldErrors);
      return;
    }

    setPending(true);

    try {
      await register({ username, email, password });
      await login({ username, password });
      router.replace("/cuenta/perfil");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo crear la cuenta. Inténtalo de nuevo.",
      );
      setPending(false);
    }
  };

  return (
    <div>
      <h1 className="font-heading text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-bold tracking-tight text-carbon">
        Crea tu cuenta
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Guarda tus datos una vez y agiliza tus próximas compras.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field id="reg-username" label="Usuario" error={fieldError.username}>
          <input
            id="reg-username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className={inputClass}
            placeholder="tu-usuario"
          />
        </Field>

        <Field id="reg-email" label="Correo" error={fieldError.email}>
          <input
            id="reg-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            placeholder="tu@correo.com"
          />
        </Field>

        <Field
          id="reg-password"
          label="Contraseña"
          hint={`Mínimo ${MIN_PASSWORD} caracteres.`}
          error={fieldError.password}
        >
          <input
            id="reg-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            className={inputClass}
            placeholder="••••••••"
          />
        </Field>

        <Field id="reg-confirm" label="Repite la contraseña" error={fieldError.confirm}>
          <input
            id="reg-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
            placeholder="••••••••"
          />
        </Field>

        {error ? <FormMessage kind="error">{error}</FormMessage> : null}

        <SubmitButton pending={pending} className="w-full">
          Crear cuenta
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-carbon underline underline-offset-4 hover:text-terracotta-deep"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
