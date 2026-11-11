// Catálogo de prueba (MOCK) — NO es información comercial real.
//
// El backend todavía está cerrando la conexión con los proveedores por API, así
// que esta es la única fuente de datos del frontend. Cuando exista el contrato
// público de catálogo (ver docs/BACKEND_INTEGRATION.md) se reemplazan las
// constantes por llamadas a la API, conservando los tipos exportados aquí.
//
// Reglas del contrato futuro:
// - `price` es un entero en COP; el front solo formatea.
// - `cost` y `markup` son internos: no deben existir en este tipo público.
// - `slug`/`sku` identifican el producto en la URL de detalle.
// - Sin imágenes reales todavía: `image`/`images` vacíos activan los
//   marcadores editoriales de la UI.

export type ProductBadge = "bestseller" | "nuevo" | null;

export type ProductColor = {
  name: string;
  hex: string;
};

export type Product = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string;
  longDescription: string;
  category: string;
  categoryLabel: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  badge: ProductBadge;
  featured: boolean;
  newArrival: boolean;
  image: string | null;
  images: string[];
  sizes: string[];
  colors: ProductColor[];
  details: string[];
};

export type Category = {
  slug: string;
  name: string;
  description: string;
};

export const CATEGORIES: Category[] = [
  {
    slug: "camisetas",
    name: "Camisetas",
    description: "Básicos y ediciones con carácter para todos los días.",
  },
  {
    slug: "oversize",
    name: "Oversize",
    description: "Cortes holgados, caída amplia y máximo confort.",
  },
  {
    slug: "combos",
    name: "Combos",
    description: "Piezas que se complementan y van mejor juntas.",
  },
  {
    slug: "accesorios",
    name: "Accesorios",
    description: "Detalles que terminan de contar tu estilo.",
  },
];

const SIZES_APPAREL = ["XS", "S", "M", "L", "XL", "XXL"];
const SIZES_ACCESSORY = ["Única"];

const product = (
  data: Omit<Product, "discountPercent"> & { discountPercent?: number },
): Product => ({
  ...data,
  discountPercent: data.compareAtPrice
    ? Math.round(((data.compareAtPrice - data.price) / data.compareAtPrice) * 100)
    : 0,
});

export const PRODUCTS: Product[] = [
  product({
    id: "mock-1",
    slug: "camiseta-edicion-retro",
    sku: "UPB-CAM-001",
    name: "Camiseta Edición Retro",
    description: "Estilo clásico con un giro moderno para el día a día.",
    longDescription:
      "Una camiseta de algodón pesado con estampado inspirado en los archivos de la marca. Cuello reforzado, caída recta y un acabado suave al tacto que se mantiene lavado tras lavado.",
    category: "camisetas",
    categoryLabel: "Camisetas",
    price: 89000,
    compareAtPrice: null,
    badge: "bestseller",
    featured: true,
    newArrival: false,
    image: null,
    images: [],
    sizes: SIZES_APPAREL,
    colors: [
      { name: "Crema", hex: "#F5E9D7" },
      { name: "Carbón", hex: "#0B0B0B" },
    ],
    details: [
      "Algodón peinado de 240 g/m²",
      "Corte regular unisex",
      "Estampado serigrafiado de larga duración",
      "Lavado en frío, secado a la sombra",
    ],
  }),
  product({
    id: "mock-2",
    slug: "combo-linea-street",
    sku: "UPB-COM-002",
    name: "Combo Línea Street",
    description: "Silueta urbana pensada para moverte sin límites.",
    longDescription:
      "Camiseta y pantaloneta en un solo combo. La combinación está pensada para entrenar, salir o quedarte: textiles livianos, costuras flexibles y una paleta que combina con todo.",
    category: "combos",
    categoryLabel: "Combos",
    price: 79000,
    compareAtPrice: 99000,
    badge: "bestseller",
    featured: true,
    newArrival: false,
    image: null,
    images: [],
    sizes: SIZES_APPAREL,
    colors: [
      { name: "Arena", hex: "#D9C9B3" },
      { name: "Café", hex: "#8B6F56" },
    ],
    details: [
      "Camiseta + pantaloneta en algodón mixto",
      "Secado rápido",
      "Cintura elástica con cordón",
      "Dos bolsillos laterales",
    ],
  }),
  product({
    id: "mock-3",
    slug: "camiseta-editorial-oversize",
    sku: "UPB-OVE-003",
    name: "Camiseta Editorial Oversize",
    description: "Cortes holgados con personalidad y comodidad.",
    longDescription:
      "Nuestra silueta oversize de referencia. Hombros caídos, manga amplia y un largo que funciona con cualquier base. Una pieza editorial que se vuelve básico por uso.",
    category: "oversize",
    categoryLabel: "Oversize",
    price: 99000,
    compareAtPrice: null,
    badge: "nuevo",
    featured: true,
    newArrival: true,
    image: null,
    images: [],
    sizes: SIZES_APPAREL,
    colors: [
      { name: "Crema", hex: "#F5E9D7" },
      { name: "Terracota", hex: "#D35400" },
    ],
    details: [
      "Algodón orgánico de 260 g/m²",
      "Corte oversize con hombro caído",
      "Etiqueta tejida en el ruedo",
      "Hecha para uso diario",
    ],
  }),
  product({
    id: "mock-4",
    slug: "camiseta-serie-graffiti",
    sku: "UPB-CAM-004",
    name: "Camiseta Serie Graffiti",
    description: "Colores y formas que cuentan una historia en la calle.",
    longDescription:
      "Una edición limitada donde el color hace el trabajo. Estampado de gran formato al frente y un detalle pequeño en la espalda. Algodón de peso medio con caída limpia.",
    category: "camisetas",
    categoryLabel: "Camisetas",
    price: 84900,
    compareAtPrice: 109900,
    badge: null,
    featured: true,
    newArrival: false,
    image: null,
    images: [],
    sizes: SIZES_APPAREL,
    colors: [
      { name: "Hueso", hex: "#EDE0CE" },
      { name: "Negro", hex: "#111111" },
    ],
    details: [
      "Algodón de 220 g/m²",
      "Estampado frontal de gran formato",
      "Serie limitada de temporada",
      "Corte regular",
    ],
  }),
  product({
    id: "mock-5",
    slug: "buzo-media-cremallera",
    sku: "UPB-OVE-005",
    name: "Buzo Media Cremallera",
    description: "Abrigo ligero para las mañanas que empiezan temprano.",
    longDescription:
      "Buzo de felpa ligera con media cremallera y cuello alto. La capa intermedia que resuelve todo el año, sola o debajo de una chaqueta.",
    category: "oversize",
    categoryLabel: "Oversize",
    price: 129000,
    compareAtPrice: null,
    badge: "nuevo",
    featured: false,
    newArrival: true,
    image: null,
    images: [],
    sizes: SIZES_APPAREL,
    colors: [
      { name: "Café", hex: "#8B6F56" },
      { name: "Carbón", hex: "#0B0B0B" },
    ],
    details: [
      "Felpa de algodón y poliéster",
      "Media cremallera metálica",
      "Puños y ruedo acanalados",
      "Bolsillo canguro",
    ],
  }),
  product({
    id: "mock-6",
    slug: "gorra-upbuy",
    sku: "UPB-ACC-006",
    name: "Gorra UPBUY",
    description: "Un detalle simple que ordena todo el look.",
    longDescription:
      "Gorra de seis paneles con bordado minimalista. Ajuste posterior regulable y visera curva para un acabado limpio.",
    category: "accesorios",
    categoryLabel: "Accesorios",
    price: 59000,
    compareAtPrice: null,
    badge: null,
    featured: false,
    newArrival: true,
    image: null,
    images: [],
    sizes: SIZES_ACCESSORY,
    colors: [
      { name: "Carbón", hex: "#0B0B0B" },
      { name: "Crema", hex: "#F5E9D7" },
    ],
    details: [
      "Algodón con bordado frontal",
      "Correa regulable",
      "Seis paneles con ojales",
      "Visera curva",
    ],
  }),
  product({
    id: "mock-7",
    slug: "bolso-tote-urbano",
    sku: "UPB-ACC-007",
    name: "Bolso Tote Urbano",
    description: "Para el portátil, el mercado o el fin de semana.",
    longDescription:
      "Tote de lona gruesa con bolsillo interno y asas reforzadas. Un formato amplio que no pierde estructura y envejece bien.",
    category: "accesorios",
    categoryLabel: "Accesorios",
    price: 69000,
    compareAtPrice: null,
    badge: null,
    featured: false,
    newArrival: true,
    image: null,
    images: [],
    sizes: SIZES_ACCESSORY,
    colors: [
      { name: "Arena", hex: "#D9C9B3" },
      { name: "Negro", hex: "#111111" },
    ],
    details: [
      "Lona de algodón de 12 oz",
      "Bolsillo interno",
      "Asas reforzadas",
      "Cierre con botón magnético",
    ],
  }),
  product({
    id: "mock-8",
    slug: "combo-street-full",
    sku: "UPB-COM-008",
    name: "Combo Street Full",
    description: "El conjunto completo para un día entero en la calle.",
    longDescription:
      "Camiseta, buzo y gorra en una sola selección. Una base coherente para armar looks sin pensar demasiado, con la paleta de la temporada.",
    category: "combos",
    categoryLabel: "Combos",
    price: 149000,
    compareAtPrice: 179000,
    badge: "bestseller",
    featured: false,
    newArrival: true,
    image: null,
    images: [],
    sizes: SIZES_APPAREL,
    colors: [
      { name: "Arena", hex: "#D9C9B3" },
      { name: "Terracota", hex: "#D35400" },
    ],
    details: [
      "Camiseta + buzo + gorra",
      "Paleta de temporada",
      "Ahorro frente a la compra individual",
      "Piezas combinables entre sí",
    ],
  }),
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((item) => item.slug === slug);
}

export function getFeaturedProducts(): Product[] {
  return PRODUCTS.filter((item) => item.featured);
}

export function getNewArrivals(): Product[] {
  return PRODUCTS.filter((item) => item.newArrival);
}

export function getRelatedProducts(slug: string, limit = 4): Product[] {
  const current = getProductBySlug(slug);
  if (!current) return PRODUCTS.slice(0, limit);

  const sameCategory = PRODUCTS.filter(
    (item) => item.slug !== slug && item.category === current.category,
  );
  const rest = PRODUCTS.filter(
    (item) => item.slug !== slug && item.category !== current.category,
  );

  return [...sameCategory, ...rest].slice(0, limit);
}
