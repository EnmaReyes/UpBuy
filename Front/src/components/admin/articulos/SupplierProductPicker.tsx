"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import ParticleButton from "@/components/kokonutui/particle-button";
import {
  publishSupplierTrayProducts,
  searchSupplierProducts,
} from "@/services/admin/catalog.actions";
import { ApiError } from "@/services/api/client";
import type {
  AdminCatalogSupplierOption,
  AdminSupplierTrayItem,
} from "@/types/admin";

export function SupplierProductPicker({
  suppliers,
}: {
  suppliers: AdminCatalogSupplierOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [results, setResults] = useState<AdminSupplierTrayItem[]>([]);
  const [selected, setSelected] = useState<AdminSupplierTrayItem | null>(null);
  const [markup, setMarkup] = useState("30");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const search = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await searchSupplierProducts({ q: q.trim(), provider });
      setResults(data.products);
      setSearched(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo buscar en el catálogo del proveedor.",
      );
    } finally {
      setLoading(false);
    }
  };

  const publish = async () => {
    if (!selected) return;
    const percent = Number(markup);
    if (!Number.isFinite(percent) || percent < 0 || percent > 1000) {
      setError("El markup debe estar entre 0 y 1000.");
      throw new Error("validacion");
    }
    await publishSupplierTrayProducts(
      selected.supplier.slug,
      [selected.id],
      { visibility: "draft", markup: percent },
    );
    setNotice("Artículo publicado en borrador. Ya puedes editarlo en el catálogo.");
    setSelected(null);
    setResults((prev) => prev.filter((item) => item.id !== selected.id));
    router.refresh();
  };

  return (
    <section className="rounded-2xl border border-coffee/20 bg-cream/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-carbon">
            Importar desde un proveedor
          </h2>
          <p className="mt-1 text-sm text-coffee-deep">
            Busca el artículo original, revisa sus datos y publícalo en borrador.
            El precio se sugiere desde el costo y el markup que elijas.
          </p>
        </div>
        <span className="rounded-full bg-carbon px-3 py-1 text-xs font-semibold text-cream">
          Recomendado
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <label className="min-w-[220px] flex-1 text-sm font-medium text-carbon">
          Buscar por nombre o SKU
          <input
            className="mt-1.5 h-11 w-full rounded-lg border border-coffee/30 bg-cream px-3"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Ej. camisa, VEN-123..."
          />
        </label>
        <label className="text-sm font-medium text-carbon">
          Proveedor
          <select
            className="mt-1.5 h-11 rounded-lg border border-coffee/30 bg-cream px-3"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="">Todos</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.slug}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-60"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 text-sm text-carbon">
          {notice}
        </p>
      ) : null}

      {searched && results.length === 0 && !error ? (
        <p className="mt-5 text-sm text-coffee-deep">
          No hay artículos sin publicar con esos filtros.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => {
            const cover = item.assets?.[0]?.url;
            const isSelected = selected?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(isSelected ? null : item);
                    setError(null);
                    setNotice(null);
                  }}
                  aria-pressed={isSelected}
                  className={`flex h-full w-full gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none ${
                    isSelected
                      ? "border-terracotta bg-terracotta/5"
                      : "border-coffee/20 hover:border-coffee/50"
                  }`}
                >
                  <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-cream">
                    {cover ? (
                      <Image
                        src={cover}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-carbon">
                      {item.name}
                    </span>
                    <span className="mt-1 block text-xs text-coffee-deep">
                      {item.supplier.name}
                    </span>
                    <span className="mt-1 block text-xs text-coffee-deep tabular-nums">
                      {item.totalQuantity} und. ·{" "}
                      {item.originalPrice === null
                        ? "sin costo"
                        : `$${Number(item.originalPrice).toLocaleString("es-CO")}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {selected ? (
        <div className="mt-5 flex flex-wrap items-end gap-4 rounded-xl border border-coffee/20 bg-cream p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-coffee-deep uppercase">Seleccionado</p>
            <p className="truncate font-heading font-semibold text-carbon">
              {selected.name}
            </p>
          </div>
          <label className="text-sm font-medium text-carbon">
            Markup %
            <input
              type="number"
              min={0}
              max={1000}
              className="mt-1.5 h-11 w-28 rounded-lg border border-coffee/30 px-3 tabular-nums"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
            />
          </label>
          <ParticleButton
            type="button"
            onClick={publish}
            pendingLabel="Publicando"
            successLabel="Publicado"
            errorLabel="Reintentar"
          >
            Publicar en borrador
          </ParticleButton>
        </div>
      ) : null}
    </section>
  );
}
