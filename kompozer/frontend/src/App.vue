<script setup lang="ts">
/** Root shell that wires auth-aware realtime notifications and global layout. */
import { onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterView } from 'vue-router';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useCartStore } from '@/store/cartStore';
import { notificationSocket } from '@/services/notificationSocket';
import type { Notification } from '@/types/notification';
import AppHeader from '@/components/layout/AppHeader.vue';
import ToastHost from '@/components/notifications/ToastHost.vue';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

const { t } = useI18n();
const auth = useAuthStore();
const notifications = useNotificationStore();
const cart = useCartStore();
let removeNotificationPushListener: (() => void) | null = null;
let removeConnectionRestoredListener: (() => void) | null = null;

/** Rebinds realtime listeners whenever authentication state changes. */
watch(
  () => auth.isLoggedIn,
  async (isLoggedIn) => {
    if (removeNotificationPushListener) {
      removeNotificationPushListener();
      removeNotificationPushListener = null;
    }
    if (removeConnectionRestoredListener) {
      removeConnectionRestoredListener();
      removeConnectionRestoredListener = null;
    }
    notificationSocket.disconnect();

    if (!isLoggedIn) {
      return;
    }

    await Promise.all([notifications.refreshUnreadCount(), cart.refreshItemCount()]);

    removeConnectionRestoredListener = notificationSocket.onConnectionRestored(() => {
      void Promise.all([notifications.refreshUnreadCount(), cart.refreshItemCount()]);
      notifications.addToast('info', t('layout.realtime.reconnected'));
    });

    removeNotificationPushListener = notificationSocket.onPush((payload) => {
      const pushed = payload.data?.notification;
      if (!pushed) {
        return;
      }

      const notification: Notification = {
        id: pushed.id,
        userId: auth.user?.id ?? '',
        type: pushed.type,
        title: pushed.title,
        sku: pushed.target?.targetId ?? '',
        message: pushed.message,
        contextType: pushed.target?.scope,
        contextId: pushed.target?.targetId,
        read: pushed.read,
        createdAt: pushed.createdAt,
      };

      notifications.applyRealtimePush(notification);
      notifications.addToast('warning', notification.message);

      if (notification.type === 'AVAILABILITY_CHANGED') {
        void cart.refreshItemCount();
      }
    });
  },
  { immediate: true },
);

/** Clears socket listeners and closes connection when the root view is destroyed. */
onUnmounted(() => {
  removeNotificationPushListener?.();
  removeConnectionRestoredListener?.();
  removeNotificationPushListener = null;
  removeConnectionRestoredListener = null;
  notificationSocket.disconnect();
});
</script>

<template>
  <div class="app-shell">
    <AppHeader v-if="auth.isLoggedIn" />
    <LanguageSwitcher v-else class="app-shell__language-switcher" />
    <main class="app-content" :class="{ 'app-content--no-header': !auth.isLoggedIn }">
      <RouterView />
    </main>
    <ToastHost />
  </div>
</template>

<style>
.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-content {
  flex: 1;
  padding-top: var(--header-height);
}

.app-content--no-header {
  padding-top: 0;
}

.app-shell__language-switcher {
  position: fixed;
  top: var(--space-3);
  right: var(--space-3);
  z-index: 100;
}
</style>
