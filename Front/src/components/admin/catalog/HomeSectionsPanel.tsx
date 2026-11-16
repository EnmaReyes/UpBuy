"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  PackageSearch,
  Plus,
  Search,
  Trophy,
  X,
} from "lucide-react";
import InlineAlert from "@/components/kokonutui/inline-alert";
import { SafeImage } from "@/components/shared/SafeImage";
import { apiGet, ApiError } from "@/services/api/client";
import { saveAdminHomeSection } from "@/services/admin/catalog.actions";
import type {
  AdminHomeSectionKey,
  AdminHomeSections,
  AdminHomeSlot,
  AdminProductListResult,
} from "@/types/admin";

// Curaduria de la portada. Tres secciones de 4 ranuras: el orden visible es el
// que se guarda y el backend vuelve a validar permiso, tamano y publicacion.
// El relleno automatico (novedades por fecha, favoritos por ventas) solo
// completa huecos; nunca desplaza lo curado.

const SECTION_SIZE = 4;

type SectionDef = {
  key: AdminHomeSectionKey;
  title: string;
  description: string;
};

const SECTION_DEFS: SectionDef[] = [
  {
    key: "seleccion",
    title: "Selección",
    description: "Las piezas que abren la portada. Sin relleno por ventas.",
  },
  {
    key: "novedades",
    title: "Novedades",
    description: "Lo recién publicado. El orden manual manda sobre la fecha.",
  },
  {
    key: "favoritos",
    title: "Favoritos de la comunidad",
    description: "Curaduría, luego la semilla y después las ventas reales.",
  },
];

type Slots = Record<AdminHomeSectionKey, AdminHomeSlot[]>;

function toSlot(product: {
  id: string;
  name: string;
  sku: string;
  images?: string[];
}): AdminHomeSlot {
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    position: 1,
    unitsSold: 0,
    image: product.images?.[0] ?? null,
  };
}

function withPositions(slots: AdminHomeSlot[]): AdminHomeSlot[] {
  return slots.map((slot, index) => ({ ...slot, position: index + 1 }));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function HomeSectionsPanel({
  sections,
  canWrite,
  loadError,
}: {
  sections: AdminHomeSections | null;
  canWrite: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<Slots>(() => ({
    seleccion: sections?.featured ?? [],
    novedades: sections?.newArrivals ?? [],
    favoritos: sections?.communityFavorites ?? [],
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError);
  const [pending, setPending] = useState<AdminHomeSectionKey | null>(null);

  const update = (
    section: AdminHomeSectionKey,
    transform: (current: AdminHomeSlot[]) => AdminHomeSlot[],
  ) => {
    setSlots((current) => ({
      ...current,
      [section]: withPositions(transform(current[section])),
    }));
    setNotice(null);
  };

  const add = (section: AdminHomeSectionKey, slot: AdminHomeSlot) => {
    setError(null);
    update(section, (current) => {
      if (current.some((item) => item.productId === slot.productId)) {
        return current;
      }
      if (current.length >= SECTION_SIZE) {
        setError("Máximo 4 productos por sección.");
        return current;
      }
      return [...current, slot];
    });
  };

  const remove = (section: AdminHomeSectionKey, productId: string) => {
    setError(null);
    update(section, (current) =>
      current.filter((item) => item.productId !== productId),
    );
  };

  const move = (
    section: AdminHomeSectionKey,
    index: number,
    direction: -1 | 1,
  ) => {
    update(section, (current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const useRanking = () => {
    setError(null);
    update("favoritos", (current) => {
      const chosen = [...current];
      for (const candidate of sections?.ranking ?? []) {
        if (chosen.length >= SECTION_SIZE) break;
        if (chosen.some((item) => item.productId === candidate.productId)) {
          continue;
        }
        chosen.push(candidate);
      }
      return chosen;
    });
  };

  const save = async (section: AdminHomeSectionKey) => {
    setPending(section);
    setError(null);
    setNotice(null);
    try {
      await saveAdminHomeSection(
        section,
        slots[section].map((slot) => slot.productId),
      );
      setNotice(
        `Se guardó «${SECTION_DEFS.find((def) => def.key === section)?.title}». La portada se actualiza en menos de un minuto.`,
      );
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "No se pudo guardar la sección."));
    } finally {
      setPending(null);
    }
  };

  if (loadError && !sections) {
    return (
      <InlineAlert
        title="No pudimos cargar la curaduría de la portada"
        message={`${loadError} Revisa que la migración de la Home esté aplicada en el backend.`}
        tone="danger"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-carbon">
          Curaduría de la portada
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-coffee-deep">
          Cada sección muestra hasta cuatro productos publicados. Lo que fijes
          aquí gana sobre el relleno automático; los huecos libres se completan
          solos.
        </p>
      </div>

      {notice ? (
        <InlineAlert
          title="Listo"
          message={notice}
          tone="success"
          action={{ label: "Cerrar", onClick: () => setNotice(null) }}
        />
      ) : null}
      {error ? (
        <InlineAlert
          title="No se pudo completar la acción"
          message={error}
          tone="danger"
          action={{ label: "Cerrar", onClick: () => setError(null) }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {SECTION_DEFS.map((definition) => {
          const sectionSlots = slots[definition.key];
          return (
            <section
              key={definition.key}
              aria-labelledby={`home-section-${definition.key}`}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div>
                <h3
                  id={`home-section-${definition.key}`}
                  className="font-heading text-base font-semibold text-carbon"
                >
                  {definition.title}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-coffee-deep">
                  {definition.description}
                </p>
              </div>

              {sectionSlots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-xs text-coffee-deep">
                  Sin pines. La portada usará el relleno automático.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {sectionSlots.map((slot, index) => (
                    <li
                      key={slot.productId}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
                    >
                      <span className="w-5 shrink-0 text-center text-xs font-semibold text-coffee-deep tabular-nums">
                        {index + 1}
                      </span>
                      <SafeImage
                        src={slot.image}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                        fallback={
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-coffee-deep">
                            <PackageSearch
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          </span>
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-carbon">
                          {slot.name || "Producto"}
                        </p>
                        <p className="truncate text-[11px] text-coffee-deep">
                          {slot.sku}
                          {definition.key === "favoritos"
                            ? ` · ${slot.unitsSold} vendidos`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <IconButton
                          label={`Subir ${slot.name}`}
                          disabled={!canWrite || index === 0}
                          onClick={() => move(definition.key, index, -1)}
                        >
                          <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Bajar ${slot.name}`}
                          disabled={
                            !canWrite || index === sectionSlots.length - 1
                          }
                          onClick={() => move(definition.key, index, 1)}
                        >
                          <ArrowDown
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </IconButton>
                        <IconButton
                          label={`Quitar ${slot.name}`}
                          disabled={!canWrite}
                          onClick={() => remove(definition.key, slot.productId)}
                        >
                          <X aria-hidden="true" className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {sectionSlots.length < SECTION_SIZE && canWrite ? (
                <ProductSearch
                  inputId={`home-product-search-${definition.key}`}
                  existingIds={sectionSlots.map((slot) => slot.productId)}
                  onAdd={(slot) => add(definition.key, slot)}
                />
              ) : null}

              {definition.key === "favoritos" ? (
                <RankingBox
                  ranking={sections?.ranking ?? []}
                  onUse={useRanking}
                  disabled={!canWrite || sectionSlots.length >= SECTION_SIZE}
                />
              ) : null}

              <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  disabled={!canWrite || pending !== null}
                  onClick={() => void save(definition.key)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  {pending === definition.key ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin"
                    />
                  ) : null}
                  Guardar sección
                </button>
                <span className="text-xs text-coffee-deep tabular-nums">
                  {sectionSlots.length}/{SECTION_SIZE}
                </span>
              </div>
            </section>
          );
        })}
      </div>

      {!canWrite ? (
        <InlineAlert
          title="Modo solo lectura"
          message="Tu rol puede consultar la curaduría, pero no cambiarla."
          tone="info"
        />
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-coffee-deep transition-colors hover:bg-muted hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ProductSearch({
  inputId,
  existingIds,
  onAdd,
}: {
  inputId: string;
  existingIds: string[];
  onAdd: (slot: AdminHomeSlot) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<AdminHomeSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<AdminProductListResult>(
        "/api/admin/products",
        {
          query: { q: query, visibility: "visible", limit: 8 },
        },
      );
      setResults(
        data.products
          .filter((product) => !existingIds.includes(product.id))
          .map(toSlot),
      );
    } catch (caught) {
      setError(
        errorMessage(caught, "No se pudo buscar productos publicados."),
      );
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={search} className="flex items-center gap-1.5" role="search">
        <div className="relative flex-1">
          <label htmlFor={inputId} className="sr-only">
            Buscar productos publicados
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-coffee-deep"
          />
          <input
            id={inputId}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Añadir por nombre o SKU"
            className="h-9 w-full rounded-lg border border-border bg-background pr-2 pl-8 text-xs text-carbon placeholder:text-coffee-deep focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          {loading ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          Buscar
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-[11px] text-terracotta-deep">
          {error}
        </p>
      ) : null}

      {results ? (
        results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-center text-[11px] text-coffee-deep">
            Sin resultados para «{term}». Publica el producto primero.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((slot) => (
              <li key={slot.productId}>
                <button
                  type="button"
                  onClick={() => onAdd(slot)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-background p-1.5 text-left transition-colors hover:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <SafeImage
                    src={slot.image}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
                    fallback={
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-coffee-deep">
                        <PackageSearch aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-carbon">
                      {slot.name}
                    </span>
                    <span className="block truncate text-[11px] text-coffee-deep">
                      {slot.sku}
                    </span>
                  </span>
                  <Plus
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-terracotta-deep"
                  />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function RankingBox({
  ranking,
  onUse,
  disabled,
}: {
  ranking: AdminHomeSlot[];
  onUse: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-coffee-deep uppercase">
          <Trophy aria-hidden="true" className="h-3.5 w-3.5" />
          Ranking de ventas
        </p>
        <button
          type="button"
          onClick={onUse}
          disabled={disabled || ranking.length === 0}
          className="text-[11px] font-semibold text-terracotta-deep underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:text-coffee-deep disabled:no-underline disabled:opacity-50"
        >
          Usar el ranking
        </button>
      </div>
      {ranking.length === 0 ? (
        <p className="mt-1 text-[11px] leading-relaxed text-coffee-deep">
          Aún no hay ventas registradas en los últimos 90 días.
        </p>
      ) : (
        <ol className="mt-1.5 flex flex-col gap-0.5">
          {ranking.slice(0, 4).map((slot) => (
            <li
              key={slot.productId}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="truncate text-carbon">{slot.name}</span>
              <span className="shrink-0 text-coffee-deep tabular-nums">
                {slot.unitsSold}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
