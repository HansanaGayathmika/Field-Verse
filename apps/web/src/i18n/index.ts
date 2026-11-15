import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

/**
 * Only English is complete. Other languages are registered so the structure is ready,
 * but they are NOT offered as complete until reviewed by native speakers.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', status: 'complete' },
  { code: 'si', name: 'සිංහල (Sinhala)', status: 'planned' },
  { code: 'ta', name: 'தமிழ் (Tamil)', status: 'planned' },
  { code: 'pt', name: 'Português', status: 'planned' },
  { code: 'sw', name: 'Kiswahili', status: 'planned' },
] as const;

let saved: string | null = null;
try {
  saved = localStorage.getItem('fv.lang');
} catch {
  /* storage unavailable */
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: saved && LANGUAGES.some((l) => l.code === saved && l.status === 'complete') ? saved : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  showSupportNotice: false,
});

export default i18n;
