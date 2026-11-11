import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Inicia sesión — UPBUY",
  description: "Entra a tu cuenta UPBUY para ver tus pedidos, direcciones y comprar más rápido.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}
    >
      <LoginForm />
    </Suspense>
  );
}
