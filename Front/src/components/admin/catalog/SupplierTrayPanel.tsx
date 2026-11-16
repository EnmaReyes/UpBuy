"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  Inbox,
  Loader2,
  PackageSearch,
  Upload,
  X,
} from "lucide-react";
import EmptyState from "@/components/kokonutui/empty-state";
import InlineAlert from "@/components/kokonutui/inline-alert";
import { SafeImage } from "@/components/shared/SafeImage";
import { CatalogPager } from "@/components/admin/catalog/CatalogPager";
import { SupplierTrayFilters } from "@/components/admin/catalog/SupplierTrayFilters";
import { formatPrice } from "@/lib/format";
import { buildTrayHref } from "@/lib/catalog-links";
import { ApiError } from "@/services/api/client";
import { publishSupplierTrayProducts } from "@/services/admin/catalog.actions";
import type {
  AdminSupplierTrayFilters,
  AdminSupplierTrayItem,
} from "@/types/admin";

// Bandeja global: productos que ya estan en `supplier_products` (de cualquier
// proveedor conectado) pero aun no en el catalogo UPBUY. Publicar los promueve
// en borrador reutilizando el pipeline de cada proveedor.

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function SupplierTrayPanel({
  products,
  total,
  page,
  totalPages,
  filters,
  canPublish,
  loadError = null,
}: {
  products: AdminSupplierTrayItem[];
  total: number;
  page: number;
  totalPages: number;
  filters: AdminSupplierTrayFilters;
  canPublish: boolean;
  loadError?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected((current) => {
      const next = new Set(
        [...current].filter((id) => products.some((item) => item.id === id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [products]);

  const allSelected =
    products.length > 0 && products.every((product) => selected.has(product.id));

  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(products.map((product) => product.id)),
    );

  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const publish = async (items: AdminSupplierTrayItem[]) => {
    if (items.length === 0 || !canPublish) return;

    // La publicacion es por proveedor: se agrupan los ids por slug y se llama
    // al endpoint de cada uno.
    const groups = new Map<string, string[]>();
    for (const item of items) {
      const slug = item.supplier?.slug;
      if (!slug) continue;
      const ids = groups.get(slug) ?? [];
      ids.push(item.id);
      groups.set(slug, ids);
    }
    if (groups.size === 0) return;

    setPending(true);
    setNotice(null);
    setError(null);
    try {
      let requested = 0;
      let updated = 0;
      const skipped: { motivo: string }[] = [];

      for (const [slug, ids] of groups) {
        const result = await publishSupplierTrayProducts(slug, ids, {
          visibility: "draft",
        });
        requested += result.requested;
        updated += result.updated;
        skipped.push(...result.skipped);
      }

      const omitted = Math.max(requested - updated, 0);
      const reasons = skipped
        .slice(0, 2)
        .map((item) => item.motivo)
        .join(" · ");
      setNotice(
        omitted <= 0
          ? `${updated} producto(s) publicados en borrador. Revísalos en la pestaña Catálogo UPBUY.`
          : `${updated} de ${requested} publicados. ${omitted} se omitieron.${reasons ? ` Motivo: ${reasons}.` : ""}`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (caught) {
      setError(
        errorMessage(caught, "No se pudieron publicar los productos."),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SupplierTrayFilters filters={filters} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Productos sin publicar
          </h2>
          <p className="text-sm text-coffee-deep">
            {total} producto(s) importados de tus proveedores que aún no están
            en el catálogo UPBUY.
          </p>
        </div>
        {selected.size > 0 ? (
          <p className="text-xs font-semibold text-terracotta-deep">
            {selected.size} seleccionado(s)
          </p>
        ) : null}
      </div>

      <InlineAlert
        title="Publicación en borrador"
        message="Publicar aquí crea el producto en borrador (según la política de cada proveedor). No aparece en la tienda hasta que lo hagas visible en Catálogo UPBUY."
        tone="info"
      />

      {loadError ? (
        <InlineAlert
          title="No se pudo cargar la bandeja"
          message={loadError}
          tone="danger"
        />
      ) : null}

      <AnimatePresence initial={false}>
        {notice ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <InlineAlert
              title="Publicación completada"
              message={notice}
              tone="success"
              action={{ label: "Cerrar", onClick: () => setNotice(null) }}
            />
          </motion.div>
        ) : null}
        {error ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <InlineAlert
              title="No se pudo publicar"
              message={error}
              tone="danger"
              action={{ label: "Cerrar", onClick: () => setError(null) }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {products.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="La bandeja está al día"
          description="No quedan productos de tus proveedores sin publicar con estos filtros. La sincronización seguirá trayendo novedades."
          action={{
            label: "Limpiar filtros",
            onClick: () => {
              window.location.href = "/admin/catalogo?tab=bandeja";
            },
          }}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Seleccionar todos los productos de la bandeja"
                      className="h-4 w-4 accent-terracotta"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Producto del proveedor
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Proveedor
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Disponibilidad
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Costo
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Stock
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => (
                  <motion.tr
                    key={product.id}
                    animate={{ opacity: 1, y: 0 }}
                    initial={{ opacity: 0, y: 4 }}
                    transition={{
                      duration: 0.22,
                      delay: Math.min(index * 0.015, 0.18),
                      ease: EASE_OUT,
                    }}
                    className="border-t border-border align-middle transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggleOne(product.id)}
                        aria-label={`Seleccionar ${product.name}`}
                        className="h-4 w-4 accent-terracotta"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <SafeImage
                          src={product.assets?.[0]?.url}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                          fallback={
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-coffee-deep">
                              <PackageSearch aria-hidden="true" className="h-4 w-4" />
                            </span>
                          }
                        />
                        <div className="min-w-0">
                          <p className="max-w-[300px] truncate font-semibold text-carbon">
                            {product.name}
                          </p>
                          <p className="truncate text-[11px] text-coffee-deep">
                            ID {product.externalId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-coffee-deep">
                      {product.supplier?.name ?? "—"}
                      <p className="font-mono text-[11px]">
                        {product.supplier?.slug ?? ""}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {product.availability ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900">
                          <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                          Disponible
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                          Sin stock
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-carbon">
                      {product.originalPrice === null
                        ? "—"
                        : formatPrice(Number(product.originalPrice))}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-carbon">
                      {product.totalQuantity}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => publish([product])}
                        disabled={!canPublish || pending}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                      >
                        {pending ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        Publicar
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {products.map((product, index) => (
              <motion.li
                key={product.id}
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 4 }}
                transition={{
                  duration: 0.22,
                  delay: Math.min(index * 0.015, 0.18),
                  ease: EASE_OUT,
                }}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggleOne(product.id)}
                    aria-label={`Seleccionar ${product.name}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-terracotta"
                  />
                  <SafeImage
                    src={product.assets?.[0]?.url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
                    fallback={
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-coffee-deep">
                        <PackageSearch aria-hidden="true" className="h-5 w-5" />
                      </span>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-carbon">
                      {product.name}
                    </p>
                    <p className="truncate text-[11px] text-coffee-deep">
                      ID {product.externalId}
                    </p>
                    <p className="mt-1 text-[11px] text-coffee-deep">
                      {product.supplier?.name ?? "Proveedor"} ·{" "}
                      {product.availability ? "Disponible" : "Sin stock"} · Stock{" "}
                      {product.totalQuantity}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                  <p className="text-xs font-semibold text-carbon tabular-nums">
                    {product.originalPrice === null
                      ? "—"
                      : formatPrice(Number(product.originalPrice))}
                  </p>
                  <button
                    type="button"
                    onClick={() => publish([product])}
                    disabled={!canPublish || pending}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon disabled:opacity-50"
                  >
                    <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                    Publicar
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <CatalogPager
              page={page}
              totalPages={totalPages}
              previousHref={buildTrayHref(filters, page - 1)}
              nextHref={buildTrayHref(filters, page + 1)}
              label="Paginación de productos sin publicar"
            />
          </div>
        </>
      )}

      <AnimatePresence>
        {selected.size > 0 ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-3 z-20 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-carbon/10 bg-carbon p-3 text-cream shadow-xl"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <p className="text-sm font-semibold">
              {selected.size} seleccionado(s)
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-cream/80 hover:bg-cream/10 hover:text-cream focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Limpiar
              </button>
              <button
                type="button"
                onClick={() =>
                  publish(products.filter((item) => selected.has(item.id)))
                }
                disabled={!canPublish || pending}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-cream px-3 text-xs font-semibold text-carbon transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                Publicar seleccionados
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!canPublish ? (
        <InlineAlert
          title="Sin permiso para publicar"
          message="Tu rol puede consultar la bandeja, pero publicar exige el permiso de gestión de proveedores."
          tone="info"
        />
      ) : null}
    </div>
  );
}
