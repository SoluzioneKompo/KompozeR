<script setup lang="ts">
/** Notifications inbox view with unread filtering and pagination controls. */
import { onMounted } from 'vue';
import type { NotificationType } from '@/types/notification';
import { useNotifications } from '@/composables/useNotifications';

const {
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
} = useNotifications();

onMounted(() => {
  void load();
});

/** Formats notification creation timestamps for list rendering. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** Converts notification type codes to localized labels. */
function typeLabel(type: NotificationType): string {
  if (type === 'PRICE_CHANGED') {
    return 'Prezzo aggiornato';
  }
  return 'Disponibilita aggiornata';
}
</script>

<template>
  <div class="view-container">
    <header class="header">
      <div>
        <h1>Notifiche</h1>
        <p class="subtitle">Aggiornamenti su prezzo e disponibilita dei componenti</p>
      </div>
      <button class="btn btn--light" :disabled="loading" @click="load">Aggiorna</button>
    </header>

    <section class="toolbar">
      <label class="toggle">
        <input
          :checked="unreadOnly"
          type="checkbox"
          @change="setUnreadOnly(($event.target as HTMLInputElement).checked)"
        />
        Solo non lette
      </label>
      <span class="meta">{{ total }} notifiche</span>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">Caricamento notifiche...</p>
    <p v-else-if="items.length === 0" class="placeholder">Nessuna notifica da mostrare.</p>

    <section v-else class="list">
      <article v-for="item in items" :key="item.id" :class="['card', { 'card--unread': !item.read }]">
        <div class="card__top">
          <span class="chip">{{ typeLabel(item.type) }}</span>
          <span class="date">{{ formatDate(item.createdAt) }}</span>
        </div>

        <h2 class="title">{{ item.title || 'Aggiornamento componente' }}</h2>
        <p class="message">{{ item.message }}</p>

        <div class="card__bottom">
          <span class="sku">SKU: {{ item.sku }}</span>
          <button
            v-if="!item.read"
            class="btn btn--primary"
            @click="markAsRead(item)"
          >
            Segna come letta
          </button>
          <span v-else class="read-badge">Letta</span>
        </div>
      </article>
    </section>

    <footer class="pagination" v-if="totalPages > 1">
      <button class="btn btn--light" :disabled="!canPrev || loading" @click="prevPage">Precedente</button>
      <span>Pagina {{ page }} di {{ totalPages }}</span>
      <button class="btn btn--light" :disabled="!canNext || loading" @click="nextPage">Successiva</button>
    </footer>
  </div>
</template>

<style scoped>
.view-container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.toolbar {
  margin-top: var(--space-5);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
}

.meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.error {
  margin-top: var(--space-4);
  color: var(--color-error);
  background: var(--color-error-subtle);
  border: 1px solid #f0cccc;
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.placeholder {
  color: var(--color-text-muted);
  margin-top: var(--space-4);
}

.list {
  margin-top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.card--unread {
  border-color: var(--color-text-muted);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.chip {
  font-size: var(--font-size-xs);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  border-radius: var(--radius-full);
  padding: 2px 8px;
}

.date {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.title {
  margin-top: var(--space-2);
  font-size: var(--font-size-base);
}

.message {
  margin-top: var(--space-1);
  color: var(--color-text-secondary);
}

.card__bottom {
  margin-top: var(--space-4);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.sku {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.read-badge {
  color: var(--color-success);
  font-size: var(--font-size-sm);
}

.pagination {
  margin-top: var(--space-5);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-4);
}

.btn {
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn--primary {
  background: var(--color-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}
</style>
