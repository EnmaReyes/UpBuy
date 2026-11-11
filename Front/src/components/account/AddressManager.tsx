"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MapPin, Pencil, Star, Trash2, X } from "lucide-react";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/services/account";
import { ApiError } from "@/services/api/client";
import type { Address } from "@/types/auth";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/fields";
import { cn } from "@/lib/utils";

// Gestión de direcciones: listar, crear, editar, marcar principal y eliminar.
// Tras cada cambio se refresca el servidor (`router.refresh`) para que la
// lista y el estado de "perfil completo" vengan siempre del backend.
export function AddressManager({ addresses }: { addresses: Address[] }) {
  const router = useRouter();

  const [editing, setEditing] = useState<Address | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowPending, setRowPending] = useState<string | null>(null);

  const isFirst = addresses.length === 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      department: String(form.get("department") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      reference: String(form.get("reference") ?? "").trim(),
      isDefault: form.get("isDefault") === "on",
    };

    if (payload.address.length < 5) {
      setError("Escribe una dirección válida (calle, número, ciudad).");
      return;
    }

    setPending(true);
    try {
      if (editing) {
        await updateAddress(editing.id, payload);
        setNotice("Dirección actualizada.");
      } else {
        await createAddress(payload);
        setNotice("Dirección agregada.");
      }
      formEl.reset();
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo guardar la dirección.",
      );
    } finally {
      setPending(false);
    }
  };

  const onDelete = async (address: Address) => {
    setRowPending(address.id);
    setError(null);
    setNotice(null);
    try {
      await deleteAddress(address.id);
      if (editing?.id === address.id) setEditing(null);
      setNotice("Dirección eliminada.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo eliminar la dirección.",
      );
    } finally {
      setRowPending(null);
    }
  };

  const onSetDefault = async (address: Address) => {
    setRowPending(address.id);
    setError(null);
    setNotice(null);
    try {
      await setDefaultAddress(address.id);
      setNotice("Dirección principal actualizada.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo marcar la dirección.",
      );
    } finally {
      setRowPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="addresses-title">
        <h2
          id="addresses-title"
          className="font-heading text-lg font-semibold text-carbon"
        >
          Tus direcciones
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La principal se usa por defecto en el envío. Puedes tener varias.
        </p>

        {addresses.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Todavía no tienes direcciones. Agrega la primera aquí abajo.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {addresses.map((address) => (
              <li
                key={address.id}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4",
                  address.isDefault ? "border-carbon" : "border-border",
                )}
              >
                <div className="flex gap-3">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-deep"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-carbon">
                      {address.address}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[address.city, address.department]
                        .filter(Boolean)
                        .join(", ") || "Sin ciudad"}
                      {address.reference ? ` · ${address.reference}` : ""}
                    </p>
                    {address.isDefault ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-terracotta-deep uppercase">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Principal
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {!address.isDefault ? (
                    <button
                      type="button"
                      onClick={() => onSetDefault(address)}
                      disabled={rowPending === address.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-carbon transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Star className="h-3.5 w-3.5" aria-hidden="true" />
                      Hacer principal
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setEditing(address);
                      setNotice(null);
                      setError(null);
                    }}
                    aria-label={`Editar ${address.address}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-carbon transition-colors hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(address)}
                    disabled={rowPending === address.id}
                    aria-label={`Eliminar ${address.address}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-terracotta-deep transition-colors hover:bg-terracotta/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border bg-card p-6"
        noValidate
        key={editing?.id ?? "nueva"}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-carbon">
              {editing ? "Editar dirección" : "Agregar dirección"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFirst
                ? "Tu primera dirección quedará como principal."
                : "Completa los datos de entrega."}
            </p>
          </div>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-carbon"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancelar
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field id="addr-address" label="Dirección" className="sm:col-span-2">
            <input
              id="addr-address"
              name="address"
              type="text"
              required
              defaultValue={editing?.address ?? ""}
              className={inputClass}
              placeholder="Calle 00 #00-00, barrio"
            />
          </Field>

          <Field id="addr-city" label="Ciudad">
            <input
              id="addr-city"
              name="city"
              type="text"
              defaultValue={editing?.city ?? ""}
              className={inputClass}
              placeholder="Medellín"
            />
          </Field>

          <Field id="addr-department" label="Departamento">
            <input
              id="addr-department"
              name="department"
              type="text"
              defaultValue={editing?.department ?? ""}
              className={inputClass}
              placeholder="Antioquia"
            />
          </Field>

          <Field id="addr-reference" label="Referencia" className="sm:col-span-2">
            <input
              id="addr-reference"
              name="reference"
              type="text"
              defaultValue={editing?.reference ?? ""}
              className={inputClass}
              placeholder="Torre, apartamento, «portón azul»…"
            />
          </Field>
        </div>

        <label className="mt-5 flex w-fit cursor-pointer items-center gap-2 text-sm text-carbon">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={editing ? editing.isDefault : isFirst}
            className="h-4 w-4 rounded border-border accent-[#A94200]"
          />
          Usar como dirección principal
        </label>

        <div className="mt-6 flex flex-col gap-3">
          {error ? <FormMessage kind="error">{error}</FormMessage> : null}
          {notice && !error ? (
            <FormMessage kind="success">{notice}</FormMessage>
          ) : null}

          <SubmitButton pending={pending} className="w-full sm:w-auto">
            {editing ? "Guardar cambios" : "Agregar dirección"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
