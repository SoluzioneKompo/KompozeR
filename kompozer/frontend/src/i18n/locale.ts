/**
 * Supported UI locales, browser-language detection, and persistence.
 * Detection order: explicit user choice (localStorage) > browser language > 'it' default.
 */
export const SUPPORTED_LOCALES = ['it', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = 'kompozer-locale';
const DEFAULT_LOCALE: SupportedLocale = 'it';

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function detectInitialLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fall through to browser detection.
  }

  const browserLangs =
    navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];

  for (const lang of browserLangs) {
    const short = lang.slice(0, 2).toLowerCase();
    if (isSupportedLocale(short)) {
      return short;
    }
  }

  return DEFAULT_LOCALE;
}

export function persistLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore — persistence is a nice-to-have, not a hard requirement.
  }
}
