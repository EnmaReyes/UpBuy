import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DotFieldBackground } from "@/components/shared/DotFieldBackground";
import { CatalogPanel } from "@/components/admin/catalog/CatalogPanel";
import { CatalogTabs, type CatalogTab } from "@/components/admin/catalog/CatalogTabs";
import { HomeSectionsPanel } from "@/components/admin/catalog/HomeSectionsPanel";
import { SupplierTrayPanel } from "@/components/admin/catalog/SupplierTrayPanel";
import {
  getAdminHomeSections,
  listAdminCategories,
  listAdminProducts,
  listUnpublishedCatalog,
} from "@/services/admin/catalog";
import { getAdminMe } from "@/services/admin/me";
import { ApiError } from "@/services/api/client";
import {
  buildCatalogHref,
  buildTrayHref,
  CATALOG_PAGE_SIZE,
} from "@/lib/catalog-links";
import {
  ADMIN_PRODUCT_STATUS_LABELS,
  type AdminCatalogFilters,
  type AdminHomeSections,
  type AdminSupplierTrayFilters,
  type AdminSupplierTrayResult,
} from "@/types/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catálogo — Panel UPBUY",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

const pick = (value: string, allowed: Record<string, unknown>): string =>
  value && value in allowed ? value : "";

const pageNumber = (value: string): number =>
  Math.max(1, Number(value) || 1);

async function loadTray(
  filters: AdminSupplierTrayFilters,
  page: number,
): Promise<{
  result: AdminSupplierTrayResult;
  error: string | null;
}> {
  try {
    const result = await listUnpublishedCatalog(filters, {
      page,
      limit: CATALOG_PAGE_SIZE,
    });
    return { result, error: null };
  } catch (error) {
    return {
      result: {
        products: [],
        total: 0,
        page: 1,
        limit: CATALOG_PAGE_SIZE,
      },
      error:
        error instanceof ApiError
          ? error.message
          : "No se pudo cargar la bandeja del proveedor.",
    };
  }
}

// La curaduria de la portada no debe tumbar el catalogo: si falla (por ejemplo,
// porque la migracion no esta aplicada) la pestana muestra el error y el resto
// del panel sigue funcionando.
async function loadHomeSections(): Promise<{
  data: AdminHomeSections | null;
  error: string | null;
}> {
  try {
    return { data: await getAdminHomeSections(), error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof ApiError
          ? error.message
          : "No se pudo cargar la curaduría de la portada.",
    };
  }
}

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const tab: CatalogTab =
    one(raw.tab) === "bandeja"
      ? "bandeja"
      : one(raw.tab) === "home"
        ? "home"
        : "catalogo";

  const filters: AdminCatalogFilters = {
    q: one(raw.q).trim(),
    status: pick(
      one(raw.status),
      ADMIN_PRODUCT_STATUS_LABELS,
    ) as AdminCatalogFilters["status"],
    visibility: pick(one(raw.visibility), {
      visible: true,
      hidden: true,
    }) as AdminCatalogFilters["visibility"],
    stock: pick(one(raw.stock), { in: true, out: true }) as
      | ""
      | "in"
      | "out",
    hasCategory: pick(one(raw.hasCategory), {
      true: true,
      false: true,
    }) as "" | "true" | "false",
    published: pick(one(raw.published), {
      "1": true,
      "0": true,
    }) as "" | "1" | "0",
    provider: pick(one(raw.provider), {
      venndelo: true,
      mastershop: true,
    }),
  };

  const trayFilters: AdminSupplierTrayFilters = {
    q: one(raw.q).trim(),
    availability: pick(one(raw.availability), {
      true: true,
      false: true,
    }) as "" | "true" | "false",
    provider: pick(one(raw.provider), {
      venndelo: true,
      mastershop: true,
    }),
  };

  const requestedPage = pageNumber(one(raw.page));
  const requestedTrayPage = pageNumber(one(raw.trayPage));

  let admin;
  let categories;
  let catalogResult;
  let trayState;
  let homeState;

  try {
    [admin, categories, catalogResult, trayState, homeState] = await Promise.all([
      getAdminMe(),
      listAdminCategories(),
      listAdminProducts(filters, {
        limit: CATALOG_PAGE_SIZE,
        offset: (requestedPage - 1) * CATALOG_PAGE_SIZE,
      }),
      loadTray(trayFilters, requestedTrayPage),
      loadHomeSections(),
    ]);
  } catch (error) {
    return <CatalogError error={error} />;
  }

  const catalogTotalPages = Math.max(
    1,
    Math.ceil(catalogResult.total / CATALOG_PAGE_SIZE),
  );
  const page = Math.min(requestedPage, catalogTotalPages);

  if (page !== requestedPage) {
    try {
      catalogResult = await listAdminProducts(filters, {
        limit: CATALOG_PAGE_SIZE,
        offset: (page - 1) * CATALOG_PAGE_SIZE,
      });
    } catch (error) {
      return <CatalogError error={error} />;
    }
  }

  const trayTotalPages = Math.max(
    1,
    Math.ceil(trayState.result.total / CATALOG_PAGE_SIZE),
  );
  const trayPage = Math.min(
    trayState.result.page || requestedTrayPage,
    trayTotalPages,
  );

  if (trayPage !== trayState.result.page) {
    trayState = await loadTray(trayFilters, trayPage);
  }

  const canWrite = admin.permissions.includes("catalog.write");
  const canPublish = admin.permissions.includes("providers.manage");

  return (
    <div className="flex flex-col gap-6">
      <section className="relative isolate overflow-hidden rounded-2xl bg-carbon px-5 py-8 text-cream sm:px-8 sm:py-10">
        <DotFieldBackground variant="carrito" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
              Curaduría
            </p>
            <h1 className="mt-3 font-heading text-[clamp(1.9rem,4vw,2.9rem)] leading-tight font-bold tracking-tight">
              Catálogo
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/75">
              Publica lo que sí quieres vender. El proveedor trae stock y costo;
              UPBUY decide el precio, la ficha y la visibilidad.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite ? (
              <Link
                href="/admin/articulos/nuevo"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-terracotta px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
              >
                Crear artículo
              </Link>
            ) : null}
            <Link
              href="/productos"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-cream/25 px-4 text-sm font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
            >
              Ver tienda
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <CatalogTabs
        tab={tab}
        catalogHref={buildCatalogHref(filters, page)}
        trayHref={buildTrayHref(trayFilters, trayPage)}
        homeHref="/admin/catalogo?tab=home"
        trayCount={trayState.result.total}
        catalog={
          <CatalogPanel
            products={catalogResult.products}
            total={catalogResult.total}
            page={page}
            totalPages={catalogTotalPages}
            filters={filters}
            categories={categories.categories}
            canWrite={canWrite}
            homeSections={homeState.data}
          />
        }
        home={
          <HomeSectionsPanel
            sections={homeState.data}
            canWrite={canWrite}
            loadError={homeState.error}
          />
        }
        tray={
          <SupplierTrayPanel
            products={trayState.result.products}
            total={trayState.result.total}
            page={trayPage}
            totalPages={trayTotalPages}
            filters={trayFilters}
            canPublish={canPublish}
            loadError={trayState.error}
          />
        }
      />
    </div>
  );
}

function CatalogError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudo cargar el catálogo.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6"
    >
      <h1 className="font-heading text-lg font-semibold text-carbon">
        No pudimos cargar el catálogo
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <p className="mt-2 text-xs text-coffee-deep">
        Si el panel carga pero esta sección falla, revisa que el backend tenga
        aplicado el esquema de catálogo y que tu rol incluya catálogo.
      </p>
      <Link
        href="/admin/catalogo"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
      >
        Reintentar
      </Link>
    </div>
  );
}
