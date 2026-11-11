import { MARKET } from "@/config/market.config";

const numberFormatter = new Intl.NumberFormat(MARKET.locale, {
  style: "currency",
  currency: MARKET.currency,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return numberFormatter.format(value);
}
