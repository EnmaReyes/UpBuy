import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta — UPBUY",
  description: "Crea tu cuenta UPBUY y guarda tus datos de envío.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
