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
import {
  CATEGORIES,
  PRODUCTS,
  getFeaturedProducts,
  getNewArrivals,
} from "@/lib/mock-data";

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
// Los datos provienen de src/lib/mock-data.ts hasta conectar el backend real.
export default function HomePage() {
  const featured = getFeaturedProducts();
  const newArrivals = getNewArrivals();

  return (
    <>
      <Hero featured={featured[0] ?? PRODUCTS[0]} />
      <BenefitsTicker />
      <FeaturedProducts products={featured} />
      <NewArrivals products={newArrivals.slice(0, 4)} />
      <BrandBanner />
      <BrandPillars />
      <Favorites products={PRODUCTS.slice(0, 4)} />
      <Categories categories={CATEGORIES} />
      <Newsletter />
    </>
  );
}
