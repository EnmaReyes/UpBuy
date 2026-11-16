"use client";

import { useRouter } from "next/navigation";
import { Inbox, Package } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import SmoothTab from "@/components/kokonutui/smooth-tab";

// Pestanas del catalogo. SmoothTab maneja el gesto y el indicador; aqui solo
// se sincroniza la pestana con la URL para que los filtros sean compartibles.

export function CatalogTabs({
  tab,
  catalogHref,
  trayHref,
  trayCount,
  catalog,
  tray,
}: {
  tab: "catalogo" | "bandeja";
  catalogHref: string;
  trayHref: string;
  trayCount?: number;
  catalog: ReactNode;
  tray: ReactNode;
}) {
  const router = useRouter();
  const [value, setValue] = useState(tab);

  useEffect(() => {
    setValue(tab);
  }, [tab]);

  const change = (next: string) => {
    const target = next === "bandeja" ? "bandeja" : "catalogo";
    setValue(target);
    router.replace(target === "bandeja" ? trayHref : catalogHref, {
      scroll: false,
    });
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
