import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = {
  title: "Carrito — UPBUY",
  robots: { index: false, follow: false },
};

export default function CarritoPage() {
  return (
    <div className="bg-background">
      <section className="bg-carbon pt-28 pb-12 text-cream sm:pt-32">
        <div className="container-page">
          <p className="text-xs font-semibold tracking-[0.25em] text-terracotta uppercase">
            Tu selección
          </p>
          <h1 className="mt-4 font-heading text-[clamp(2rem,4.5vw,3.5rem)] leading-tight font-bold tracking-tight">
            Carrito
          </h1>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          <CartView />
        </div>
      </section>
    </div>
  );
}