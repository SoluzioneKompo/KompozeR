/**
 * i18n setup. Messages are assembled from per-domain fragment files
 * (locales/<lang>/<domain>.json) so different areas of the app can be
 * translated independently without every change touching one giant file.
 */
import { createI18n } from 'vue-i18n';
import { detectInitialLocale, persistLocale, type SupportedLocale } from './locale';

import itLayout from './locales/it/layout.json';
import itAuth from './locales/it/auth.json';
import itCart from './locales/it/cart.json';
import itCatalog from './locales/it/catalog.json';
import itConfigurations from './locales/it/configurations.json';
import itNotifications from './locales/it/notifications.json';
import itPayment from './locales/it/payment.json';
import itAdmin from './locales/it/admin.json';
import itCad from './locales/it/cad.json';

import enLayout from './locales/en/layout.json';
import enAuth from './locales/en/auth.json';
import enCart from './locales/en/cart.json';
import enCatalog from './locales/en/catalog.json';
import enConfigurations from './locales/en/configurations.json';
import enNotifications from './locales/en/notifications.json';
import enPayment from './locales/en/payment.json';
import enAdmin from './locales/en/admin.json';
import enCad from './locales/en/cad.json';

const messages = {
  it: {
    layout: itLayout,
    auth: itAuth,
    cart: itCart,
    catalog: itCatalog,
    configurations: itConfigurations,
    notifications: itNotifications,
    payment: itPayment,
    admin: itAdmin,
    cad: itCad,
  },
  en: {
    layout: enLayout,
    auth: enAuth,
    cart: enCart,
    catalog: enCatalog,
    configurations: enConfigurations,
    notifications: enNotifications,
    payment: enPayment,
    admin: enAdmin,
    cad: enCad,
  },
};

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'it',
  messages,
});

/** Switches the active UI language, persists the choice, and syncs <html lang>. */
export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  persistLocale(locale);
  document.documentElement.lang = locale;
}

document.documentElement.lang = i18n.global.locale.value;
