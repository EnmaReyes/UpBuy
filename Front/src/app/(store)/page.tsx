import type { Metadata } from "next";
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
import {
  PRODUCTS,
  getFeaturedProducts,
  getNewArrivals,
} from "@/lib/mock-data";

// Categorias de portada cuando la API no responde o aun no hay categorias.
// En la base se siembran las mismas desde `ensureCatalogSchema`.
const HOME_CATEGORY_FALLBACK = [
  {
    slug: "masculino",
    name: "Masculino",
    description: "Prendas y básicos pensados para el día a día masculino.",
  },
  {
    slug: "femenino",
    name: "Femenino",
    description: "Siluetas y esenciales para un estilo femenino actual.",
  },
  {
    slug: "accesorios",
    name: "Accesorios",
    description: "Detalles que terminan de contar tu estilo.",
  },
  {
    slug: "calzado",
    name: "Calzado",
    description: "Pisadas cómodas para acompañar cada look.",
  },
];

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

// Página principal. Composición inspirada en la referencia SOLEVORA.
// Los productos siguen en src/lib/mock-data.ts; las categorías ya vienen del
// catálogo real para que la portada refleje lo que se administra en el panel.
export default async function HomePage() {
  const featured = getFeaturedProducts();
  const newArrivals = getNewArrivals();
  const categories = await loadHomeCategories();

  return (
    <>
      <Hero featured={featured[0] ?? PRODUCTS[0]} />
      <BenefitsTicker />
      <FeaturedProducts products={featured} />
      <NewArrivals products={newArrivals.slice(0, 4)} />
      <BrandBanner />
      <BrandPillars />
      <Favorites products={PRODUCTS.slice(0, 4)} />
      <Categories categories={categories} />
      <Newsletter />
    </>
  );
}

// Las cuatro primeras categorías activas, sin la de respaldo. Si la API falla
// o no hay categorías, se muestran las de portada para no romper el home.
async function loadHomeCategories() {
  try {
    const rows = await listCategories();
    const visible = rows
      .filter((category) => category.isActive && category.slug !== "sin-clasificar")
      .slice(0, 4)
      .map((category) => ({
        slug: category.slug,
        name: category.name,
        description: category.description,
      }));
    return visible.length > 0 ? visible : HOME_CATEGORY_FALLBACK;
  } catch {
    return HOME_CATEGORY_FALLBACK;
  }
}
