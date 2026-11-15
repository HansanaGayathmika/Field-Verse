import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from './en.json';

/**
 * The recommendation UI keeps its strings in its own "recommend" namespace, registered here,
 * so the app's existing translation files are not touched. To add a language later
 * (Sinhala, Tamil, Swahili, Portuguese): add e.g. ./si.json and register it the same way.
 * Engine text (benefit text, notes, warnings) arrives in English for now and is shown as sent.
 */
export const NS = 'recommend';
if (!i18n.hasResourceBundle('en', NS)) i18n.addResourceBundle('en', NS, en, true, true);

export const useRT = () => useTranslation(NS);

/** Locale-aware month names (1–12). */
export function monthName(m: number, style: 'long' | 'short' = 'long', locale = i18n.language || 'en') {
  return new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, m - 1, 1)));
}
