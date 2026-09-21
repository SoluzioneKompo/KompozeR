<script setup lang="ts">
/** Main application header with role-based navigation and live badge counters. */
import { computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useCartStore } from '@/store/cartStore';
import appLogo from '@/assets/images/kompozer-logo.png';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

const { t } = useI18n();

const auth = useAuthStore();
const notifications = useNotificationStore();
const cart = useCartStore();
const router = useRouter();

// Polling badge: aggiorna il contatore non lette ogni 30 secondi senza
// che l'utente debba aprire la pagina notifiche.
const POLL_INTERVAL_MS = 30_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // Prima chiamata immediata all'avvio
  void Promise.all([notifications.refreshUnreadCount(), cart.refreshItemCount()]);
  pollTimer = setInterval(
    () => void Promise.all([notifications.refreshUnreadCount(), cart.refreshItemCount()]),
    POLL_INTERVAL_MS,
  );
});

onUnmounted(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

const navLinks = computed(() => {
  if (auth.isAdmin) {
    return [
      { name: 'catalog', label: t('layout.nav.catalog') },
      { name: 'admin-catalog', label: t('layout.nav.adminCatalog') },
      { name: 'configurations', label: t('layout.nav.configurations') },
      { name: 'cad', label: t('layout.nav.cad') },
      { name: 'admin-orders', label: t('layout.nav.adminOrders') },
      { name: 'admin-reports', label: t('layout.nav.adminReports') },
    ];
  }

  if (auth.isGuest) {
    return [
      { name: 'cad', label: t('layout.nav.cad') },
    ];
  }

  return [
    { name: 'configurations', label: t('layout.nav.configurations') },
    { name: 'cad', label: t('layout.nav.cad') },
  ];
});

const homeRoute = computed(() => ({ name: auth.homeRouteName }));

async function logout(): Promise<void> {
  auth.logout();
  await router.push({ name: 'auth' });
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink :to="homeRoute" class="app-header__logo">
        <img :src="appLogo" alt="KompozeR" class="app-header__logo-image" />
      </RouterLink>

      <nav class="app-header__nav">
        <RouterLink
          v-for="link in navLinks"
          :key="link.name"
          :to="{ name: link.name }"
          class="app-header__nav-link"
          active-class="app-header__nav-link--active"
        >
          {{ link.label }}
        </RouterLink>
      </nav>

      <div class="app-header__actions">
        <LanguageSwitcher />

        <RouterLink
          :to="{ name: 'cart' }"
          class="app-header__icon-link"
          :aria-label="t('layout.actions.cartAriaLabel')"
        >
          🛒
          <span v-if="cart.itemCount > 0" class="app-header__badge">
            {{ cart.itemCount }}
          </span>
        </RouterLink>

        <RouterLink
          v-if="auth.isLoggedIn"
          :to="{ name: 'notifications' }"
          class="app-header__icon-link app-header__bell"
          :aria-label="t('layout.actions.notificationsAriaLabel')"
        >
          🔔
          <span v-if="notifications.unreadCount > 0" class="app-header__badge">
            {{ notifications.unreadCount }}
          </span>
        </RouterLink>

        <span class="app-header__user">
          {{ auth.isGuest ? t('layout.actions.guest') : auth.user?.username }}
        </span>

        <button
          class="app-header__logout"
          :aria-label="t('layout.actions.logoutAriaLabel')"
          @click="logout"
        >
          {{ t('layout.actions.logout') }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  z-index: 100;
}

.app-header__inner {
  max-width: var(--content-max-width);
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 0 var(--space-6);
}

.app-header__logo {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.app-header__logo-image {
  height: 34px;
  width: auto;
  display: block;
}

.app-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 1;
}

.app-header__nav-link {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast);
}

.app-header__nav-link:hover,
.app-header__nav-link--active {
  color: var(--color-accent);
}

.app-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.app-header__icon-link {
  position: relative;
  font-size: var(--font-size-lg);
  text-decoration: none;
  color: var(--color-text-secondary);
  line-height: 1;
}

.app-header__icon-link:hover,
.app-header__icon-link.router-link-active,
.app-header__icon-link.router-link-exact-active {
  color: var(--color-accent);
}

.app-header__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  background: var(--color-error);
  color: #fff;
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  min-width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}

.app-header__user {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.app-header__logout {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.app-header__logout:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

@media (max-width: 1180px) {
  .app-header__inner {
    gap: var(--space-3);
    padding: 0 var(--space-4);
  }

  .app-header__nav {
    gap: var(--space-2);
  }

  .app-header__actions {
    gap: var(--space-3);
  }
}

@media (max-width: 900px) {
  .app-header {
    height: auto;
  }

  .app-header__inner {
    flex-wrap: wrap;
    padding: var(--space-2) var(--space-4);
  }

  .app-header__nav {
    order: 3;
    flex: 0 0 100%;
    overflow-x: auto;
    white-space: nowrap;
    padding-bottom: 2px;
  }
}

@media (max-width: 640px) {
  .app-header__user {
    display: none;
  }

  .app-header__actions {
    gap: var(--space-2);
  }
}
</style>
