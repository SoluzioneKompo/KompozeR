<script setup lang="ts">
/**
 * Payment view reached right after checkout. Lets the user pick PayPal or
 * card and start a payment attempt; the provider gateways are skeletons
 * (see paymentService backend), so a dev-only "Simula esito" button drives
 * the PENDING payment to COMPLETED/FAILED until real providers are wired.
 */
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePayment } from '@/composables/usePayment';
import type { PaymentMethod } from '@/types/payment';

const route = useRoute();
const router = useRouter();
const orderId = route.params.orderId as string;

const { order, payment, loading, payLoading, confirmLoading, error, load, pay, simulateOutcome } =
  usePayment();

onMounted(() => {
  void load(orderId);
});

const total = computed(() => order.value?.total ?? 0);

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function selectMethod(method: PaymentMethod): void {
  void pay(orderId, method);
}

function backToCatalog(): void {
  void router.push({ name: 'catalog' });
}
</script>

<template>
  <div class="view-container">
    <header class="payment-header">
      <h1>Pagamento</h1>
      <p class="subtitle">Ordine {{ orderId }}</p>
    </header>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">Caricamento ordine...</p>

    <div v-else class="layout">
      <section class="summary">
        <h2>Riepilogo</h2>
        <div class="summary-row">
          <span>Totale da pagare</span>
          <strong>{{ formatCurrency(total) }}</strong>
        </div>
      </section>

      <section class="payment-panel">
        <template v-if="!payment">
          <h2>Scegli metodo di pagamento</h2>
          <div class="method-grid">
            <button class="method-btn" :disabled="payLoading" @click="selectMethod('PAYPAL')">
              PayPal
            </button>
            <button class="method-btn" :disabled="payLoading" @click="selectMethod('CARD')">
              Carta di credito/debito
            </button>
          </div>
          <p v-if="payLoading" class="placeholder">Avvio pagamento...</p>
        </template>

        <template v-else>
          <h2>Stato pagamento</h2>
          <p class="method-label">Metodo: {{ payment.method === 'PAYPAL' ? 'PayPal' : 'Carta' }}</p>

          <p v-if="payment.status === 'PENDING'" class="status status--pending">
            In attesa di conferma dal provider ({{ payment.providerReference }}).
          </p>
          <p v-else-if="payment.status === 'COMPLETED'" class="status status--completed">
            Pagamento completato.
          </p>
          <p v-else class="status status--failed">
            Pagamento fallito<span v-if="payment.failureReason">: {{ payment.failureReason }}</span>.
          </p>

          <div v-if="payment.status === 'PENDING'" class="dev-actions">
            <p class="dev-note">
              Integrazione PayPal/Carta non ancora attiva: simula qui l'esito che il provider
              invierebbe.
            </p>
            <button
              class="btn btn--primary"
              :disabled="confirmLoading"
              @click="simulateOutcome('COMPLETED')"
            >
              Simula pagamento riuscito
            </button>
            <button
              class="btn btn--light"
              :disabled="confirmLoading"
              @click="simulateOutcome('FAILED')"
            >
              Simula pagamento fallito
            </button>
          </div>

          <button v-if="payment.status === 'COMPLETED'" class="btn btn--primary" @click="backToCatalog">
            Torna al catalogo
          </button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.view-container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: var(--space-1);
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

.layout {
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--space-6);
  align-items: start;
}

.summary,
.payment-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.summary-row {
  margin-top: var(--space-4);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.method-grid {
  margin-top: var(--space-4);
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.method-btn {
  flex: 1;
  min-width: 200px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  padding: var(--space-4);
  font-size: var(--font-size-base);
  cursor: pointer;
}

.method-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.method-label {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
}

.status {
  margin-top: var(--space-3);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.status--pending {
  color: var(--color-warning);
  background: var(--color-warning-subtle);
}

.status--completed {
  color: var(--color-success);
  background: var(--color-success-subtle);
}

.status--failed {
  color: var(--color-error);
  background: var(--color-error-subtle);
}

.dev-actions {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.dev-note {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.btn {
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn--primary {
  margin-top: var(--space-4);
  background: var(--color-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
