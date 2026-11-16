"use client";

import { useRouter } from "next/navigation";
import { Inbox, LayoutGrid, Package } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import SmoothTab from "@/components/kokonutui/smooth-tab";

// Pestanas del catalogo. SmoothTab maneja el gesto y el indicador; aqui solo
// se sincroniza la pestana con la URL para que los filtros sean compartibles.

export type CatalogTab = "catalogo" | "bandeja" | "home";

export function CatalogTabs({
  tab,
  catalogHref,
  trayHref,
  homeHref,
  trayCount,
  catalog,
  tray,
  home,
}: {
  tab: CatalogTab;
  catalogHref: string;
  trayHref: string;
  homeHref: string;
  trayCount?: number;
  catalog: ReactNode;
  tray: ReactNode;
  /** Curaduria de la portada; se omite si el rol no puede escribir. */
  home?: ReactNode;
}) {
  const router = useRouter();
  const [value, setValue] = useState(tab);

  useEffect(() => {
    setValue(tab);
  }, [tab]);

  const change = (next: string) => {
    const target: CatalogTab =
      next === "bandeja" ? "bandeja" : next === "home" ? "home" : "catalogo";
    setValue(target);
    const href =
      target === "bandeja"
        ? trayHref
        : target === "home"
          ? homeHref
          : catalogHref;
    router.replace(href, { scroll: false });
  };

  return (
    <SmoothTab
      activeColor="bg-carbon"
      activeTextColor="text-cream"
      className="max-w-none [&>div:first-child]:justify-start"
      items={[
        {
          id: "catalogo",
          title: "Catálogo UPBUY",
          icon: Package,
          content: catalog,
        },
        {
          id: "home",
          title: "Portada",
          icon: LayoutGrid,
          content: home ?? null,
        },
        {
          id: "bandeja",
          title: trayCount ? `Sin publicar (${trayCount})` : "Sin publicar",
          icon: Inbox,
          content: tray,
        },
      ]}
      label="Secciones del catálogo"
      onChange={change}
      value={value}
    />
  );
}
