import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// robots.ts es un Route Handler especial: no recibe `request` como argumento
// en esta versión de Next.js. La URL del sitemap se deriva del host real de
// la petición para que el robots.txt sea válido en cualquier entorno.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/carrito", "/checkout", "/cuenta"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
