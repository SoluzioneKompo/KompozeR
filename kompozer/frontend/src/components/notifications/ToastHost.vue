<script setup lang="ts">
/** Global toast presenter that renders notification store messages via Teleport. */
import { useI18n } from 'vue-i18n';
import { useNotificationStore } from '@/store/notificationStore';

const store = useNotificationStore();
const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in store.toasts"
          :key="toast.id"
          :class="['toast', `toast--${toast.type}`]"
          role="alert"
        >
          {{ toast.message }}
          <button class="toast__close" @click="store.removeToast(toast.id)" :aria-label="t('notifications.toastHost.close')">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  pointer-events: auto;
  min-width: 240px;
  max-width: 360px;
}

.toast--success { border-left: 4px solid var(--color-success); }
.toast--error   { border-left: 4px solid var(--color-error); }
.toast--warning { border-left: 4px solid var(--color-warning); }
.toast--info    { border-left: 4px solid var(--color-accent); }

.toast__close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  cursor: pointer;
}

.toast-enter-active, .toast-leave-active { transition: all var(--transition-base); }
.toast-enter-from { opacity: 0; transform: translateX(20px); }
.toast-leave-to   { opacity: 0; transform: translateX(20px); }
</style>
