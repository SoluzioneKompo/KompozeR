<script setup lang="ts">
/** Admin orders board for status filtering and order state transitions. */
import { computed, onMounted, ref } from 'vue';
import { orderService } from '@/services/orderService';
import { useNotificationStore } from '@/store/notificationStore';
import type { Order, OrderStatus } from '@/types/order';
import { ApiError } from '@/types/api';

const notifications = useNotificationStore();

const items = ref<Order[]>([]);
const loading = ref(false);
const error = ref('');
const updatingOrderId = ref('');
const statusFilter = ref<OrderStatus | ''>('');
const orderToConfirmDone = ref<Order | null>(null);
const blockedActionMessage = ref('');

const filteredItems = computed(() => {
  if (!statusFilter.value) {
    return items.value;
  }
  return items.value.filter((order) => order.status === statusFilter.value);
});

const submittedCount = computed(() => items.value.filter((order) => order.status === 'SUBMITTED').length);
const doneCount = computed(() => items.value.filter((order) => order.status === 'DONE').length);
const cancelledCount = computed(() => items.value.filter((order) => order.status === 'CANCELLED').length);

onMounted(() => {
  void load();
});

/** Formats order totals from cents to localized euro string. */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Formats optional order timestamps, returning placeholder when absent. */
function formatDate(iso?: string): string {
  if (!iso) {
    return '-';
  }
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** Loads full order list used by status metrics and management actions. */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await orderService.list({ page: 1, limit: 100 });
    items.value = result.items;
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Errore caricamento ordini';
  } finally {
    loading.value = false;
  }
}

/** Transitions a submitted order to DONE status. */
async function markDone(order: Order): Promise<void> {
  updatingOrderId.value = order.id;
  try {
    const updated = await orderService.markDone(order.id);
    items.value = items.value.map((current) => (current.id === updated.id ? updated : current));
    notifications.addToast('success', 'Ordine marcato come DONE');
    orderToConfirmDone.value = null;
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'Errore aggiornamento stato ordine';
    notifications.addToast('error', msg);
  } finally {
    updatingOrderId.value = '';
  }
}

/** Transitions a submitted order to CANCELLED status. */
async function markCancelled(order: Order): Promise<void> {
  updatingOrderId.value = order.id;
  try {
    const updated = await orderService.markCancelled(order.id);
    items.value = items.value.map((current) => (current.id === updated.id ? updated : current));
    notifications.addToast('success', 'Ordine marcato come CANCELLED');
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'Errore aggiornamento stato ordine';
    notifications.addToast('error', msg);
  } finally {
    updatingOrderId.value = '';
  }
}

/** Applies status filter used by table and KPI highlighting. */
function setStatusFilter(status: OrderStatus | ''): void {
  statusFilter.value = status;
}

/** Opens confirmation modal for DONE transition. */
function openDoneConfirmation(order: Order): void {
  orderToConfirmDone.value = order;
}

/** Closes DONE confirmation modal without changing order state. */
function closeDoneConfirmation(): void {
  orderToConfirmDone.value = null;
}

/** Confirms DONE transition for currently selected order. */
function confirmMarkDone(): void {
  if (!orderToConfirmDone.value) {
    return;
  }
  void markDone(orderToConfirmDone.value);
}

/** Closes informational modal for blocked state transitions. */
function closeBlockedActionModal(): void {
  blockedActionMessage.value = '';
}

/** Guards DONE transition requests to submitted orders only. */
function requestMarkDone(order: Order): void {
  if (order.status !== 'SUBMITTED') {
    blockedActionMessage.value = `Operazione non consentita: ordine in stato ${order.status}.`;
    return;
  }
  openDoneConfirmation(order);
}

/** Guards CANCELLED transition requests to submitted orders only. */
function requestMarkCancelled(order: Order): void {
  if (order.status !== 'SUBMITTED') {
    blockedActionMessage.value = `Operazione non consentita: ordine in stato ${order.status}.`;
    return;
  }
  void markCancelled(order);
}
</script>

<template>
  <div class="view-container">
    <header class="header">
      <div>
        <h1>Gestione ordini</h1>
        <p class="subtitle">Controlla gli ordini e avanzali allo stato DONE</p>
      </div>
      <button class="btn btn--light" :disabled="loading" @click="load">Aggiorna</button>
    </header>

    <section class="metrics">
      <article
        :class="['metric-card', { 'metric-card--active': statusFilter === '' }]"
        role="button"
        tabindex="0"
        @click="setStatusFilter('')"
        @keydown.enter.prevent="setStatusFilter('')"
        @keydown.space.prevent="setStatusFilter('')"
      >
        <span class="metric-label">Totali</span>
        <strong class="metric-value">{{ items.length }}</strong>
      </article>
      <article
        :class="['metric-card', { 'metric-card--active': statusFilter === 'SUBMITTED' }]"
        role="button"
        tabindex="0"
        @click="setStatusFilter('SUBMITTED')"
        @keydown.enter.prevent="setStatusFilter('SUBMITTED')"
        @keydown.space.prevent="setStatusFilter('SUBMITTED')"
      >
        <span class="metric-label">SUBMITTED</span>
        <strong class="metric-value">{{ submittedCount }}</strong>
      </article>
      <article
        :class="['metric-card', { 'metric-card--active': statusFilter === 'DONE' }]"
        role="button"
        tabindex="0"
        @click="setStatusFilter('DONE')"
        @keydown.enter.prevent="setStatusFilter('DONE')"
        @keydown.space.prevent="setStatusFilter('DONE')"
      >
        <span class="metric-label">DONE</span>
        <strong class="metric-value">{{ doneCount }}</strong>
      </article>
      <article
        :class="['metric-card', { 'metric-card--active': statusFilter === 'CANCELLED' }]"
        role="button"
        tabindex="0"
        @click="setStatusFilter('CANCELLED')"
        @keydown.enter.prevent="setStatusFilter('CANCELLED')"
        @keydown.space.prevent="setStatusFilter('CANCELLED')"
      >
        <span class="metric-label">CANCELLED</span>
        <strong class="metric-value">{{ cancelledCount }}</strong>
      </article>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">Caricamento ordini...</p>
    <p v-else-if="filteredItems.length === 0" class="placeholder">Nessun ordine per il filtro selezionato.</p>

    <section v-else class="list">
      <article class="order" v-for="order in filteredItems" :key="order.id">
        <div class="order__top">
          <div>
            <h2>Ordine</h2>
          </div>
          <span :class="['status', order.status.toLowerCase()]">{{ order.status }}</span>
        </div>

        <div class="order__grid">
          <div>
            <span class="label">Totale</span>
            <strong>{{ formatCurrency(order.total) }}</strong>
          </div>
          <div>
            <span class="label">Articoli</span>
            <strong>{{ order.items.length }}</strong>
          </div>
          <div>
            <span class="label">Sottomesso</span>
            <strong>{{ formatDate(order.submittedAt) }}</strong>
          </div>
          <div>
            <span class="label">Completato</span>
            <strong>{{ formatDate(order.doneAt) }}</strong>
          </div>
        </div>

        <div class="order__expedition" v-if="order.expeditionInfo">
          <p class="items-title">Dati spedizione</p>
          <div class="order__expedition-grid">
            <p><strong>Nome:</strong> {{ order.expeditionInfo.name }} {{ order.expeditionInfo.surname }}</p>
            <p><strong>Email:</strong> {{ order.expeditionInfo.mail }}</p>
            <p><strong>Telefono:</strong> {{ order.expeditionInfo.phone }}</p>
            <p><strong>Nazione:</strong> {{ order.expeditionInfo.nation }}</p>
            <p><strong>Citta:</strong> {{ order.expeditionInfo.city }}</p>
            <p><strong>CAP:</strong> {{ order.expeditionInfo.cap }}</p>
            <p class="order__expedition-address"><strong>Indirizzo:</strong> {{ order.expeditionInfo.address }}</p>
            <p class="order__expedition-address">
              <strong>Note consegna:</strong>
              {{ order.expeditionInfo.deliveryNotes?.trim() ? order.expeditionInfo.deliveryNotes : '-' }}
            </p>
          </div>
        </div>

        <div class="order__items">
          <p class="items-title">Dettaglio articoli</p>
          <ul>
            <li v-for="item in order.items" :key="`${order.id}-${item.sku}`">
              {{ item.name }} ({{ item.sku }}) x{{ item.quantity }} · {{ formatCurrency(item.unitPrice) }}
            </li>
          </ul>
        </div>

        <div class="order__actions">
          <button
            class="btn btn--primary"
            :disabled="updatingOrderId === order.id"
            @click="requestMarkDone(order)"
          >
            {{ updatingOrderId === order.id ? 'Aggiornamento...' : 'Segna come DONE' }}
          </button>
          <button
            class="btn btn--danger"
            :disabled="updatingOrderId === order.id"
            @click="requestMarkCancelled(order)"
          >
            {{ updatingOrderId === order.id ? 'Aggiornamento...' : 'Segna come CANCELLED' }}
          </button>
        </div>
      </article>
    </section>

    <div v-if="orderToConfirmDone" class="modal-backdrop" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="done-confirm-title">
        <h2 id="done-confirm-title" class="modal__title">Conferma aggiornamento</h2>
        <p class="modal__text">Vuoi segnare questo ordine come DONE?</p>
        <div class="modal__actions">
          <button class="btn btn--light" type="button" @click="closeDoneConfirmation">Annulla</button>
          <button class="btn btn--primary" type="button" :disabled="updatingOrderId === orderToConfirmDone.id" @click="confirmMarkDone">
            Conferma
          </button>
        </div>
      </div>
    </div>

    <div v-if="blockedActionMessage" class="modal-backdrop" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="blocked-action-title">
        <h2 id="blocked-action-title" class="modal__title">Operazione non disponibile</h2>
        <p class="modal__text">{{ blockedActionMessage }}</p>
        <div class="modal__actions">
          <button class="btn btn--primary" type="button" @click="closeBlockedActionModal">Chiudi</button>
        </div>
      </div>
    </div>
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

.metrics {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: var(--space-3);
}

.metric-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.metric-card:hover,
.metric-card:focus-visible {
  border-color: var(--color-admin-accent);
}

.metric-card--active {
  border-color: var(--color-admin-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-admin-accent) 30%, transparent);
}

.metric-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.metric-value {
  font-size: var(--font-size-xl);
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
  margin-top: var(--space-4);
  color: var(--color-text-muted);
}

.list {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.order {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.order__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}

.status {
  font-size: var(--font-size-xs);
  border-radius: var(--radius-full);
  padding: 2px 10px;
}

.status.submitted {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.status.done {
  background: var(--color-success-subtle);
  color: var(--color-success);
}

.status.cancelled {
  background: var(--color-error-subtle);
  color: var(--color-error);
}

.order__grid {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: var(--space-3);
}

.label {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  margin-bottom: 2px;
}

.order__items {
  margin-top: var(--space-3);
}

.order__expedition {
  margin-top: var(--space-3);
}

.order__expedition-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.order__expedition-grid p {
  margin: 0;
}

.order__expedition-address {
  grid-column: 1 / -1;
}

.items-title {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-1);
}

.order__items ul {
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.order__actions {
  margin-top: var(--space-4);
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.btn {
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-admin-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.btn--danger {
  background: var(--color-error-subtle);
  color: var(--color-error);
  border: 1px solid #f0cccc;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgb(15 23 42 / 0.45);
  z-index: 120;
}

.modal {
  width: min(420px, 100%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-md);
}

.modal__title {
  margin: 0;
  font-size: var(--font-size-xl);
}

.modal__text {
  margin: var(--space-3) 0 var(--space-5);
  color: var(--color-text-secondary);
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1000px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

  .order__grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .order__grid {
    grid-template-columns: 1fr;
  }

  .order__expedition-grid {
    grid-template-columns: 1fr;
  }
}
</style>
