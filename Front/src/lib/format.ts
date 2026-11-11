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

const dateFormatter = new Intl.DateTimeFormat(MARKET.locale, {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}
