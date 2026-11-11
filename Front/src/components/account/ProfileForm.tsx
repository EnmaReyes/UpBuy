"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { updateProfile } from "@/services/account";
import { ApiError } from "@/services/api/client";
import {
  MISSING_FIELD_LABELS,
  type MissingProfileField,
  type Profile,
} from "@/types/auth";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/fields";

// Datos personales. El backend exige nombre, apellido, teléfono y una
// dirección principal para poder comprar; aquí se muestran los que falten y
// se recalculan con la respuesta real del servidor tras guardar.
export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  const [missing, setMissing] = useState<MissingProfileField[]>(
    profile.missing ?? [],
  );
  const [complete, setComplete] = useState(profile.profileComplete);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setFieldError({});

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const image = String(form.get("image") ?? "").trim();

    const nextErrors: Record<string, string> = {};
    if (phone && phone.replace(/\D/g, "").length < 7) {
      nextErrors.phone = "Escribe un teléfono válido.";
    }
    if (image && !/^https?:\/\//i.test(image)) {
      nextErrors.image = "La foto debe ser una URL http(s).";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldError(nextErrors);
      return;
    }

    setPending(true);
    try {
      const result = await updateProfile({ name, lastName, phone, image });
      setMissing(result.missing ?? []);
      setComplete(result.profileComplete);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo guardar el perfil.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ProfileStatus complete={complete} missing={missing} />

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border bg-card p-6"
        noValidate
      >
        <h2 className="font-heading text-lg font-semibold text-carbon">
          Datos personales
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Se usan para tus envíos y para contactarte sobre tus pedidos.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field id="profile-name" label="Nombre" error={fieldError.name}>
            <input
              id="profile-name"
              name="name"
              type="text"
              autoComplete="given-name"
              defaultValue={profile.name ?? ""}
              className={inputClass}
            />
          </Field>

          <Field id="profile-lastName" label="Apellido" error={fieldError.lastName}>
            <input
              id="profile-lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              defaultValue={profile.lastName ?? ""}
              className={inputClass}
            />
          </Field>

          <Field
            id="profile-phone"
            label="Teléfono"
            hint="Con indicativo si es de otro país."
            error={fieldError.phone}
          >
            <input
              id="profile-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={profile.phone ?? ""}
              className={inputClass}
              placeholder="+57 300 000 0000"
            />
          </Field>

          <Field
            id="profile-image"
            label="Foto de perfil (URL)"
            hint="Opcional."
            error={fieldError.image}
          >
            <input
              id="profile-image"
              name="image"
              type="url"
              defaultValue={profile.image ?? ""}
              className={inputClass}
              placeholder="https://…"
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {error ? <FormMessage kind="error">{error}</FormMessage> : null}
          {saved && !error ? (
            <FormMessage kind="success">Perfil guardado.</FormMessage>
          ) : null}

          <SubmitButton pending={pending} className="w-full sm:w-auto">
            Guardar cambios
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

function ProfileStatus({
  complete,
  missing,
}: {
  complete: boolean;
  missing: MissingProfileField[];
}) {
  if (complete) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-coffee/25 bg-coffee/5 p-4 text-sm text-coffee-deep">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Tu perfil está completo. Ya puedes finalizar compras.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-terracotta-deep">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Completa tu perfil para poder comprar
      </p>
      <p className="mt-2 text-sm text-coffee-deep">
        Falta: {missing.map((field) => MISSING_FIELD_LABELS[field]).join(", ")}.
      </p>
      {missing.includes("address") ? (
        <p className="mt-1 text-xs text-muted-foreground">
          La dirección se añade en la sección «Direcciones».
        </p>
      ) : null}
    </div>
  );
}
