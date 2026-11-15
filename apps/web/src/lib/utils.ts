import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Months from start to end inclusive, wrapping the year (10 → 2 = Oct..Feb). */
export function monthRange(start: number, end: number): number[] {
  const out: number[] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === end) break;
    m = (m % 12) + 1;
  }
  return out;
}

export function monthName(m: number, locale = 'en', style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(locale, { month: style }).format(new Date(2024, m - 1, 1));
}

export function formatNumber(v: number | null | undefined, locale = 'en', digits = 0) {
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function formatDate(iso: string | null | undefined, locale = 'en') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function listMonths(months: number[], locale = 'en') {
  return months.map((m) => monthName(m, locale)).join(', ');
}
