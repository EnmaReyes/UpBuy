import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CartProvider } from "@/context/cart-context";

// Layout del grupo (store): navbar + contenido + footer.
// El navbar es fijo y transparente; las páginas añaden su propio padding superior.
// El carrito es estado de cliente, por eso el provider envuelve todo el árbol.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </CartProvider>
  );
}