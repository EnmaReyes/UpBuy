"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { ApiError } from "@/services/api/client";
import type { CatalogSupplierSlug } from "@/services/admin/providers";
import { updateSupplierCatalogSettings } from "@/services/admin/catalog.actions";
import type { AdminCategory, AdminPublishPolicy } from "@/types/admin";

// Politica de publicacion por proveedor. Define que pasa con lo que la
// sincronizacion trae: no publicar (`manual`), publicar en borrador
// (`auto_draft`) o publicar y activar en la tienda (`auto_visible`).
//
// La politica se aplica a los productos NUEVOS en la proxima sincronizacion.
// Lo que ya esta pendiente en la bandeja no se toca: eso se decide ahi.

const POLICIES: {
  value: AdminPublishPolicy;
  title: string;
  description: string;
}[] = [
  {
    value: "manual",
    title: "Manual",
    description:
      "Solo importa. Nada se publica hasta que lo elijas desde la bandeja Sin publicar.",
  },
  {
    value: "auto_draft",
    title: "Automática en borrador",
    description:
      "Cada producto nuevo se publica en borrador para que revises ficha, precio y categoría antes de hacerlo visible.",
  },
  {
    value: "auto_visible",
    title: "Automática y visible",
    description:
      "Cada producto nuevo con stock se publica y activa en la tienda al sincronizar, sin revisión previa.",
  },
];

/** Categoria que se asigna cuando el producto del proveedor no trae una. */
export function CatalogSupplierPolicyPanel({
  slug,
  providerName,
  policy: initialPolicy,
  defaultCategoryId: initialCategoryId,
  categories,
  canEdit,
}: {
  slug: CatalogSupplierSlug;
  providerName: string;
  policy: AdminPublishPolicy;
  defaultCategoryId: string | null;
  categories: AdminCategory[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const groupId = useId();
  const categoryId = useId();
  const hintId = useId();
  const errorId = useId();

  const [policy, setPolicy] = useState<AdminPublishPolicy>(initialPolicy);
  const [category, setCategory] = useState(initialCategoryId ?? "");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    policy !== initialPolicy || category !== (initialCategoryId ?? "");

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !dirty) return;

    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await updateSupplierCatalogSettings(slug, {
        publishPolicy: policy,
        defaultCategoryId: category || null,
      });
      setPolicy(result.publishPolicy);
      setCategory(result.defaultCategoryId ?? "");
      setNotice(
        "Política guardada. Se aplicará a los productos nuevos desde la próxima sincronización.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo guardar la política de publicación.",
      );
    } finally {
      setPending(false);
    }
  };

  const selected = POLICIES.find((entry) => entry.value === policy) ?? POLICIES[0];

  return (
    <section
      aria-labelledby={`${groupId}-title`}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2
              id={`${groupId}-title`}
              className="font-heading text-base font-semibold text-carbon"
            >
              Política de publicación
            </h2>
            <p className="mt-0.5 text-sm text-coffee-deep">
              Decide qué pasa con los productos nuevos que trae {providerName} al
              sincronizar.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="mt-4 flex flex-col gap-4">
        <fieldset
          disabled={!canEdit || pending}
          aria-describedby={error ? errorId : undefined}
        >
          <legend className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
            Política
          </legend>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            {POLICIES.map((entry) => {
              const id = `${groupId}-${entry.value}`;
              const active = policy === entry.value;
              return (
                <label
                  key={entry.value}
                  htmlFor={id}
                  className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${
                    active
                      ? "border-terracotta bg-terracotta/5"
                      : "border-border bg-background hover:border-carbon/40"
                  } ${pending || !canEdit ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <input
                    id={id}
                    type="radio"
                    name="publishPolicy"
                    value={entry.value}
                    checked={active}
                    onChange={() => {
                      setPolicy(entry.value);
                      setNotice(null);
                      setError(null);
                    }}
                    className="mt-1 h-4 w-4 shrink-0 accent-terracotta"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-carbon">
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-coffee-deep">
                      {entry.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="max-w-md">
          <label
            htmlFor={categoryId}
            className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase"
          >
            Categoría por defecto
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setNotice(null);
              setError(null);
            }}
            disabled={!canEdit || pending}
            aria-describedby={hintId}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-70"
          >
            <option value="">Sin categoría · usar «Sin clasificar»</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.isActive ? "" : " (inactiva)"}
              </option>
            ))}
          </select>
          <p id={hintId} className="mt-1 text-xs text-coffee-deep">
            Se asigna cuando el producto del proveedor no trae categoría propia.
          </p>
        </div>

        {policy === "auto_visible" ? (
          <p
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
            role="note"
          >
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Con esta política, lo nuevo aparece en la tienda sin que lo
              revises. Un producto sin stock del proveedor no se publica y queda
              pendiente en la bandeja. El precio de venta sigue bajo tu control.
            </span>
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-coffee-deep">
            Política efectiva: <strong>{selected.title}</strong>. Se aplica a los
            productos nuevos desde la próxima sincronización; lo que ya está en
            la bandeja se publica manualmente.
          </p>
        )}

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm leading-relaxed text-terracotta-deep"
          >
            <CircleAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!canEdit || !dirty || pending}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {pending ? "Guardando…" : "Guardar política"}
          </button>
          {dirty && !pending ? (
            <button
              type="button"
              onClick={() => {
                setPolicy(initialPolicy);
                setCategory(initialCategoryId ?? "");
                setNotice(null);
                setError(null);
              }}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Descartar cambios
            </button>
          ) : null}
          {!canEdit ? (
            <p className="text-xs text-coffee-deep">
              Tu rol puede ver la configuración, pero no cambiarla.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
