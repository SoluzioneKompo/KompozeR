<script setup lang="ts">
/** Flag-button UI language switcher. Locale names stay untranslated by convention. */
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/locale';
import { setLocale } from '@/i18n';

const { locale } = useI18n();

const FLAGS: Record<SupportedLocale, string> = {
  it: '🇮🇹',
  en: '🇬🇧',
};

const LABELS: Record<SupportedLocale, string> = {
  it: 'Italiano',
  en: 'English',
};
</script>

<template>
  <div class="language-switcher" role="group" aria-label="Lingua / Language">
    <button
      v-for="code in SUPPORTED_LOCALES"
      :key="code"
      type="button"
      class="language-switcher__flag"
      :class="{ 'language-switcher__flag--active': locale === code }"
      :aria-label="LABELS[code]"
      :aria-pressed="locale === code"
      @click="setLocale(code)"
    >
      {{ FLAGS[code] }}
    </button>
  </div>
</template>

<style scoped>
.language-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.language-switcher__flag {
  font-size: var(--font-size-lg);
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  opacity: 0.45;
  transition: opacity var(--transition-fast);
}

.language-switcher__flag:hover {
  opacity: 0.8;
}

.language-switcher__flag--active {
  opacity: 1;
}
</style>
