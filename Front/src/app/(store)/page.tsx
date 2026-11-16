import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/home/Hero";
import { BenefitsTicker } from "@/components/home/BenefitsTicker";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { NewArrivals } from "@/components/home/NewArrivals";
import { BrandBanner } from "@/components/home/BrandBanner";
import { Categories } from "@/components/home/Categories";
import { BrandPillars } from "@/components/home/BrandPillars";
import { Favorites } from "@/components/home/Favorites";
import { Newsletter } from "@/components/home/Newsletter";
import { listCategories } from "@/services/catalog";
import { getHomePayload } from "@/services/catalog/home";
import { toCardData } from "@/services/catalog/mappers";
import type { HomeCategory, HomePayload } from "@/types/catalog";

// La portada se revalida cada 60 s: el admin ve su curaduría sin redeploy.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "UPBUY — Ropa con identidad propia",
  description:
    "Prendas modernas para moverte con estilo. Envíos a toda Colombia, compra segura y nuevas colecciones cada temporada.",
  openGraph: {
    title: "UPBUY — Ropa con identidad propia",
    description:
      "Prendas modernas para moverte con estilo. Envíos a toda Colombia y nuevas colecciones cada temporada.",
    type: "website",
    locale: "es_CO",
    siteName: "UPBUY",
  },
  twitter: {
    card: "summary_large_image",
    title: "UPBUY — Ropa con identidad propia",
    description: "Prendas modernas para moverte con estilo.",
  },
};

// Página principal. Solo muestra productos reales de `GET /api/home`; si la API
// falla no hay datos de ejemplo: la portada editorial se mantiene y las
// rejillas se sustituyen por un estado vacío honesto.
export default async function HomePage() {
  const [homeResult, categoriesResult] = await Promise.allSettled([
    getHomePayload(),
    listCategories(),
  ]);

  const home: HomePayload | null =
    homeResult.status === "fulfilled" ? homeResult.value : null;

  const categories = resolveHomeCategories(
    home?.categories ?? [],
    categoriesResult.status === "fulfilled" ? categoriesResult.value : [],
  );

  const sections = home?.sections ?? null;
  const featured = (sections?.featured ?? []).map((product) =>
    toCardData(product, product.badge),
  );
  const newArrivals = (sections?.newArrivals ?? []).map((product) =>
    toCardData(product, product.badge),
  );
  const communityFavorites = (sections?.communityFavorites ?? []).map(
    (product) => toCardData(product, product.badge),
  );

  const hasProducts =
    featured.length + newArrivals.length + communityFavorites.length > 0;

  return (
    <>
      <Hero featured={featured[0] ?? null} />
      <BenefitsTicker />

      {hasProducts ? (
        <>
          <FeaturedProducts products={featured} />
          <NewArrivals products={newArrivals} />
          <BrandBanner />
          <BrandPillars />
          <Favorites products={communityFavorites} />
        </>
      ) : (
        <>
          <HomeCatalogState unavailable={homeResult.status === "rejected"} />
          <BrandBanner />
          <BrandPillars />
        </>
      )}

      {categories.length > 0 ? <Categories categories={categories} /> : null}
      <Newsletter />
    </>
  );
}

// Las categorías de la portada vienen de `/api/home`; si esa llamada falla se
// usa `/api/categories` como respaldo, que también es catálogo real. Nunca se
// inventan categorías.
function resolveHomeCategories(
  fromHome: HomeCategory[],
  fromCatalog: Awaited<ReturnType<typeof listCategories>>,
): HomeCategory[] {
  if (fromHome.length > 0) return fromHome.slice(0, 4);

  return fromCatalog
    .filter(
      (category) => category.isActive && category.slug !== "sin-clasificar",
    )
    .slice(0, 4)
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
    }));
}

function HomeCatalogState({ unavailable }: { unavailable: boolean }) {
  return (
    <section className="section-y bg-background">
      <div className="container-page">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta-deep uppercase">
            Catálogo
          </p>
          <h2 className="font-heading text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-bold tracking-tight text-carbon">
            {unavailable
              ? "No pudimos cargar el catálogo"
              : "Todavía no hay productos publicados"}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {unavailable
              ? "Estamos teniendo un problema con la tienda. Vuelve a intentarlo en unos minutos."
              : "Estamos preparando la primera colección. Muy pronto vas a encontrar las piezas aquí."}
          </p>
          <Link
            href="/productos"
            className="mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-carbon px-6 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
          >
            Ir a la tienda
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
