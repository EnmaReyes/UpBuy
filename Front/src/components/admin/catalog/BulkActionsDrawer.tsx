"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight, Loader2, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { AdminCategory } from "@/types/admin";

// Acciones en lote para movil. La barra de seleccion del catalogo esconde sus
// controles detras de esta hoja: visibilidad, estado, destacados, precio y
// categorias, agrupados y con objetivos tactiles amplios.

export type BulkActionItem = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  onSelect: () => void;
  tone?: "default" | "danger";
};

export type BulkActionGroup = {
  title: string;
  actions: BulkActionItem[];
};

export function BulkActionsDrawer({
  open,
  onOpenChange,
  count,
  canWrite,
  pending,
  groups,
  markup,
  onMarkupChange,
  onApplyMarkup,
  categories,
  categoryId,
  onCategoryChange,
  categoryMode,
  onCategoryModeChange,
  onApplyCategory,
  onClear,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  canWrite: boolean;
  pending: boolean;
  groups: BulkActionGroup[];
  markup: string;
  onMarkupChange: (value: string) => void;
  onApplyMarkup: () => void;
  categories: AdminCategory[];
  categoryId: string;
  onCategoryChange: (value: string) => void;
  categoryMode: "replace" | "add";
  onCategoryModeChange: (value: "replace" | "add") => void;
  onApplyCategory: () => void;
  onClear: () => void;
  error: string | null;
}) {
  const disabled = !canWrite || pending;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      showSwipeHandle
      swipeDirection="down"
    >
      <DrawerContent className="max-h-[88dvh] bg-card text-carbon">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <DrawerTitle className="font-heading text-base font-semibold text-carbon">
                Acciones en lote
              </DrawerTitle>
              <DrawerDescription className="mt-0.5 text-xs text-coffee-deep">
                {count} producto(s) seleccionado(s). Los cambios se aplican a
                toda la selección.
              </DrawerDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Cerrar acciones"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-coffee-deep transition-colors hover:bg-muted hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex flex-col gap-5">
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta-deep"
                >
                  {error}
                </p>
              ) : null}

              {groups.map((group) => (
                <section
                  key={group.title}
                  aria-label={group.title}
                  className="flex flex-col gap-1.5"
                >
                  <h3 className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                    {group.title}
                  </h3>

                  {group.actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={action.onSelect}
                        disabled={disabled}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                          action.tone === "danger"
                            ? "hover:border-terracotta/40 hover:bg-terracotta/5"
                            : "hover:border-coffee/40 hover:bg-muted/50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                            action.tone === "danger"
                              ? "bg-terracotta/10 text-terracotta-deep"
                              : "bg-muted text-carbon group-hover:bg-cream",
                          )}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-sm font-semibold",
                              action.tone === "danger"
                                ? "text-terracotta-deep"
                                : "text-carbon",
                            )}
                          >
                            {action.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-coffee-deep">
                            {action.detail}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-coffee-deep transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        />
                      </button>
                    );
                  })}
                </section>
              ))}

              <section
                aria-label="Precio"
                className="rounded-xl border border-border bg-muted/40 p-3"
              >
                <h3 className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                  Precio
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-coffee-deep">
                  Recalcula el precio de venta con el markup indicado sobre el
                  costo del proveedor.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border border-border bg-background px-3 focus-within:border-terracotta focus-within:ring-2 focus-within:ring-ring">
                    <input
                      id="bulk-markup-sheet"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={markup}
                      onChange={(event) => onMarkupChange(event.target.value)}
                      disabled={disabled}
                      aria-label="Porcentaje de markup"
                      className="h-full w-full min-w-0 bg-transparent text-sm text-carbon tabular-nums outline-none disabled:opacity-60"
                    />
                    <span className="text-sm font-semibold text-coffee-deep">
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onApplyMarkup}
                    disabled={disabled}
                    className="inline-flex h-11 shrink-0 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                  >
                    Aplicar
                  </button>
                </div>
              </section>

              <section
                aria-label="Categorías"
                className="rounded-xl border border-border bg-muted/40 p-3"
              >
                <h3 className="text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase">
                  Categorías
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-coffee-deep">
                  Asigna una categoría a toda la selección, reemplazando o
                  sumando a las que ya tiene.
                </p>
                <select
                  value={categoryId}
                  onChange={(event) => onCategoryChange(event.target.value)}
                  disabled={disabled}
                  aria-label="Categoría para el lote"
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <option value="">Elegir categoría…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={categoryMode}
                    onChange={(event) =>
                      onCategoryModeChange(
                        event.target.value as "replace" | "add",
                      )
                    }
                    disabled={disabled}
                    aria-label="Modo de asignación de categorías"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-carbon focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  >
                    <option value="replace">Reemplazar</option>
                    <option value="add">Añadir</option>
                  </select>
                  <button
                    type="button"
                    onClick={onApplyCategory}
                    disabled={disabled}
                    className="inline-flex h-11 shrink-0 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                  >
                    Asignar
                  </button>
                </div>
              </section>

              {!canWrite ? (
                <p className="rounded-lg border border-border bg-muted p-3 text-xs text-coffee-deep">
                  Tu rol puede consultar el catálogo, pero no aplicar cambios.
                </p>
              ) : null}

              {pending ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-coffee-deep">
                  <Loader2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin"
                  />
                  Aplicando cambios…
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Limpiar selección
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
