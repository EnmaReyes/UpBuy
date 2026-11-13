"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import {
  enrollAdminMfa,
  setupAdminMfa,
  verifyAdminMfa,
  type AdminEnrollment,
} from "@/services/auth";
import { ApiError } from "@/services/api/client";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/fields";

// Segundo paso del login administrativo (ADM-2 backend, UI en ADM-1).
//
// Dos modos:
//   - "challenge": el admin ya tiene TOTP y confirma un código.
//   - "enroll": el admin aún no lo configuró. `setup` devuelve el secreto y los
//     códigos de respaldo UNA sola vez; luego se valida el primer TOTP para
//     activar el segundo factor y emitir la sesión.

type AdminMfaFormProps =
  | {
      mode: "challenge";
      challengeId: string;
      nextPath: string;
      onBack?: () => void;
    }
  | {
      mode: "enroll";
      enrollmentTicket: string;
      nextPath: string;
      onBack?: () => void;
    };

export function AdminMfaForm(props: AdminMfaFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrollment, setEnrollment] = useState<AdminEnrollment | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(props.mode === "enroll");
  const setupStarted = useRef(false);

  const enrollmentTicket =
    props.mode === "enroll" ? props.enrollmentTicket : null;

  const nextPath = props.nextPath.startsWith("/")
    ? props.nextPath
    : "/admin";

  useEffect(() => {
    if (!enrollmentTicket || setupStarted.current) return;
    setupStarted.current = true;

    let active = true;
    setupAdminMfa(enrollmentTicket)
      .then((value) => {
        if (active) setEnrollment(value);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "No se pudo preparar la verificación en dos pasos.",
        );
      })
      .finally(() => {
        if (active) setLoadingSetup(false);
      });

    return () => {
      active = false;
    };
  }, [enrollmentTicket]);

  const finish = () => {
    router.replace(nextPath);
    router.refresh();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Escribe el código de 6 dígitos.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      if (props.mode === "challenge") {
        await verifyAdminMfa({ challengeId: props.challengeId, code: trimmed });
      } else {
        await enrollAdminMfa({
          enrollmentTicket: props.enrollmentTicket,
          code: trimmed,
        });
      }
      finish();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "MFA_INVALID_CODE") {
        setError(
          "El código no es válido o ya se usó. Prueba con el siguiente de tu app.",
        );
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError("No se pudo verificar el código. Inténtalo de nuevo.");
      }
      setPending(false);
    }
  };

  if (loadingSetup) {
    return (
      <div aria-live="polite" className="flex flex-col gap-3">
        <h1 className="font-heading text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-bold tracking-tight text-carbon">
          Configura tu segundo factor
        </h1>
        <p className="text-sm text-muted-foreground">
          Estamos generando tu secreto de verificación…
        </p>
      </div>
    );
  }

  return (
    <div>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </span>

      <h1 className="mt-4 font-heading text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-bold tracking-tight text-carbon">
        {props.mode === "challenge"
          ? "Verificación en dos pasos"
          : "Activa la verificación en dos pasos"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {props.mode === "challenge"
          ? "Escribe el código de tu aplicación de autenticación para entrar al panel."
          : "Este paso es obligatorio para las cuentas administrativas."}
      </p>

      {props.mode === "enroll" && enrollment ? (
        <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-coffee-deep uppercase">
              Secreto TOTP
            </p>
            <p className="mt-1 font-mono text-sm break-all text-carbon">
              {enrollment.secret}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Añádelo a tu app (Google Authenticator, 1Password, Authy…) o abre
              esta URL:
            </p>
            <p className="mt-1 font-mono text-xs break-all text-coffee-deep">
              {enrollment.otpauthUrl}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-coffee-deep uppercase">
              Códigos de respaldo
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Guárdalos ahora: no se vuelven a mostrar. Cada uno sirve una sola
              vez si pierdes el teléfono.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs text-carbon sm:grid-cols-3">
              {enrollment.backupCodes.map((item) => (
                <li
                  key={item}
                  className="rounded border border-border bg-background px-2 py-1 text-center tracking-wider"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field
          id="admin-mfa-code"
          label="Código de verificación"
          hint="6 dígitos de tu app o un código de respaldo."
        >
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="admin-mfa-code"
              name="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={20}
              placeholder="123456 o XXXXX-XXXXX"
              aria-invalid={Boolean(error)}
              disabled={pending}
              className={`${inputClass} pl-10 tracking-[0.18em] placeholder:tracking-normal`}
            />
          </div>
        </Field>

        {error ? <FormMessage kind="error">{error}</FormMessage> : null}

        <SubmitButton pending={pending} className="w-full">
          {props.mode === "challenge" ? "Entrar al panel" : "Activar y entrar"}
        </SubmitButton>

        {props.onBack ? (
          <button
            type="button"
            onClick={props.onBack}
            disabled={pending}
            className="text-sm font-medium text-coffee-deep underline underline-offset-4 hover:text-carbon disabled:opacity-60"
          >
            Volver a iniciar sesión
          </button>
        ) : null}
      </form>
    </div>
  );
}
