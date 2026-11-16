import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { listProducts } from "@/services/catalog";

// sitemap.ts es un Route Handler especial: no recibe `request` como argumento
// en esta versión de Next.js. La URL base se deriva del host real de la
// petición para que sea válida en cualquier entorno.
// Las fichas de producto salen del catálogo real. Si la API falla, el sitemap
// conserva las rutas estáticas: nunca se rellena con datos de ejemplo.
const PRODUCT_LIMIT = 100;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/productos`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${origin}/nosotros`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/contacto`, changeFrequency: "monthly", priority: 0.5 },
  ];

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const { products } = await listProducts({ limit: PRODUCT_LIMIT });
    productRoutes = products
      .filter((product): product is typeof product & { slug: string } =>
        Boolean(product.slug),
      )
      .map((product) => ({
        url: `${origin}/producto/${product.slug}`,
        changeFrequency: "weekly",
        priority: 0.8,
      }));
  } catch {
    productRoutes = [];
  }

  return [...staticRoutes, ...productRoutes];
}
