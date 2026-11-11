import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { PRODUCTS } from "@/lib/mock-data";

// sitemap.ts es un Route Handler especial: no recibe `request` como argumento
// en esta versión de Next.js. La URL base se deriva del host real de la
// petición para que sea válida en cualquier entorno.
// Las fichas de producto usan el catálogo mock; al conectar el backend se
// reemplaza la fuente por la lista real.
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

  const productRoutes: MetadataRoute.Sitemap = PRODUCTS.map((product) => ({
    url: `${origin}/producto/${product.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...productRoutes];
}
