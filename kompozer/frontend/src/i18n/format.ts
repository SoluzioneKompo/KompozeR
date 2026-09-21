/**
 * Locale-aware Intl helpers, driven by the active vue-i18n locale.
 * Existing call sites hardcode 'it-IT' — replace that literal with
 * `getIntlLocale()` so date/number formatting follows the UI language.
 */
import { i18n } from './index';

const INTL_LOCALE_MAP: Record<string, string> = {
  it: 'it-IT',
  en: 'en-GB',
};

export function getIntlLocale(): string {
  return INTL_LOCALE_MAP[i18n.global.locale.value] ?? 'it-IT';
}

export function formatCurrencyFromCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(getIntlLocale(), { style: 'currency', currency }).format(cents / 100);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getIntlLocale(), options).format(value);
}

export function formatDateTime(date: Date | string): string {
  return formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });
}
