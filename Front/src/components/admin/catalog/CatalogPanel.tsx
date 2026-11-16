"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  Eye,
  EyeOff,
  Loader2,
  PackageSearch,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  X,
} from "lucide-react";
import EmptyState from "@/components/kokonutui/empty-state";
import InlineAlert from "@/components/kokonutui/inline-alert";
import { SafeImage } from "@/components/shared/SafeImage";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { CatalogFilters } from "@/components/admin/catalog/CatalogFilters";
import { CatalogPager } from "@/components/admin/catalog/CatalogPager";
import {
  FeaturedBadge,
  HomeSectionBadges,
  VisibilityBadge,
} from "@/components/admin/catalog/CatalogBadges";
import { ProductDrawer } from "@/components/admin/catalog/ProductDrawer";
import { formatPrice } from "@/lib/format";
import { buildCatalogHref } from "@/lib/catalog-links";
import { ApiError } from "@/services/api/client";
import {
  bulkAdminProducts,
} from "@/services/admin/catalog.actions";
import type {
  AdminCatalogFilters,
  AdminCategory,
  AdminHomeSections,
  AdminProduct,
  AdminProductBulkAction,
} from "@/types/admin";

// Catalogo UPBUY: listado con filtros, seleccion multiple, acciones en lote y
// ficha lateral de edicion. La API vuelve a validar permiso y step-up.

type BulkRequest = {
  ids: string[];
  action: AdminProductBulkAction;
  payload: Record<string, unknown>;
  label: string;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function isStepUp(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.code === "STEP_UP_REQUIRED"
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function bulkSummary(
  requested: number,
  updated: number,
  skipped: { id: string; motivo: string }[],
): string {
  const omitted = Math.max(requested - updated, 0);
  const reasons = skipped
    .slice(0, 2)
    .map((item) => item.motivo)
    .join(" · ");
  if (omitted <= 0) return `${updated} producto(s) actualizados.`;
  const suffix = reasons ? ` Motivo: ${reasons}.` : "";
  return `${updated} de ${requested} actualizados; ${omitted} se omitieron.${suffix}`;
}

export function CatalogPanel({
  products,
  total,
  page,
  totalPages,
  filters,
  categories,
  canWrite,
  homeSections = null,
}: {
  products: AdminProduct[];
  total: number;
  page: number;
  totalPages: number;
  filters: AdminCatalogFilters;
  categories: AdminCategory[];
  canWrite: boolean;
  /** Curaduría de la portada, para marcar en qué secciones está cada producto. */
  homeSections?: AdminHomeSections | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, AdminProduct>>({});
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingBulk, setPendingBulk] = useState<BulkRequest | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [markup, setMarkup] = useState("30");
  const [categoryId, setCategoryId] = useState("");
  const [categoryMode, setCategoryMode] = useState<"replace" | "add">("replace");
  const router = useRouter();

  const items = useMemo(
    () => products.map((product) => overrides[product.id] ?? product),
    [products, overrides],
  );

  // Secciones de la portada por producto. Se calcula una vez por pagina para
  // no recorrer las tres listas en cada fila.
  const homePlacement = useMemo(() => {
    const placement = new Map<string, string[]>();
    if (!homeSections) return placement;
    const groups: [string, AdminHomeSections["featured"]][] = [
      ["Selección", homeSections.featured],
      ["Novedades", homeSections.newArrivals],
      ["Favoritos", homeSections.communityFavorites],
    ];
    for (const [label, slots] of groups) {
      for (const slot of slots) {
        const current = placement.get(slot.productId) ?? [];
        if (!current.includes(label)) current.push(label);
        placement.set(slot.productId, current);
      }
    }
    return placement;
  }, [homeSections]);

  useEffect(() => {
    // Un refresh del servidor reemplaza la lista: los cambios locales ya
    // estan en la respuesta.
    setOverrides({});
  }, [products]);

  useEffect(() => {
    setSelected((current) => {
      const next = new Set(
        [...current].filter((id) => products.some((item) => item.id === id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [products]);

  const allSelected =
    items.length > 0 && items.every((product) => selected.has(product.id));

  const toggleAll = () => {
    setSelected(
      allSelected ? new Set() : new Set(items.map((product) => product.id)),
    );
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const performBulk = async (request: BulkRequest, retried = false) => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulkAdminProducts(
        request.ids,
        request.action,
        request.payload,
      );
      setNotice(
        `${request.label}: ${bulkSummary(result.requested, result.updated, result.skipped)}`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (caught) {
      if (!retried && isStepUp(caught)) {
        setPendingBulk(request);
        setStepUpOpen(true);
      } else {
        setError(
          errorMessage(caught, "No se pudo aplicar la acción en lote."),
        );
      }
    } finally {
      setPending(false);
    }
  };

  const requestBulk = (
    action: AdminProductBulkAction,
    payload: Record<string, unknown>,
    label: string,
  ) => {
    if (selected.size === 0 || !canWrite) return;
    void performBulk({
      ids: [...selected],
      action,
      payload,
      label,
    });
  };

  const applyMarkup = () => {
    const percent = Number(markup);
    if (!Number.isFinite(percent) || percent < 0) {
      setError("El markup debe ser un porcentaje mayor o igual a cero.");
      return;
    }
    requestBulk("apply_markup", { percent }, "Markup aplicado");
  };

  const applyCategory = () => {
    if (!categoryId) {
      setError("Elige una categoría para el lote.");
      return;
    }
    requestBulk(
      "set_categories",
      { categoryIds: [categoryId], mode: categoryMode },
      categoryMode === "add" ? "Categoría añadida" : "Categoría asignada",
    );
  };

  const onSaved = (updated: AdminProduct, message: string) => {
    setOverrides((current) => ({ ...current, [updated.id]: updated }));
    setNotice(message);
    setError(null);
    setEditing(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <CatalogFilters filters={filters} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold text-carbon">
            Catálogo UPBUY
          </h2>
          <p className="text-sm text-coffee-deep">
            {total} producto(s) en esta vista. El stock y el costo vienen del
            proveedor.
          </p>
        </div>
        {selected.size > 0 ? (
          <p className="text-xs font-semibold text-terracotta-deep">
            {selected.size} seleccionado(s)
          </p>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {notice ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <InlineAlert
              title="Listo"
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
              title="No se pudo completar la acción"
              message={error}
              tone="danger"
              action={{ label: "Cerrar", onClick: () => setError(null) }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No hay productos con estos filtros"
          description="Prueba otra búsqueda o publica productos desde la pestaña Sin publicar."
          action={{
            label: "Limpiar filtros",
            onClick: () => {
              window.location.href = "/admin/catalogo?tab=catalogo";
            },
          }}
        />
      ) : (
        <>
          {/* Escritorio */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Seleccionar todos los productos de esta página"
                      className="h-4 w-4 accent-terracotta"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Producto
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Precio
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Stock
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Categorías
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((product, index) => (
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
                          src={product.images?.[0]}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                          fallback={
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-coffee-deep">
                              <PackageSearch aria-hidden="true" className="h-4 w-4" />
                            </span>
                          }
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setEditing(product)}
                            className="block max-w-[280px] truncate text-left font-semibold text-carbon hover:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {product.name}
                          </button>
                          <p className="truncate text-[11px] text-coffee-deep">
                            {product.sku} · {product.provider ?? "sin proveedor"}
                          </p>
                          {product.destacadas ? (
                            <span className="mt-1 inline-flex">
                              <FeaturedBadge />
                            </span>
                          ) : null}
                          {homePlacement.has(product.id) ? (
                            <span className="mt-1 inline-flex">
                              <HomeSectionBadges
                                sections={homePlacement.get(product.id) ?? []}
                              />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <VisibilityBadge product={product} />
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <span className="font-semibold text-carbon">
                        {formatPrice(product.precio ?? product.price)}
                      </span>
                      {product.descuentoPorcentaje ? (
                        <span className="mt-0.5 block text-[11px] text-coffee-deep">
                          {product.descuentoPorcentaje}% dto.
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <span
                        className={
                          product.stock > 0
                            ? "text-carbon"
                            : "font-semibold text-terracotta-deep"
                        }
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {product.categories.length === 0 ? (
                        <span className="text-xs text-terracotta-deep">
                          Sin clasificar
                        </span>
                      ) : (
                        <span className="block max-w-[180px] truncate text-xs text-coffee-deep">
                          {product.categories
                            .slice(0, 2)
                            .map((category) => category.name)
                            .join(", ")}
                          {product.categories.length > 2
                            ? ` +${product.categories.length - 2}`
                            : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(product)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Movil */}
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((product, index) => (
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
                    src={product.images?.[0]}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
                    fallback={
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-coffee-deep">
                        <PackageSearch aria-hidden="true" className="h-5 w-5" />
                      </span>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setEditing(product)}
                      className="block w-full truncate text-left text-sm font-semibold text-carbon"
                    >
                      {product.name}
                    </button>
                    <p className="truncate text-[11px] text-coffee-deep">
                      {product.sku} · {product.provider ?? "sin proveedor"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <VisibilityBadge product={product} />
                      {product.destacadas ? <FeaturedBadge /> : null}
                      {homePlacement.has(product.id) ? (
                        <HomeSectionBadges
                          sections={homePlacement.get(product.id) ?? []}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-end justify-between gap-2 border-t border-border pt-2">
                  <div className="text-xs text-coffee-deep">
                    <p className="font-semibold text-carbon tabular-nums">
                      {formatPrice(product.precio ?? product.price)}
                    </p>
                    <p className="tabular-nums">
                      Stock {product.stock}
                      {product.categories.length > 0
                        ? ` · ${product.categories[0].name}`
                        : " · Sin clasificar"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(product)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <CatalogPager
              page={page}
              totalPages={totalPages}
              previousHref={buildCatalogHref(filters, page - 1)}
              nextHref={buildCatalogHref(filters, page + 1)}
              label="Paginación del catálogo"
            />
          </div>
        </>
      )}

      <AnimatePresence>
        {selected.size > 0 ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-3 z-20 mt-2 rounded-xl border border-carbon/10 bg-carbon p-3 text-cream shadow-xl"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {selected.size} seleccionado(s)
              </p>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-cream/80 hover:bg-cream/10 hover:text-cream focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Limpiar selección
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() =>
                  requestBulk("make_visible", {}, "Productos visibles")
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-cream px-3 text-xs font-semibold text-carbon transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                Hacer visibles
              </button>
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() => requestBulk("hide", {}, "Productos ocultos")}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cream/25 px-3 text-xs font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
                Ocultar
              </button>
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() => requestBulk("archive", {}, "Productos archivados")}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cream/25 px-3 text-xs font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                Archivar
              </button>
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() =>
                  requestBulk("restore_draft", {}, "Productos en borrador")
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cream/25 px-3 text-xs font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                Restaurar borrador
              </button>
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() => requestBulk("feature", { value: true }, "Destacados")}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cream/25 px-3 text-xs font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                <Star aria-hidden="true" className="h-3.5 w-3.5" />
                Destacar
              </button>
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() =>
                  requestBulk("feature", { value: false }, "Destaque retirado")
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cream/25 px-3 text-xs font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
              >
                <StarOff aria-hidden="true" className="h-3.5 w-3.5" />
                Quitar destaque
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-cream/15 pt-2">
              <div className="flex items-end gap-1.5">
                <div>
                  <label
                    htmlFor="bulk-markup"
                    className="text-[10px] font-semibold tracking-[0.12em] text-cream/70 uppercase"
                  >
                    Markup %
                  </label>
                  <input
                    id="bulk-markup"
                    type="number"
                    min={0}
                    step={1}
                    value={markup}
                    onChange={(event) => setMarkup(event.target.value)}
                    disabled={!canWrite || pending}
                    className="mt-1 h-10 w-24 rounded-lg border border-cream/25 bg-carbon px-2 text-sm text-cream tabular-nums focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canWrite || pending}
                  onClick={applyMarkup}
                  className="inline-flex h-10 items-center rounded-lg bg-cream/15 px-3 text-xs font-semibold text-cream hover:bg-cream/25 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>

              <div className="flex items-end gap-1.5">
                <div>
                  <label
                    htmlFor="bulk-category"
                    className="text-[10px] font-semibold tracking-[0.12em] text-cream/70 uppercase"
                  >
                    Categoría
                  </label>
                  <select
                    id="bulk-category"
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    disabled={!canWrite || pending}
                    className="mt-1 h-10 max-w-[190px] rounded-lg border border-cream/25 bg-carbon px-2 text-sm text-cream focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
                  >
                    <option value="">Elegir…</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  aria-label="Modo de asignación de categorías"
                  value={categoryMode}
                  onChange={(event) =>
                    setCategoryMode(event.target.value as "replace" | "add")
                  }
                  disabled={!canWrite || pending}
                  className="h-10 rounded-lg border border-cream/25 bg-carbon px-2 text-sm text-cream focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
                >
                  <option value="replace">Reemplazar</option>
                  <option value="add">Añadir</option>
                </select>
                <button
                  type="button"
                  disabled={!canWrite || pending}
                  onClick={applyCategory}
                  className="inline-flex h-10 items-center rounded-lg bg-cream/15 px-3 text-xs font-semibold text-cream hover:bg-cream/25 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50"
                >
                  Asignar
                </button>
              </div>

              {pending ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-cream/80">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  Aplicando…
                </span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!canWrite ? (
        <InlineAlert
          title="Modo solo lectura"
          message="Tu rol puede consultar el catálogo, pero no aplicar cambios."
          tone="info"
        />
      ) : null}

      {editing ? (
        <ProductDrawer
          key={editing.id}
          product={editing}
          categories={categories}
          canWrite={canWrite}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      ) : null}

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={(open) => {
          setStepUpOpen(open);
          if (!open) setPendingBulk(null);
        }}
        actionLabel="Ocultar o archivar productos"
        description="Ocultar o archivar un producto lo saca de la tienda pública. Para confirmarlo necesitamos un código reciente."
        onVerified={async () => {
          if (pendingBulk) {
            await performBulk(pendingBulk, true);
          }
        }}
      />
    </div>
  );
}
