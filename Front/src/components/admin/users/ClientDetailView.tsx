"use client";

import { useCallback, useState } from "react";
import { Check, Loader2, Save, ShieldOff } from "lucide-react";
import HoldButton from "@/components/kokonutui/hold-button";
import InlineAlert, { type InlineAlertTone } from "@/components/kokonutui/inline-alert";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { useAdminAction } from "@/components/admin/orders/useAdminAction";
import { updateAdminClient } from "@/services/admin/users.actions";
import { ApiError } from "@/services/api/client";
import type { AdminClientDetail } from "@/types/admin";

// Detalle y edición de un cliente (ADM-9). Editable: nombre, apellido,
// teléfono, dirección y consentimientos de difusión. Desactivar cuenta es
// destructivo: Hold Button + step-up (el backend revoca sesiones). El rol,
// el correo y la contraseña NO se editan desde el panel.

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon placeholder:text-coffee focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

const MISSING_LABELS: Record<string, string> = {
  name: "nombre",
  lastName: "apellido",
  phone: "teléfono",
  address: "dirección",
};

export function ClientDetailView({ detail }: { detail: AdminClientDetail }) {
  const user = detail.user;
  const [name, setName] = useState(user.name ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(user.marketingOptIn);
  const [whatsappOptIn, setWhatsappOptIn] = useState(user.whatsappOptIn);
  const [disabled, setDisabled] = useState(user.disabled);
  const [saved, setSaved] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const action = useAdminAction();

  const dirty =
    name !== (user.name ?? "") ||
    lastName !== (user.lastName ?? "") ||
    phone !== (user.phone ?? "") ||
    address !== (user.address ?? "") ||
    marketingOptIn !== user.marketingOptIn ||
    whatsappOptIn !== user.whatsappOptIn;

  const save = useCallback(async () => {
    setPageError(null);
    try {
      const result = await updateAdminClient(user.id, {
        name,
        lastName,
        phone,
        address,
        marketingOptIn,
        whatsappOptIn,
      });
      setDisabled(result.user.disabled);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setPageError(
        error instanceof ApiError ? error.message : "No se pudo guardar.",
      );
      throw error;
    }
  }, [address, lastName, marketingOptIn, name, phone, user.id, whatsappOptIn]);

  const doSave = useCallback(() => {
    action
      .run(save)
      .catch(() => {
        // El mensaje queda en action.error / pageError.
      });
  }, [action, save]);

  const doDisable = useCallback(async () => {
    setPageError(null);
    const next = !disabled;
    try {
      const result = await updateAdminClient(user.id, { disabled: next });
      setDisabled(result.user.disabled);
    } catch (error) {
      setPageError(
        error instanceof ApiError ? error.message : "No se pudo cambiar el estado.",
      );
      throw error;
    }
  }, [disabled, user.id]);

  const disableNow = useCallback(() => {
    action
      .run(doDisable)
      .catch(() => {
        // El mensaje queda en action.error / pageError.
      });
  }, [action, doDisable]);

  return (
    <div className="flex flex-col gap-6">
      {pageError ? (
        <InlineAlert message={pageError} title="No se pudo completar la acción" tone="danger" />
      ) : null}

      {/* Resumen */}
      <section aria-label="Resumen del cliente" className="rounded-xl border border-border bg-card p-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={LABEL_CLASS}>Pedidos</dt>
            <dd className="mt-1 text-sm font-semibold text-carbon tabular-nums">
              {detail.summary.ordersCount}
            </dd>
          </div>
          <div>
            <dt className={LABEL_CLASS}>Gasto total</dt>
            <dd className="mt-1 text-sm font-semibold text-carbon tabular-nums">
              {new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(detail.summary.totalSpent)}
            </dd>
          </div>
          <div>
            <dt className={LABEL_CLASS}>Último pedido</dt>
            <dd className="mt-1 text-sm font-medium text-carbon">
              {detail.summary.lastOrderAt
                ? new Date(detail.summary.lastOrderAt).toLocaleDateString("es-CO")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className={LABEL_CLASS}>Estado</dt>
            <dd className="mt-1 text-sm font-medium text-carbon">
              {disabled ? "Cuenta desactivada" : user.profileComplete ? "Perfil completo" : "Perfil incompleto"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Edición */}
      <section aria-label="Editar cliente" className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="client-name">
              Nombre
            </label>
            <input
              className={`${FIELD_CLASS} h-11`}
              id="client-name"
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="client-lastname">
              Apellido
            </label>
            <input
              className={`${FIELD_CLASS} h-11`}
              id="client-lastname"
              maxLength={150}
              onChange={(event) => setLastName(event.target.value)}
              value={lastName}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="client-phone">
              Teléfono (Colombia)
            </label>
            <input
              className={`${FIELD_CLASS} h-11`}
              id="client-phone"
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="3001234567"
              value={phone}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="client-address">
              Dirección principal
            </label>
            <input
              className={`${FIELD_CLASS} h-11`}
              id="client-address"
              maxLength={255}
              onChange={(event) => setAddress(event.target.value)}
              value={address}
            />
          </div>

          {/* Consentimientos */}
          <fieldset className="md:col-span-2">
            <legend className={LABEL_CLASS}>Consentimientos de difusión</legend>
            <div className="mt-2 flex flex-wrap gap-6">
              <label className="flex min-h-11 items-center gap-2 text-sm text-carbon">
                <input
                  checked={marketingOptIn}
                  className="size-4 accent-[#D35400]"
                  onChange={(event) => setMarketingOptIn(event.target.checked)}
                  type="checkbox"
                />
                Email promocional
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-carbon">
                <input
                  checked={whatsappOptIn}
                  className="size-4 accent-[#D35400]"
                  onChange={(event) => setWhatsappOptIn(event.target.checked)}
                  type="checkbox"
                />
                WhatsApp promocional
              </label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Una baja formal del usuario (unsubscribedAt) manda sobre estos
              toggles: la difusión la respeta siempre.
            </p>
          </fieldset>

          {/* Solo lectura */}
          <div className="md:col-span-2 grid gap-2 rounded-lg bg-muted/40 p-3 text-xs text-coffee-deep sm:grid-cols-3">
            <span>Correo: <strong className="text-carbon">{user.email}</strong></span>
            <span>Rol: <strong className="text-carbon">{user.role}</strong></span>
            <span>
              Última sesión:{" "}
              <strong className="text-carbon">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-CO") : "—"}
              </strong>
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={!dirty || action.busy}
            onClick={doSave}
            type="button"
          >
            {action.busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-4" />
            )}
            Guardar cambios
          </button>
          {saved ? (
            <span aria-live="polite" className="inline-flex items-center gap-1 text-sm font-semibold text-[#2F5D0A]">
              <Check aria-hidden="true" className="size-4" />
              Cambios guardados
            </span>
          ) : null}
          {action.error ? (
            <span className="text-sm text-terracotta-deep">{action.error}</span>
          ) : null}
        </div>
      </section>

      {/* Cuenta */}
      <section aria-label="Estado de la cuenta" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-carbon">
              {disabled ? "Cuenta desactivada" : "Cuenta activa"}
            </p>
            <p className="text-[13px] text-coffee-deep">
              {disabled
                ? "La persona no puede iniciar sesión ni comprar. Reactivar la devuelve al acceso normal."
                : "Desactivar es irreversible para sus sesiones: se cierran todas al instante."}
            </p>
          </div>
          <HoldButton
            disabled={action.busy}
            holdingLabel="Mantén presionado…"
            onHoldComplete={disableNow}
          >
            <span className="inline-flex items-center gap-2">
              <ShieldOff aria-hidden="true" className="size-4" />
              {disabled ? "Reactivar cuenta" : "Desactivar cuenta"}
            </span>
          </HoldButton>
        </div>
        <StepUpDialog
          actionLabel="Verificar y continuar"
          description="Para cambiar el acceso de esta cuenta necesitas tu segundo factor."
          onOpenChange={action.setStepUpOpen}
          onVerified={() => action.retry()}
          open={action.stepUpOpen}
        />
      </section>

      {/* Direcciones */}
      <section aria-label="Direcciones" className="rounded-xl border border-border bg-card p-4">
        <p className="font-semibold text-sm text-carbon">
          Direcciones ({detail.addresses.length})
        </p>
        {detail.addresses.length === 0 ? (
          <p className="mt-2 text-sm text-coffee-deep">Sin direcciones guardadas.</p>
        ) : (
          <ul className="mt-2 grid gap-2" role="list">
            {detail.addresses.map((address) => (
              <li className="rounded-lg border border-border p-3 text-sm" key={address.id}>
                <p className="font-medium text-carbon">
                  {address.address}
                  {address.isDefault ? (
                    <span className="ml-2 rounded-full bg-[#DCF7C5] px-2 py-0.5 text-[11px] font-semibold text-[#2F5D0A]">
                      Principal
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[address.department, address.city].filter(Boolean).join(" · ") || "—"}
                  {address.reference ? ` · Ref: ${address.reference}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
