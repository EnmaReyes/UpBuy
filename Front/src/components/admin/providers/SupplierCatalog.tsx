"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, Loader2, PackageSearch } from "lucide-react";
import { ApiError } from "@/services/api/client";
import type { CatalogSupplierSlug } from "@/services/admin/providers";
import {
  publishCatalogSupplierProduct,
  unpublishCatalogSupplierProduct,
} from "@/services/admin/providers.actions";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { AdminSupplierCatalogProduct } from "@/types/admin";

// Catálogo de un proveedor (ADM-4): publicar y archivar en el catálogo de
// UPBUY. Archivar lo saca de la tienda pública; el original se conserva.
// Compartido por Venndelo y MasterShop.

function priceOf(value: string | number | null | undefined): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function SupplierCatalog({
  slug,
  providerName,
  products,
}: {
  slug: CatalogSupplierSlug;
  providerName: string;
  products: AdminSupplierCatalogProduct[];
}) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-14 text-center">
        <PackageSearch
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="font-heading text-lg font-semibold text-carbon">
          No hay productos importados
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Sincroniza el catálogo para traer productos de {providerName}. Después
          podrás publicarlos en borrador desde la bandeja y darles visibilidad
          en el catálogo UPBUY.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Producto
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Stock
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Precio proveedor
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Precio de venta
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Estado
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((product) => (
              <ProductRow key={product.id} slug={slug} product={product} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard slug={slug} product={product} />
          </li>
        ))}
      </ul>
    </>
  );
}

function ProductRow({
  slug,
  product,
}: {
  slug: CatalogSupplierSlug;
  product: AdminSupplierCatalogProduct;
}) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium text-carbon">{product.name}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {product.externalId}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Sincronizado{" "}
          {product.lastSyncedAt ? formatDateTime(product.lastSyncedAt) : "—"}
        </p>
      </td>
      <td className="px-4 py-3 [font-variant-numeric:tabular-nums]">
        <p className="font-semibold text-carbon">{product.totalQuantity}</p>
        <p
          className={
            product.availability
              ? "text-xs text-emerald-800"
              : "text-xs text-rose-800"
          }
        >
          {product.availability ? "Disponible" : "Sin stock"}
        </p>
      </td>
      <td className="px-4 py-3 text-coffee-deep [font-variant-numeric:tabular-nums]">
        {formatPrice(priceOf(product.originalPrice))}
      </td>
      <td className="px-4 py-3 [font-variant-numeric:tabular-nums]">
        {product.published ? (
          <>
            <p className="font-semibold text-carbon">
              {formatPrice(priceOf(product.published.price))}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {publishedLabel(product.published)}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <PublishedBadge published={product.published} />
      </td>
      <td className="px-4 py-3 text-right">
        <PublishButton slug={slug} product={product} />
      </td>
    </tr>
  );
}

function ProductCard({
  slug,
  product,
}: {
  slug: CatalogSupplierSlug;
  product: AdminSupplierCatalogProduct;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-carbon">{product.name}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {product.externalId}
          </p>
        </div>
        <PublishedBadge published={product.published} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Stock</dt>
          <dd className="font-semibold text-carbon">{product.totalQuantity}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Proveedor</dt>
          <dd className="font-semibold text-carbon">
            {formatPrice(priceOf(product.originalPrice))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Venta</dt>
          <dd className="font-semibold text-carbon">
            {product.published
              ? formatPrice(priceOf(product.published.price))
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <PublishButton slug={slug} product={product} full />
      </div>
    </article>
  );
}

function PublishedBadge({
  published,
}: {
  published: AdminSupplierCatalogProduct["published"];
}) {
  const label = publishedLabel(published);
  const tone =
    published?.status === "draft"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : published?.active
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-border bg-muted text-coffee-deep";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

// La publicacion desde el panel deja el producto en borrador. «Archivado» es
// el resultado de despublicar: se conserva para no perder historial.
function publishedLabel(
  published: AdminSupplierCatalogProduct["published"],
): string {
  if (!published) return "No publicado";
  if (published.status === "draft") return "Borrador";
  if (published.status === "archived") return "Archivado";
  return published.active ? "Visible" : "Oculto";
}

function PublishButton({
  slug,
  product,
  full,
}: {
  slug: CatalogSupplierSlug;
  product: AdminSupplierCatalogProduct;
  full?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (product.published) {
        await unpublishCatalogSupplierProduct(slug, product.id);
      } else {
        await publishCatalogSupplierProduct(slug, product.id);
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo cambiar la publicación.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        full ? "flex flex-col gap-1" : "flex flex-col items-end gap-1"
      }
    >
      <button
        type="button"
        onClick={toggle}
        disabled={busy || !product.availability}
        title={
          !product.availability ? "Sin stock: no se puede publicar" : undefined
        }
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : product.published ? (
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {busy ? "Guardando…" : product.published ? "Archivar" : "Publicar"}
      </button>
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1 text-[11px] leading-snug text-terracotta-deep"
        >
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
