"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/services/api/client";
import { login, register } from "@/services/auth";
import { AdminMfaForm } from "./AdminMfaForm";
import { Field, FormMessage, SubmitButton, inputClass } from "./fields";
import { PasswordInput } from "./PasswordInput";
import { SocialLogin, type SocialMfaState } from "./SocialLogin";

// Registro. El backend no emite sesión al crear la cuenta, así que después de
// registrarse se inicia sesión con las mismas credenciales (endpoints reales).
const MIN_PASSWORD = 8;

type MfaState =
  | { mode: "challenge"; challengeId: string }
  | { mode: "enroll"; enrollmentTicket: string; message: string };

export function RegisterForm() {
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [socialPending, setSocialPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [mfa, setMfa] = useState<MfaState | null>(null);

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
    if (form.get("acceptLegal") !== "on") {
      nextFieldErrors.legal =
        "Debes aceptar la Política de Privacidad y los Términos y Condiciones.";
    }

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

  const handleSocialMfa = (state: SocialMfaState) => {
    setMfa(state);
  };

  if (mfa?.mode === "challenge") {
    return (
      <AdminMfaForm
        mode="challenge"
        challengeId={mfa.challengeId}
        nextPath="/admin"
        onBack={() => setMfa(null)}
      />
    );
  }

  if (mfa?.mode === "enroll") {
    return (
      <AdminMfaForm
        mode="enroll"
        enrollmentTicket={mfa.enrollmentTicket}
        nextPath="/admin"
        onBack={() => setMfa(null)}
      />
    );
  }

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
          <PasswordInput
            id="reg-password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            placeholder="••••••••"
          />
        </Field>

        <Field id="reg-confirm" label="Repite la contraseña" error={fieldError.confirm}>
          <PasswordInput
            id="reg-confirm"
            name="confirm"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>

        <div className="flex items-start gap-3">
          <input
            id="reg-legal"
            name="acceptLegal"
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#0B0B0B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          />
          <label
            htmlFor="reg-legal"
            className="text-xs leading-relaxed text-coffee-deep"
          >
            He leído y acepto la{" "}
            <Link
              href="/politica-de-privacidad"
              className="font-semibold text-carbon underline underline-offset-4 transition-colors hover:text-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              Política de Privacidad
            </Link>{" "}
            y los{" "}
            <Link
              href="/terminos-y-condiciones"
              className="font-semibold text-carbon underline underline-offset-4 transition-colors hover:text-terracotta-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              Términos y Condiciones
            </Link>
            .
          </label>
        </div>
        {fieldError.legal ? (
          <p className="text-xs font-medium text-terracotta-deep" role="alert">
            {fieldError.legal}
          </p>
        ) : null}

        {error ? <FormMessage kind="error">{error}</FormMessage> : null}

        <SubmitButton
          pending={pending}
          disabled={socialPending}
          busy={socialPending}
          className="w-full"
        >
          Crear cuenta
        </SubmitButton>
      </form>

      <SocialLogin
        disabled={pending}
        requestedPath={null}
        onMfa={handleSocialMfa}
        onStart={() => setError(null)}
        onPendingChange={setSocialPending}
      />

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
