/** Manages notification list state, unread counters, and mark-as-read actions. */
import { computed, ref } from 'vue';
import { notificationService } from '@/services/notificationService';
import { useNotificationStore } from '@/store/notificationStore';
import type { Notification } from '@/types/notification';
import { ApiError } from '@/types/api';
import { i18n } from '@/i18n';

export function useNotifications() {
  const items = ref<Notification[]>([]);
  const loading = ref(false);
  const error = ref('');

  const unreadOnly = ref(false);
  const page = ref(1);
  const limit = ref(20);
  const total = ref(0);
  const totalPages = ref(1);

  const canPrev = computed(() => page.value > 1);
  const canNext = computed(() => page.value < totalPages.value);

  const notifications = useNotificationStore();

  /** Fetches paginated notifications and refreshes the global unread counter. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const response = await notificationService.list({
        unread: unreadOnly.value,
        page: page.value,
        limit: limit.value,
      });
      items.value = response.items;
      total.value = response.total;
      totalPages.value = response.totalPages ?? Math.max(1, Math.ceil(response.total / response.limit));
      await notifications.refreshUnreadCount();
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : i18n.global.t('notifications.errors.loadFailed');
    } finally {
      loading.value = false;
    }
  }

  /** Marks a single notification as read via store, updating local state and badge. */
  async function markAsRead(item: Notification): Promise<void> {
    if (item.read) {
      return;
    }
    try {
      await notifications.markRead(item);
      item.read = true;
      item.readAt = new Date().toISOString();
      notifications.addToast('success', i18n.global.t('notifications.toast.markedAsRead'));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : i18n.global.t('notifications.errors.updateFailed');
      notifications.addToast('error', msg);
    }
  }

  /** Toggles unread-only filter and reloads from page 1. */
  async function setUnreadOnly(value: boolean): Promise<void> {
    unreadOnly.value = value;
    page.value = 1;
    await load();
  }

  /** Advances to the next notification page when available. */
  async function nextPage(): Promise<void> {
    if (!canNext.value) {
      return;
    }
    page.value += 1;
    await load();
  }

  /** Returns to the previous notification page when available. */
  async function prevPage(): Promise<void> {
    if (!canPrev.value) {
      return;
    }
    page.value -= 1;
    await load();
  }

  return {
    items,
    loading,
    error,
    unreadOnly,
    page,
    total,
    totalPages,
    canPrev,
    canNext,
    load,
    markAsRead,
    setUnreadOnly,
    nextPage,
    prevPage,
  };
}
