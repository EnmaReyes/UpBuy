"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import ParticleButton from "@/components/kokonutui/particle-button";
import { createAdminProduct } from "@/services/admin/catalog.actions";
import { ApiError } from "@/services/api/client";
import type {
  AdminCategory,
  AdminCatalogSupplierOption,
  AdminProductCreatePayload,
} from "@/types/admin";

export function ArticuloNuevoForm({
  categories,
  suppliers,
}: {
  categories: AdminCategory[];
  suppliers: AdminCatalogSupplierOption[];
}) {
  const router = useRouter();

  // Los campos monetarios y de stock nunca aceptan negativos: el backend ya
  // los recorta a cero, aqui lo hacemos visible mientras se escribe.
  const nonNegative = (value: string) => {
    if (value === "") return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return "0";
    return value;
  };

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [stock, setStock] = useState("0");
  const [status, setStatus] = useState<"draft" | "active" | "archived">("draft");
  const [active, setActive] = useState(true);
  const [destacadas, setDestacadas] = useState(false);
  const [provider, setProvider] = useState("manual");
  const [customProvider, setCustomProvider] = useState("");
  const [descuento, setDescuento] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [promotionVideos, setPromotionVideos] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");

  const toPlayableUrl = (url: string) => {
    const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    return match
      ? `https://drive.google.com/uc?export=download&id=${match[1]}`
      : url;
  };
  const [error, setError] = useState<string | null>(null);

  const addImage = () => {
    const url = imageUrl.trim();
    if (!url) return;
    if (images.length >= 8) {
      setError("El maximo es 8 imagenes por producto.");
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("Cada imagen necesita una URL valida (https).");
      return;
    }
    setError(null);
    setImages((prev) => [...prev, url]);
    setImageUrl("");
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const addVideo = () => {
    const url = videoUrl.trim();
    if (!url) return;
    if (promotionVideos.length >= 3) {
      setError("El maximo es 3 videos por producto.");
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("Cada video necesita una URL valida (https).");
      return;
    }
    setError(null);
    setPromotionVideos((prev) => [...prev, url]);
    setVideoUrl("");
  };

  const removeVideo = (idx: number) => {
    setPromotionVideos((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    setError(null);
    if (!sku.trim() || !name.trim() || price === "") {
      setError("SKU, nombre y precio son obligatorios.");
      return;
    }

    const slugClean = slug.trim().toLowerCase();
    if (slugClean && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugClean)) {
      setError("El slug solo admite minúsculas, números y guiones.");
      return;
    }

    let providerFinal = "manual";
    let supplierId: string | undefined;
    if (provider === "otro") {
      providerFinal = customProvider.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(providerFinal)) {
        setError("Escribe un slug de proveedor válido (letras, números, - o _).");
        return;
      }
    } else if (provider !== "manual") {
      const selected = suppliers.find((item) => item.id === provider);
      if (!selected) {
        setError("El proveedor seleccionado ya no está disponible.");
        return;
      }
      providerFinal = selected.slug;
      supplierId = selected.id;
    }

    const payload: AdminProductCreatePayload = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      slug: slugClean || null,
      price: Number(price),
      cost: cost === "" ? undefined : Number(cost),
      compareAtPrice: compareAtPrice === "" ? null : Number(compareAtPrice),
      currency,
      stock: stock === "" ? 0 : Number(stock),
      active,
      status,
      provider: providerFinal,
      supplierId,
      destacadas,
      descuentoPorcentaje: descuento === "" ? null : Number(descuento),
      images,
      promotionVideos,
      categoryIds,
    };

    try {
      await createAdminProduct(payload);
      router.push("/admin/catalogo");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo crear el producto. Inténtalo de nuevo.",
      );
      throw err;
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => e.preventDefault()}
    >
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-4 text-sm text-terracotta-deep"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          SKU *
          <input
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Nombre *
          <input
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon sm:col-span-2">
          Descripción
          <textarea
            className="min-h-[80px] rounded-lg border border-coffee/30 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Slug
          <input
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Precio *
          <input
            type="number"
            min={0}
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={price}
            onChange={(e) => setPrice(nonNegative(e.target.value))}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Costo
          <input
            type="number"
            min={0}
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={cost}
            onChange={(e) => setCost(nonNegative(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Precio de referencia
          <input
            type="number"
            min={0}
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={compareAtPrice}
            onChange={(e) => setCompareAtPrice(nonNegative(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Moneda
          <input
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Stock
          <input
            type="number"
            min={0}
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={stock}
            onChange={(e) => setStock(nonNegative(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Estado
          <select
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "draft" | "active" | "archived")
            }
          >
            <option value="draft">Borrador</option>
            <option value="active">Activo</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Proveedor
          <select
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="manual">Manual (propio de UPBUY)</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
            <option value="otro">Otro proveedor...</option>
          </select>
        </label>
        {provider === "otro" ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
            Nombre del proveedor
            <input
              className="h-10 rounded-lg border border-coffee/30 px-3"
              value={customProvider}
              onChange={(e) => setCustomProvider(e.target.value)}
              placeholder="slug del proveedor"
              required
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-carbon">
          Descuento %
          <input
            type="number"
            min={0}
            max={100}
            className="h-10 rounded-lg border border-coffee/30 px-3"
            value={descuento}
            onChange={(e) => setDescuento(nonNegative(e.target.value))}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-carbon">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Activo
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-carbon">
          <input
            type="checkbox"
            checked={destacadas}
            onChange={(e) => setDestacadas(e.target.checked)}
          />
          Destacado
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-carbon">Categorías</span>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                categoryIds.includes(c.id)
                  ? "border-terracotta bg-terracotta text-cream"
                  : "border-coffee/30 text-carbon"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-carbon">Imágenes (URLs)</span>
        <div className="flex gap-2">
          <input
            className="h-10 flex-1 rounded-lg border border-coffee/30 px-3"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
          <button
            type="button"
            onClick={addImage}
            className="inline-flex h-10 items-center gap-1 rounded-lg bg-carbon px-3 text-cream"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {images.map((u, i) => (
            <li
              key={`${u}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-coffee/20 px-3 py-2"
            >
              <Image
                src={u}
                alt={`Vista previa de la imagen ${i + 1}`}
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-md border border-coffee/15 object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-coffee-deep">
                {u}
              </span>
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label={`Eliminar imagen ${i + 1}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-coffee-deep transition-colors hover:bg-terracotta/10 hover:text-terracotta focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-carbon">Material de promoción (videos, URLs)</span>
        <div className="flex gap-2">
          <input
            className="h-10 flex-1 rounded-lg border border-coffee/30 px-3"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
          />
          <button
            type="button"
            onClick={addVideo}
            className="inline-flex h-10 items-center gap-1 rounded-lg bg-carbon px-3 text-cream"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {promotionVideos.map((u, i) => (
            <li key={`${u}-${i}`} className="flex flex-col gap-2 rounded-lg border border-coffee/20 p-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-coffee-deep">{u}</span>
                <button
                  type="button"
                  onClick={() => removeVideo(i)}
                  aria-label={`Eliminar video ${i + 1}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-coffee-deep transition-colors hover:bg-terracotta/10 hover:text-terracotta focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="aspect-video w-full overflow-hidden rounded-md border border-coffee/15">
                <iframe
                  src={toPlayableUrl(u)}
                  title={`Vista previa del video ${i + 1}`}
                  className="h-full w-full"
                  allow="autoplay"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <ParticleButton
          type="button"
          onClick={submit}
          pendingLabel="Guardando"
          successLabel="Guardado"
          errorLabel="Reintentar"
        >
          Guardar producto
        </ParticleButton>
      </div>
    </form>
  );
}
