import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DotFieldBackground } from "@/components/shared/DotFieldBackground";
import { ArticuloNuevoForm } from "@/components/admin/articulos/ArticuloNuevoForm";
import { SupplierProductPicker } from "@/components/admin/articulos/SupplierProductPicker";
import {
  listAdminCategories,
  listAdminSuppliers,
} from "@/services/admin/catalog";

export const dynamic = "force-dynamic";

export default async function AdminArticuloNuevoPage() {
  const [categories, suppliers] = await Promise.all([
    listAdminCategories(),
    listAdminSuppliers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative isolate overflow-hidden rounded-2xl bg-carbon px-5 py-8 text-cream sm:px-8 sm:py-10">
        <DotFieldBackground variant="carrito" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
              Nuevo artículo
            </p>
            <h1 className="mt-3 font-heading text-[clamp(1.9rem,4vw,2.9rem)] leading-tight font-bold tracking-tight">
              Crear producto manual
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/75">
              Crea un producto de alta manual. Asigna el proveedor de origen (o
              deja &quot;manual&quot; si es propio de UPBUY).
            </p>
          </div>
          <Link
            href="/admin/catalogo"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-cream/25 px-4 text-sm font-semibold text-cream transition-colors hover:bg-cream/10 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
          >
            Volver al catálogo <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <SupplierProductPicker suppliers={suppliers.suppliers} />

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-coffee/20" />
        <span className="text-xs font-semibold tracking-[0.2em] text-coffee-deep uppercase">
          O crea uno manualmente
        </span>
        <span className="h-px flex-1 bg-coffee/20" />
      </div>

      <ArticuloNuevoForm
        categories={categories.categories}
        suppliers={suppliers.suppliers}
      />
    </div>
  );
}
