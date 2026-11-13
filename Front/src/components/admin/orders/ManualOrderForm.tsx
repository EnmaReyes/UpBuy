"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Plus, Search, Trash2 } from "lucide-react";
import {
  createManualOrder,
  previewManualOrder,
  searchAdminCatalog,
} from "@/services/admin/orders.actions";
import { ApiError } from "@/services/api/client";
import { formatPrice } from "@/lib/format";
import {
  ADMIN_MANUAL_PAYMENT_LABELS,
  type AdminCatalogProduct,
  type AdminOrderPreview,
} from "@/types/admin";
import { useAdminAction } from "./useAdminAction";

// Venta manual (ADM-3).
//
// El precio SIEMPRE lo calcula el backend: el formulario pide el total al
// servidor (`/api/admin/orders/manual/preview`) y ese es el número que se
// muestra y el que se cobra. Nunca se multiplica en el navegador.

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const labelClass =
  "block text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

type Line = {
  key: string;
  product: AdminCatalogProduct;
  size: string;
  quantity: number;
};

const PAYMENT_STATUS_OPTIONS = [
  { value: "aprobado", label: "Pagada (dinero recibido)" },
  { value: "pendiente", label: "Pendiente de pago" },
];

export function ManualOrderForm({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const { busy, error: actionError, run } = useAdminAction();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminCatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [department, setDepartment] = useState("");
  const [deliveryType, setDeliveryType] = useState<"envio" | "pickup">("envio");
  const [discount, setDiscount] = useState("0");
  const [channel, setChannel] = useState("presencial");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [paymentStatus, setPaymentStatus] = useState("aprobado");
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<AdminOrderPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const keyCounter = useRef(0);
  const nextKey = () => {
    keyCounter.current += 1;
    return `linea-${keyCounter.current}`;
  };

  // Busqueda de catalogo (con sesion del administrador).
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const data = await searchAdminCatalog(term);
        if (!cancelado) setResults(data.products ?? []);
      } catch (caught) {
        if (!cancelado) {
          setResults([]);
          setSearchError(
            caught instanceof ApiError
              ? caught.message
              : "No se pudo buscar en el catálogo.",
          );
        }
      } finally {
        if (!cancelado) setSearching(false);
      }
    }, 350);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [query]);

  const items = useMemo(
    () =>
      lines.map((line) => ({
        productId: line.product.id,
        size: line.size || null,
        quantity: line.quantity,
      })),
    [lines],
  );

  // El total lo pide el backend. Se recalcula cuando cambian los items, el
  // descuento o el tipo de entrega.
  useEffect(() => {
    if (items.length === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const data = await previewManualOrder({
          items,
          discount: Number(discount) || 0,
          deliveryType,
        });
        if (!cancelado) {
          setPreview(data);
          setPreviewError(null);
        }
      } catch (caught) {
        if (!cancelado) {
          setPreview(null);
          setPreviewError(
            caught instanceof ApiError
              ? caught.message
              : "No se pudo calcular el total.",
          );
        }
      }
    }, 350);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [items, discount, deliveryType]);

  const addProduct = (product: AdminCatalogProduct) => {
    const size = product.sizes?.[0] ?? "";
    setLines((prev) => [
      ...prev,
      { key: nextKey(), product, size, quantity: 1 },
    ]);
    setQuery("");
    setResults([]);
  };

  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const submit = async () => {
    setFormError(null);

    if (lines.length === 0) {
      setFormError("Agrega al menos un producto.");
      return;
    }
    if (!recipientName.trim()) {
      setFormError("Escribe el nombre del comprador.");
      return;
    }
    if (!phone.trim()) {
      setFormError("Escribe el teléfono del comprador.");
      return;
    }
    if (deliveryType === "envio") {
      if (!address.trim() || !city.trim() || !department.trim()) {
        setFormError("Completa la dirección, la ciudad y el departamento.");
        return;
      }
    }

    await run(async () => {
      const order = await createManualOrder({
        items,
        shipping: {
          recipientName: recipientName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: deliveryType === "envio" ? address.trim() : null,
          city: deliveryType === "envio" ? city.trim() : null,
          department: deliveryType === "envio" ? department.trim() : null,
        },
        notes: notes.trim() || null,
        channel,
        paymentMethod,
        paymentStatus,
        deliveryType,
        discount: Number(discount) || 0,
      });

      router.push(`/admin/pedidos/${order.id}`);
    }).catch(() => {});
  };

  const canSubmit = canWrite && lines.length > 0 && !busy;

  return (
    <div className="flex flex-col gap-6">
      {!canWrite ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-coffee-deep">
          Tu rol puede consultar los pedidos, pero no registrar ventas. Necesitas
          el permiso <span className="font-semibold">orders.write</span>.
        </p>
      ) : null}

      {/* ---------------- Productos ---------------- */}
      <section
        aria-label="Productos de la venta"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 className="font-heading text-base font-semibold text-carbon">
          Productos
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          El precio de cada producto sale del catálogo del servidor.
        </p>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar producto por nombre o SKU"
            aria-label="Buscar producto en el catálogo"
            className={`${fieldClass} pl-9`}
            disabled={!canWrite}
          />
        </div>

        {searching ? (
          <p className="mt-2 text-xs text-muted-foreground">Buscando…</p>
        ) : null}

        {searchError ? (
          <p role="alert" className="mt-2 text-xs text-terracotta-deep">
            {searchError}
          </p>
        ) : null}

        {results.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={!canWrite}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-carbon">
                      {product.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      SKU {product.sku}
                      {product.sizes?.length
                        ? ` · ${product.sizes.join(", ")}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                    {formatPrice(product.precio ?? product.price)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {lines.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {lines.map((line) => (
              <li
                key={line.key}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="font-medium text-carbon">{line.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU {line.product.sku}
                  </p>
                </div>

                {line.product.sizes?.length ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`size-${line.key}`} className={labelClass}>
                      Talla
                    </label>
                    <select
                      id={`size-${line.key}`}
                      value={line.size}
                      onChange={(event) =>
                        updateLine(line.key, { size: event.target.value })
                      }
                      className={`${fieldClass} w-28`}
                      disabled={!canWrite || busy}
                    >
                      {line.product.sizes.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`qty-${line.key}`} className={labelClass}>
                    Cantidad
                  </label>
                  <input
                    id={`qty-${line.key}`}
                    type="number"
                    min={1}
                    max={20}
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.key, {
                        quantity: Math.max(
                          1,
                          Math.min(20, Number(event.target.value) || 1),
                        ),
                      })
                    }
                    className={`${fieldClass} w-24`}
                    disabled={!canWrite || busy}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Quitar ${line.product.name} de la venta`}
                  disabled={!canWrite || busy}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-terracotta hover:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no agregaste productos.
          </p>
        )}
      </section>

      {/* ---------------- Comprador y envío ---------------- */}
      <section
        aria-label="Datos del comprador"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 className="font-heading text-base font-semibold text-carbon">
          Comprador y envío
        </h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-name" className={labelClass}>
              Nombre
            </label>
            <input
              id="manual-name"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-phone" className={labelClass}>
              Teléfono
            </label>
            <input
              id="manual-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              className={fieldClass}
              disabled={!canWrite || busy}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-email" className={labelClass}>
              Correo (opcional)
            </label>
            <input
              id="manual-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-delivery" className={labelClass}>
              Entrega
            </label>
            <select
              id="manual-delivery"
              value={deliveryType}
              onChange={(event) =>
                setDeliveryType(event.target.value as "envio" | "pickup")
              }
              className={fieldClass}
              disabled={!canWrite || busy}
            >
              <option value="envio">Envío a domicilio</option>
              <option value="pickup">Entrega en mano</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="manual-address" className={labelClass}>
              Dirección
            </label>
            <input
              id="manual-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy || deliveryType === "pickup"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-city" className={labelClass}>
              Ciudad
            </label>
            <input
              id="manual-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy || deliveryType === "pickup"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-department" className={labelClass}>
              Departamento
            </label>
            <input
              id="manual-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy || deliveryType === "pickup"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-channel" className={labelClass}>
              Canal
            </label>
            <select
              id="manual-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy}
            >
              <option value="presencial">Presencial</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-method" className={labelClass}>
              Método de pago
            </label>
            <select
              id="manual-method"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy}
            >
              {Object.entries(ADMIN_MANUAL_PAYMENT_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-payment-status" className={labelClass}>
              Estado del pago
            </label>
            <select
              id="manual-payment-status"
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy}
            >
              {PAYMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-discount" className={labelClass}>
              Descuento (pesos)
            </label>
            <input
              id="manual-discount"
              type="number"
              min={0}
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className={fieldClass}
              disabled={!canWrite || busy}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-3">
            <label htmlFor="manual-notes" className={labelClass}>
              Notas (opcional)
            </label>
            <textarea
              id="manual-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              disabled={!canWrite || busy}
            />
          </div>
        </div>
      </section>

      {/* ---------------- Total ---------------- */}
      <section
        aria-label="Total de la venta"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 className="font-heading text-base font-semibold text-carbon">
          Total
        </h2>

        {previewError ? (
          <p
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {previewError}
          </p>
        ) : null}

        {preview ? (
          <dl className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium text-carbon [font-variant-numeric:tabular-nums]">
                {formatPrice(preview.subtotal)}
              </dd>
            </div>
            {preview.discountTotal > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Descuentos</dt>
                <dd className="font-medium text-carbon [font-variant-numeric:tabular-nums]">
                  −{formatPrice(preview.discountTotal)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <dt className="font-semibold text-carbon">Total</dt>
              <dd className="font-heading text-xl font-bold text-carbon [font-variant-numeric:tabular-nums]">
                {formatPrice(preview.total)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Agrega productos para ver el total.
          </p>
        )}

        {formError ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        ) : null}

        {actionError ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {actionError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {busy ? "Registrando…" : "Registrar venta"}
        </button>
      </section>
    </div>
  );
}
