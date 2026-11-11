"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { createOrder } from "@/services/orders";
import { ApiError } from "@/services/api/client";
import { formatPrice } from "@/lib/format";
import type { Address, Profile } from "@/types/auth";
import { Field, FormMessage, SubmitButton } from "@/components/auth/fields";
import { cn } from "@/lib/utils";

// Checkout: arma el pedido y lo envía al backend, que valida precio, stock,
// perfil y dirección. El front nunca calcula el total final.
export function CheckoutClient({
  profile,
  addresses,
}: {
  profile: Profile;
  addresses: Address[];
}) {
  const router = useRouter();
  const { items, hydrated, subtotal, clear } = useCart();

  const defaultId =
    addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id ?? null;
  const [addressId, setAddressId] = useState<string | null>(defaultId);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"wompi" | "cod_vendelo">(
    "wompi",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const address = addresses.find((item) => item.id === addressId);
    if (!address) {
      setError("Selecciona una dirección de envío.");
      return;
    }

    if (items.length === 0) {
      setError("Tu carrito está vacío.");
      return;
    }

    setPending(true);
    try {
      const order = await createOrder({
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          size: item.size,
        })),
        shipping: {
          recipientName:
            [profile.name, profile.lastName].filter(Boolean).join(" ") ||
            profile.username ||
            "",
          email: profile.email,
          phone: profile.phone ?? "",
          address: address.address,
          city: address.city ?? "",
          department: address.department ?? "",
          reference: address.reference,
        },
        notes: notes.trim() || undefined,
        paymentMethodCode: paymentMethod,
      });

      clear();
      router.replace(
        `/pedido/${order.id}?metodo=${encodeURIComponent(paymentMethod)}`,
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "PROFILE_INCOMPLETE") {
        setError(
          "Completa tu perfil (nombre, apellido, teléfono y dirección) antes de comprar.",
        );
      } else {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "No se pudo crear el pedido. Inténtalo de nuevo.",
        );
      }
      setPending(false);
    }
  };

  if (!hydrated) {
    return (
      <div
        aria-hidden="true"
        className="mt-10 h-40 animate-pulse rounded-xl border border-border bg-card"
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <ShoppingBag className="h-10 w-10 text-coffee-deep" aria-hidden="true" />
        <h2 className="font-heading text-xl font-semibold text-carbon">
          No hay nada que comprar
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu carrito está vacío. Añade una pieza antes de finalizar la compra.
        </p>
        <Link
          href="/productos"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        >
          Ver la colección
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="flex flex-col gap-6 lg:col-span-7">
        <section aria-labelledby="checkout-address" className="rounded-xl border border-border bg-card p-6">
          <h2
            id="checkout-address"
            className="font-heading text-lg font-semibold text-carbon"
          >
            Dirección de envío
          </h2>

          <div className="mt-4 grid gap-2">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                  addressId === address.id
                    ? "border-carbon bg-muted/40"
                    : "border-border hover:border-coffee/40",
                )}
              >
                <input
                  type="radio"
                  name="addressId"
                  value={address.id}
                  checked={addressId === address.id}
                  onChange={() => setAddressId(address.id)}
                  className="mt-1 h-4 w-4 accent-[#0B0B0B]"
                />
                <span className="flex gap-2">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-deep"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-sm font-medium text-carbon">
                      {address.address}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[address.city, address.department].filter(Boolean).join(", ") ||
                        "Sin ciudad"}
                      {address.reference ? ` · ${address.reference}` : ""}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>

          <Link
            href="/cuenta/direcciones"
            className="mt-4 inline-flex text-xs font-semibold text-carbon underline underline-offset-4 hover:text-terracotta-deep"
          >
            Gestionar direcciones
          </Link>
        </section>

        <section aria-labelledby="checkout-notes" className="rounded-xl border border-border bg-card p-6">
          <h2
            id="checkout-notes"
            className="font-heading text-lg font-semibold text-carbon"
          >
            Notas del pedido
          </h2>
          <Field
            id="checkout-notes-input"
            label="Instrucciones (opcional)"
            className="mt-4"
          >
            <textarea
              id="checkout-notes-input"
              name="notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-carbon placeholder:text-muted-foreground focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="Indicaciones para la entrega"
            />
          </Field>
        </section>

        <section
          aria-labelledby="checkout-payment"
          className="rounded-xl border border-border bg-card p-6"
        >
          <h2
            id="checkout-payment"
            className="font-heading text-lg font-semibold text-carbon"
          >
            Método de pago
          </h2>

          <div className="mt-4 grid gap-2">
            <PaymentOption
              value="wompi"
              checked={paymentMethod === "wompi"}
              onChange={() => setPaymentMethod("wompi")}
              title="Pago en línea"
              description="Tarjeta, PSE o Nequi con Wompi. Se confirma al instante."
            />
            <PaymentOption
              value="cod_vendelo"
              checked={paymentMethod === "cod_vendelo"}
              onChange={() => setPaymentMethod("cod_vendelo")}
              title="Contra entrega"
              description="Pagas en efectivo cuando recibes el pedido."
            />
          </div>
        </section>
      </div>

      <aside className="lg:col-span-5">
        <div className="rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Tu pedido
          </h2>

          <ul className="mt-4 grid gap-3">
            {items.map((item) => (
              <li
                key={`${item.productId}-${item.size ?? ""}`}
                className="flex min-w-0 items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-carbon">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.size ? `Talla ${item.size} · ` : ""}
                    {item.quantity} × {formatPrice(item.price)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 grid gap-2 border-t border-border pt-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-semibold text-carbon [font-variant-numeric:tabular-nums]">
                {formatPrice(subtotal)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Envío</dt>
              <dd className="font-semibold text-terracotta-deep">
                Gratis
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="font-heading text-base font-semibold text-carbon">
              Total estimado
            </span>
            <span className="font-heading text-lg font-bold text-carbon [font-variant-numeric:tabular-nums]">
              {formatPrice(subtotal)}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {error ? <FormMessage kind="error">{error}</FormMessage> : null}

            <SubmitButton pending={pending} className="w-full">
              Confirmar pedido
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </SubmitButton>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Al confirmar se crea el pedido. El pago se completa en el siguiente
            paso.
          </p>
        </div>
      </aside>
    </form>
  );
}

function PaymentOption({
  value,
  checked,
  onChange,
  title,
  description,
}: {
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        checked ? "border-carbon bg-muted/40" : "border-border hover:border-coffee/40",
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-[#0B0B0B]"
      />
      <span>
        <span className="block text-sm font-medium text-carbon">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}