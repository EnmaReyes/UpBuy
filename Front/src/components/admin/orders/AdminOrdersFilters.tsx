import { Search } from "lucide-react";
import {
  FULFILLMENT_LABELS,
  PAYMENT_STATE_LABELS,
} from "@/types/order";
import {
  ADMIN_CHANNEL_LABELS,
  ADMIN_PAYMENT_METHOD_CODE_LABELS,
  ADMIN_PROVIDER_LABELS,
  type AdminOrderFilters,
} from "@/types/admin";

// Filtros del listado de pedidos.
//
// Es un formulario GET nativo: el navegador arma la URL con los filtros, así
// que son compartibles y sobreviven a una recarga sin JavaScript. El botón
// «Limpiar» es un enlace al listado sin query.

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

export function AdminOrdersFilters({ filters }: { filters: AdminOrderFilters }) {
  return (
    <form
      method="get"
      action="/admin/pedidos"
      className="rounded-xl border border-border bg-card p-4"
      aria-label="Filtros de pedidos"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="orders-q" className={labelClass}>
            Buscar
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="orders-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Número, correo, teléfono o destinatario"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-status" className={labelClass}>
            Cumplimiento
          </label>
          <select
            id="orders-status"
            name="status"
            defaultValue={filters.status}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {Object.entries(FULFILLMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-payment" className={labelClass}>
            Estado de pago
          </label>
          <select
            id="orders-payment"
            name="paymentStatus"
            defaultValue={filters.paymentStatus}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {Object.entries(PAYMENT_STATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-channel" className={labelClass}>
            Canal
          </label>
          <select
            id="orders-channel"
            name="channel"
            defaultValue={filters.channel}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {Object.entries(ADMIN_CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-method" className={labelClass}>
            Método de pago
          </label>
          <select
            id="orders-method"
            name="paymentMethodCode"
            defaultValue={filters.paymentMethodCode}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {Object.entries(ADMIN_PAYMENT_METHOD_CODE_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-provider" className={labelClass}>
            Proveedor
          </label>
          <select
            id="orders-provider"
            name="provider"
            defaultValue={filters.provider}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {Object.entries(ADMIN_PROVIDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-from" className={labelClass}>
            Desde
          </label>
          <input
            id="orders-from"
            name="from"
            type="date"
            defaultValue={filters.from}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orders-to" className={labelClass}>
            Hasta
          </label>
          <input
            id="orders-to"
            name="to"
            type="date"
            defaultValue={filters.to}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Aplicar filtros
        </button>
        <a
          href="/admin/pedidos"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Limpiar
        </a>
      </div>
    </form>
  );
}
