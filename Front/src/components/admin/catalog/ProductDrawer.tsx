"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Eye,
  EyeOff,
  ImageOff,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SafeImage } from "@/components/shared/SafeImage";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { formatPrice } from "@/lib/format";
import { ApiError } from "@/services/api/client";
import {
  createAdminCategory,
  restoreAdminProductImages,
  setAdminProductImages,
  setAdminProductVisibility,
  updateAdminProduct,
} from "@/services/admin/catalog.actions";
import type { AdminCategory, AdminProduct } from "@/types/admin";
import { cn } from "@/lib/utils";

// Ficha de edicion del producto. Se abre en un panel lateral (drawer) y
// conserva la curva de animacion del resto del panel. El stock y los datos del
// proveedor son de solo lectura: UPBUY nunca los pisa a mano.

type FormState = {
  name: string;
  description: string;
  price: string;
  compareAtPrice: string;
  discount: string;
  featured: boolean;
  categoryIds: string[];
};

const fieldClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon placeholder:text-muted-foreground focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const labelClass =
  "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function initialForm(product: AdminProduct): FormState {
  return {
    name: product.name ?? "",
    description: product.description ?? "",
    price: String(product.price ?? ""),
    compareAtPrice:
      product.compareAtPrice === null || product.compareAtPrice === undefined
        ? ""
        : String(product.compareAtPrice),
    discount:
      product.descuentoPorcentaje === null ||
      product.descuentoPorcentaje === undefined
        ? ""
        : String(product.descuentoPorcentaje),
    featured: Boolean(product.destacadas),
    categoryIds: product.categories.map((category) => category.id),
  };
}

function initialImages(product: AdminProduct): string[] {
  const gallery = [...(product.gallery ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((image) => image.url);
  const list = gallery.length > 0 ? gallery : (product.images ?? []);
  return [...new Set(list.filter(Boolean))];
}

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

export function ProductDrawer({
  product,
  categories,
  canWrite,
  onClose,
  onSaved,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  canWrite: boolean;
  onClose: () => void;
  onSaved: (product: AdminProduct, message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(product));
  const [categoryOptions, setCategoryOptions] =
    useState<AdminCategory[]>(categories);
  const [newCategory, setNewCategory] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const originalImages = useMemo(() => initialImages(product), [product]);
  const [images, setImages] = useState<string[]>(originalImages);
  const [newImage, setNewImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibilityPending, setVisibilityPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingVisible, setPendingVisible] = useState<boolean | null>(null);

  const visible = product.status === "active" && product.active;
  const priceValue = Number(form.price);
  const discountValue = form.discount.trim() ? Number(form.discount) : 0;
  const finalPrice =
    Number.isFinite(priceValue) && priceValue > 0
      ? Math.round(
          (priceValue * (100 - Math.min(Math.max(discountValue || 0, 0), 100))) /
            100,
        )
      : 0;
  const cost = product.cost === null ? null : Number(product.cost);
  const margin =
    cost !== null && cost >= 0 && finalPrice > 0
      ? ((finalPrice - cost) / finalPrice) * 100
      : null;
  const imagesDirty =
    images.length !== originalImages.length ||
    images.some((url, index) => url !== originalImages[index]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleCategory = (id: string) =>
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(id)
        ? current.categoryIds.filter((item) => item !== id)
        : [...current.categoryIds, id],
    }));

  // Alta rapida de categoria desde la ficha: se crea y queda asignada al
  // producto. Un producto puede tener varias categorias a la vez.
  const createCategory = async () => {
    const name = newCategory.trim();
    if (!name || !canWrite) return;

    setCreatingCategory(true);
    setCategoryError(null);
    try {
      const created = await createAdminCategory({ name });
      setCategoryOptions((current) =>
        current.some((category) => category.id === created.id)
          ? current
          : [...current, created],
      );
      setForm((current) => ({
        ...current,
        categoryIds: current.categoryIds.includes(created.id)
          ? current.categoryIds
          : [...current.categoryIds, created.id],
      }));
      setNewCategory("");
    } catch (caught) {
      setCategoryError(
        errorMessage(caught, "No se pudo crear la categoría."),
      );
    } finally {
      setCreatingCategory(false);
    }
  };

  const addImage = () => {
    const url = newImage.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      setImageError("La imagen debe usar una URL https.");
      return;
    }
    if (images.includes(url)) {
      setImageError("Esa URL ya está en la galería.");
      return;
    }
    if (images.length >= 8) {
      setImageError("Máximo 8 imágenes por producto.");
      return;
    }
    setImages((current) => [...current, url]);
    setNewImage("");
    setImageError(null);
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    setImages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) return;

    setError(null);
    const name = form.name.trim();
    if (!name) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError("El precio debe ser un número mayor o igual a cero.");
      return;
    }

    let compareAtPrice: number | null = null;
    if (form.compareAtPrice.trim()) {
      compareAtPrice = Number(form.compareAtPrice);
      if (!Number.isFinite(compareAtPrice) || compareAtPrice < 0) {
        setError("El precio anterior debe ser un número válido.");
        return;
      }
    }

    let discount: number | null = null;
    if (form.discount.trim()) {
      discount = Math.trunc(Number(form.discount));
      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        setError("El descuento debe estar entre 0 y 100.");
        return;
      }
    }

    setSaving(true);
    try {
      let updated = await updateAdminProduct(product.id, {
        name,
        description: form.description.trim() || null,
        price: Math.round(priceValue),
        compareAtPrice:
          compareAtPrice === null ? null : Math.round(compareAtPrice),
        descuentoPorcentaje: discount,
        destacadas: form.featured,
        categoryIds: form.categoryIds,
      });

      if (imagesDirty) {
        updated = await setAdminProductImages(product.id, images);
      }

      onSaved(updated, "Cambios guardados.");
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const changeVisibility = async (nextVisible: boolean) => {
    if (!canWrite) return;
    setVisibilityPending(true);
    setError(null);
    try {
      const updated = await setAdminProductVisibility(product.id, nextVisible);
      onSaved(
        updated,
        nextVisible
          ? "Producto visible en la tienda."
          : "Producto oculto. Se puede volver a mostrar cuando quieras.",
      );
      onClose();
    } catch (caught) {
      if (isStepUp(caught)) {
        setPendingVisible(nextVisible);
        setStepUpOpen(true);
      } else {
        setError(
          errorMessage(caught, "No se pudo cambiar la visibilidad."),
        );
      }
    } finally {
      setVisibilityPending(false);
    }
  };

  const restoreImages = async () => {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await restoreAdminProductImages(product.id);
      onSaved(updated, "Imágenes restauradas desde el proveedor.");
      onClose();
    } catch (caught) {
      setError(
        errorMessage(caught, "No se pudieron restaurar las imágenes."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open && !saving) onClose();
        }}
        swipeDirection="right"
      >
        <DrawerContent className="[--drawer-content-width:100%] bg-card text-carbon sm:[--drawer-content-width:34rem]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <DrawerTitle className="truncate font-heading text-lg font-semibold text-carbon">
                  {product.name}
                </DrawerTitle>
                <DrawerDescription className="mt-0.5 truncate text-xs text-coffee-deep">
                  {product.sku} · {product.provider ?? "Sin proveedor"}
                </DrawerDescription>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Cerrar ficha"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-coffee-deep transition-colors hover:bg-muted hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
              initial={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              <form
                id="product-edit-form"
                onSubmit={save}
                className="flex flex-col gap-5"
              >
                <section className="flex flex-col gap-3" aria-labelledby="edit-basics">
                  <h3
                    id="edit-basics"
                    className="font-heading text-sm font-semibold text-carbon"
                  >
                    Datos de la ficha
                  </h3>

                  <div>
                    <label htmlFor="product-name" className={labelClass}>
                      Nombre
                    </label>
                    <input
                      id="product-name"
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                      maxLength={255}
                      disabled={!canWrite || saving}
                      className={`${fieldClass} mt-1`}
                    />
                  </div>

                  <div>
                    <label htmlFor="product-description" className={labelClass}>
                      Descripción
                    </label>
                    <textarea
                      id="product-description"
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                      rows={4}
                      disabled={!canWrite || saving}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-carbon placeholder:text-muted-foreground focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="product-price" className={labelClass}>
                        Precio de venta
                      </label>
                      <input
                        id="product-price"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={form.price}
                        onChange={(event) =>
                          update("price", event.target.value)
                        }
                        disabled={!canWrite || saving}
                        className={`${fieldClass} mt-1 tabular-nums`}
                      />
                    </div>
                    <div>
                      <label htmlFor="product-compare" className={labelClass}>
                        Precio anterior
                      </label>
                      <input
                        id="product-compare"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={form.compareAtPrice}
                        onChange={(event) =>
                          update("compareAtPrice", event.target.value)
                        }
                        disabled={!canWrite || saving}
                        className={`${fieldClass} mt-1 tabular-nums`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="product-discount" className={labelClass}>
                        Descuento (%)
                      </label>
                      <input
                        id="product-discount"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        value={form.discount}
                        onChange={(event) =>
                          update("discount", event.target.value)
                        }
                        disabled={!canWrite || saving}
                        className={`${fieldClass} mt-1 tabular-nums`}
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-carbon has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                        <input
                          type="checkbox"
                          checked={form.featured}
                          onChange={(event) =>
                            update("featured", event.target.checked)
                          }
                          disabled={!canWrite || saving}
                          className="h-4 w-4 accent-terracotta"
                        />
                        <Star aria-hidden="true" className="h-4 w-4 text-terracotta" />
                        Destacado
                      </label>
                    </div>
                  </div>
                  <p className="text-[11px] text-coffee-deep">
                    Precio final en la tienda:{" "}
                    <span className="font-semibold text-carbon tabular-nums">
                      {formatPrice(finalPrice)}
                    </span>
                    {discountValue > 0 ? ` (${discountValue}% de descuento)` : ""}
                  </p>
                </section>

                <section
                  className="rounded-xl border border-border bg-muted/40 p-3"
                  aria-labelledby="edit-metrics"
                >
                  <h3
                    id="edit-metrics"
                    className="flex items-center gap-1.5 font-heading text-sm font-semibold text-carbon"
                  >
                    <Lock aria-hidden="true" className="h-3.5 w-3.5 text-coffee-deep" />
                    Datos del proveedor
                  </h3>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-[11px] text-coffee-deep uppercase">
                        Costo
                      </dt>
                      <dd className="font-semibold text-carbon tabular-nums">
                        {cost === null ? "—" : formatPrice(cost)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-coffee-deep uppercase">
                        Markup
                      </dt>
                      <dd className="font-semibold text-carbon tabular-nums">
                        {product.markup === null ? "—" : `${product.markup}×`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-coffee-deep uppercase">
                        Margen
                      </dt>
                      <dd className="font-semibold text-carbon tabular-nums">
                        {margin === null ? "—" : `${margin.toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-coffee-deep uppercase">
                        Stock
                      </dt>
                      <dd className="font-semibold text-carbon tabular-nums">
                        {product.stock}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[11px] leading-relaxed text-coffee-deep">
                    {product.supplierProductId
                      ? "El stock y los datos del proveedor solo los actualiza la sincronización. No se editan desde UPBUY."
                      : "Producto propio: el stock se administra desde el inventario."}
                  </p>
                </section>

                <section className="flex flex-col gap-2" aria-labelledby="edit-categories">
                  <h3
                    id="edit-categories"
                    className="font-heading text-sm font-semibold text-carbon"
                  >
                    Categorías
                  </h3>
                  <p className="text-xs leading-relaxed text-coffee-deep">
                    Puedes asignar varias categorías al mismo producto.
                  </p>
                  {categoryOptions.length === 0 ? (
                    <p className="text-sm text-coffee-deep">
                      Todavía no hay categorías. Crea la primera aquí abajo.
                    </p>
                  ) : (
                    <fieldset className="grid gap-1.5 sm:grid-cols-2">
                      <legend className="sr-only">Categorías del producto</legend>
                      {categoryOptions.map((category) => (
                        <label
                          key={category.id}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            form.categoryIds.includes(category.id)
                              ? "border-terracotta bg-terracotta/5 text-carbon"
                              : "border-border bg-background text-coffee-deep hover:border-coffee/40",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={form.categoryIds.includes(category.id)}
                            onChange={() => toggleCategory(category.id)}
                            disabled={!canWrite || saving}
                            className="h-4 w-4 accent-terracotta"
                          />
                          <span className="truncate">{category.name}</span>
                          {!category.isActive ? (
                            <span className="ml-auto text-[10px] uppercase">
                              Inactiva
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </fieldset>
                  )}

                  {canWrite ? (
                    <div className="mt-1 rounded-lg border border-dashed border-border bg-background p-3">
                      <label htmlFor="new-category" className={labelClass}>
                        Añadir categoría
                      </label>
                      <div className="mt-1 flex gap-2">
                        <input
                          id="new-category"
                          value={newCategory}
                          onChange={(event) => {
                            setNewCategory(event.target.value);
                            setCategoryError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              createCategory();
                            }
                          }}
                          placeholder="Ej. Deportivo"
                          maxLength={120}
                          disabled={saving || creatingCategory}
                          className={fieldClass}
                        />
                        <button
                          type="button"
                          onClick={createCategory}
                          disabled={
                            saving ||
                            creatingCategory ||
                            !newCategory.trim()
                          }
                          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                        >
                          {creatingCategory ? (
                            <Loader2
                              aria-hidden="true"
                              className="h-4 w-4 animate-spin"
                            />
                          ) : (
                            <Plus aria-hidden="true" className="h-4 w-4" />
                          )}
                          {creatingCategory ? "Creando…" : "Añadir"}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-coffee-deep">
                        Se crea y se asigna a este producto. Guarda los cambios
                        para confirmarlo.
                      </p>
                      {categoryError ? (
                        <p
                          role="alert"
                          className="mt-1 text-xs text-terracotta-deep"
                        >
                          {categoryError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {form.categoryIds.length === 0 ? (
                    <p className="text-[11px] text-terracotta-deep">
                      Sin categoría: la tienda no lo mostrará en los filtros.
                    </p>
                  ) : null}
                </section>

                <section className="flex flex-col gap-2" aria-labelledby="edit-images">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      id="edit-images"
                      className="font-heading text-sm font-semibold text-carbon"
                    >
                      Imágenes
                    </h3>
                    {product.supplierProductId ? (
                      <button
                        type="button"
                        onClick={restoreImages}
                        disabled={!canWrite || saving}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                      >
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        Restaurar del proveedor
                      </button>
                    ) : null}
                  </div>

                  {images.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-sm text-coffee-deep">
                      <ImageOff aria-hidden="true" className="h-4 w-4" />
                      Sin imágenes. Agrega una URL https.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {images.map((url, index) => (
                        <li
                          key={`${url}-${index}`}
                          className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
                        >
                          <SafeImage
                            src={url}
                            alt={`Imagen ${index + 1} de ${product.name}`}
                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                            fallback={
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-coffee-deep">
                                <ImageOff aria-hidden="true" className="h-4 w-4" />
                              </span>
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-xs text-coffee-deep">
                            {url}
                          </span>
                          <div className="flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => moveImage(index, -1)}
                              disabled={!canWrite || saving || index === 0}
                              aria-label={`Subir imagen ${index + 1}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-coffee-deep hover:bg-muted disabled:opacity-30"
                            >
                              <ArrowUp aria-hidden="true" className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(index, 1)}
                              disabled={
                                !canWrite || saving || index === images.length - 1
                              }
                              aria-label={`Bajar imagen ${index + 1}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-coffee-deep hover:bg-muted disabled:opacity-30"
                            >
                              <ArrowDown aria-hidden="true" className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setImages((current) =>
                                  current.filter((_, i) => i !== index),
                                )
                              }
                              disabled={!canWrite || saving}
                              aria-label={`Quitar imagen ${index + 1}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-terracotta-deep hover:bg-terracotta/10 disabled:opacity-30"
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex gap-2">
                    <label htmlFor="new-image" className="sr-only">
                      URL de la nueva imagen
                    </label>
                    <input
                      id="new-image"
                      value={newImage}
                      onChange={(event) => setNewImage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addImage();
                        }
                      }}
                      placeholder="https://…"
                      inputMode="url"
                      disabled={!canWrite || saving || images.length >= 8}
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={addImage}
                      disabled={
                        !canWrite || saving || images.length >= 8 || !newImage.trim()
                      }
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      Añadir
                    </button>
                  </div>
                  <p className="text-[11px] text-coffee-deep">
                    Máximo 8 imágenes https. La primera es la principal.
                  </p>
                  {imageError ? (
                    <p role="alert" className="text-xs text-terracotta-deep">
                      {imageError}
                    </p>
                  ) : null}
                </section>

                <section className="flex flex-col gap-2" aria-labelledby="edit-visibility">
                  <h3
                    id="edit-visibility"
                    className="font-heading text-sm font-semibold text-carbon"
                  >
                    Visibilidad
                  </h3>
                  <p className="text-xs leading-relaxed text-coffee-deep">
                    {visible
                      ? "Ahora es visible en la tienda. Ocultarlo lo saca del catálogo sin borrarlo."
                      : "Ahora no aparece en la tienda. Hazlo visible cuando la ficha esté lista."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {visible ? (
                      <button
                        type="button"
                        onClick={() => changeVisibility(false)}
                        disabled={!canWrite || saving || visibilityPending}
                        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 text-sm font-semibold text-terracotta-deep transition-colors hover:bg-terracotta/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                      >
                        {visibilityPending ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : (
                          <EyeOff aria-hidden="true" className="h-4 w-4" />
                        )}
                        Ocultar de la tienda
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => changeVisibility(true)}
                        disabled={!canWrite || saving || visibilityPending}
                        className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-carbon px-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                      >
                        {visibilityPending ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye aria-hidden="true" className="h-4 w-4" />
                        )}
                        Hacer visible
                      </button>
                    )}
                  </div>
                </section>

                {error ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
                  >
                    <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </p>
                ) : null}

                {!canWrite ? (
                  <p className="rounded-lg border border-border bg-muted p-3 text-xs text-coffee-deep">
                    Tu rol puede consultar el catálogo, pero no editarlo.
                  </p>
                ) : null}
              </form>
            </motion.div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="product-edit-form"
                disabled={!canWrite || saving}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : null}
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={(open) => {
          setStepUpOpen(open);
          if (!open) setPendingVisible(null);
        }}
        actionLabel="Ocultar productos"
        description="Ocultar un producto lo saca de la tienda pública. Para confirmarlo necesitamos un código reciente."
        onVerified={async () => {
          if (pendingVisible !== null) {
            await changeVisibility(pendingVisible);
          }
        }}
      />
    </>
  );
}
