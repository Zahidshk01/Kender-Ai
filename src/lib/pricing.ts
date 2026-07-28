/**
 * Localised Pro pricing. The user's country is detected from their browser
 * timezone (with a locale-region fallback); anything outside the list below
 * falls back to USD.
 */

export type PriceInfo = {
  code: string;
  symbol: string;
  /** true → no decimal places (JPY, KRW, INR-style whole numbers) */
  whole: boolean;
  monthly: number;
  yearly: number;
  /** space between symbol and amount, e.g. "AED 44.99" */
  space?: boolean;
};

const PRICES: Record<string, PriceInfo> = {
  IN: { code: "INR", symbol: "₹", whole: true, monthly: 999, yearly: 8999 },
  US: { code: "USD", symbol: "$", whole: false, monthly: 11.99, yearly: 107.99 },
  CA: { code: "CAD", symbol: "CA$", whole: false, monthly: 15.99, yearly: 143.99 },
  GB: { code: "GBP", symbol: "£", whole: false, monthly: 8.99, yearly: 80.99 },
  EU: { code: "EUR", symbol: "€", whole: false, monthly: 10.99, yearly: 98.99 },
  AU: { code: "AUD", symbol: "AU$", whole: false, monthly: 17.99, yearly: 161.99 },
  NZ: { code: "NZD", symbol: "NZ$", whole: false, monthly: 19.99, yearly: 179.99 },
  JP: { code: "JPY", symbol: "¥", whole: true, monthly: 1690, yearly: 15290 },
  KR: { code: "KRW", symbol: "₩", whole: true, monthly: 15900, yearly: 143000 },
  SG: { code: "SGD", symbol: "S$", whole: false, monthly: 14.99, yearly: 134.99 },
  AE: { code: "AED", symbol: "AED", whole: false, monthly: 44.99, yearly: 404.99, space: true },
  SA: { code: "SAR", symbol: "SAR", whole: false, monthly: 44.99, yearly: 404.99, space: true },
  BR: { code: "BRL", symbol: "R$", whole: false, monthly: 59.99, yearly: 539.99 },
  MX: { code: "MXN", symbol: "MX$", whole: true, monthly: 219, yearly: 1969 },
};

/** Eurozone countries share the EUR pricing row. */
const EURO_COUNTRIES = [
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
];

/** Minimal timezone → country map covering the supported price rows. */
const TZ_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Singapore": "SG",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Vienna": "AT",
  "Europe/Lisbon": "PT",
  "Europe/Helsinki": "FI",
  "Europe/Athens": "GR",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
  "America/Sao_Paulo": "BR",
  "America/Mexico_City": "MX",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
};

function normalize(country: string | undefined): string {
  if (!country) return "US";
  if (PRICES[country]) return country;
  if (EURO_COUNTRIES.includes(country)) return "EU";
  return "US";
}

export function detectCountry(): string {
  if (typeof window === "undefined") return "US";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      const fromTz = TZ_COUNTRY[tz];
      if (fromTz) return normalize(fromTz);
      if (tz.startsWith("Europe/")) return "EU";
      if (tz.startsWith("Australia/")) return "AU";
    }
  } catch {
    /* ignore */
  }
  try {
    const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of locales) {
      const region = new Intl.Locale(l).maximize().region;
      if (region && (PRICES[region] || EURO_COUNTRIES.includes(region))) return normalize(region);
    }
  } catch {
    /* ignore */
  }
  return "US";
}

export function getPricing(country = detectCountry()): PriceInfo {
  return PRICES[normalize(country)] ?? PRICES.US;
}

export function formatPrice(p: PriceInfo, amount: number): string {
  const value = p.whole
    ? Math.round(amount).toLocaleString("en-US")
    : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${p.symbol}${p.space ? " " : ""}${value}`;
}

/** Per-day equivalent, e.g. "₹32.85 / day". */
export function perDay(p: PriceInfo, plan: "monthly" | "yearly"): string {
  const raw = plan === "yearly" ? p.yearly / 365 : p.monthly / 30.4;
  const value = p.whole
    ? Math.round(raw).toLocaleString("en-US")
    : raw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${p.symbol}${p.space ? " " : ""}${value} / day`;
}

export function yearlyDiscount(p: PriceInfo): number {
  return Math.round((1 - p.yearly / (p.monthly * 12)) * 100);
}
