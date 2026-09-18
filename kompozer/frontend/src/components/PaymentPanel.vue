<script setup lang="ts">
/**
 * Payment panel for a single order. Reused both as a standalone route
 * (PaymentView.vue) and inline in a popup (CartView.vue checkout flow).
 */
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePayment } from '@/composables/usePayment';
import { formatCurrencyFromCents } from '@/i18n/format';
import type { PaymentMethod } from '@/types/payment';

const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();

const {
  order,
  payment,
  loading,
  payLoading,
  confirmLoading,
  cancelLoading,
  error,
  load,
  pay,
  retryPayment,
  cancelOrder,
  simulateOutcome,
} = usePayment();

onMounted(() => {
  void load(props.orderId);
});

const total = computed(() => order.value?.total ?? 0);
const isCancelled = computed(() => order.value?.status === 'CANCELLED');

function formatCurrency(cents: number): string {
  return formatCurrencyFromCents(cents);
}

function selectMethod(method: PaymentMethod): void {
  void pay(props.orderId, method);
}

async function requestCancelOrder(): Promise<void> {
  await cancelOrder(props.orderId);
}
</script>

<template>
  <div class="payment-panel-root">
    <header class="payment-header">
      <h2>{{ t('payment.title') }}</h2>
      <p class="subtitle">{{ t('payment.orderLabel', { orderId }) }}</p>
    </header>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">{{ t('payment.loadingOrder') }}</p>

    <div v-else-if="isCancelled" class="cancelled-block">
      <h3>{{ t('payment.cancelled.title') }}</h3>
      <p>{{ t('payment.cancelled.message') }}</p>
      <button class="btn btn--primary" @click="emit('done')">{{ t('payment.backToCatalog') }}</button>
    </div>

    <div v-else class="layout">
      <section class="summary">
        <h3>{{ t('payment.summary.title') }}</h3>
        <div class="summary-row">
          <span>{{ t('payment.summary.totalDue') }}</span>
          <strong>{{ formatCurrency(total) }}</strong>
        </div>
      </section>

      <section class="payment-panel">
        <template v-if="!payment">
          <h3>{{ t('payment.methods.title') }}</h3>
          <div class="method-grid">
            <button class="method-btn" :disabled="payLoading" @click="selectMethod('PAYPAL')">
              {{ t('payment.methods.paypal') }}
            </button>
            <button class="method-btn" :disabled="payLoading" @click="selectMethod('CARD')">
              {{ t('payment.methods.card') }}
            </button>
          </div>
          <p v-if="payLoading" class="placeholder">{{ t('payment.methods.starting') }}</p>
          <button
            class="btn btn--light cancel-order-btn"
            :disabled="payLoading || cancelLoading"
            @click="requestCancelOrder"
          >
            {{ cancelLoading ? t('payment.actions.cancelling') : t('payment.actions.cancelOrder') }}
          </button>
        </template>

        <template v-else>
          <h3>{{ t('payment.status.title') }}</h3>
          <p class="method-label">
            {{
              t('payment.status.methodLabel', {
                method: payment.method === 'PAYPAL' ? t('payment.methods.paypal') : t('payment.status.methodCard'),
              })
            }}
          </p>

          <p v-if="payment.status === 'PENDING'" class="status status--pending">
            {{ t('payment.status.pending', { reference: payment.providerReference }) }}
          </p>
          <p v-else-if="payment.status === 'COMPLETED'" class="status status--completed">
            {{ t('payment.status.completed') }}
          </p>
          <p v-else class="status status--failed">
            {{ t('payment.status.failed') }}<span v-if="payment.failureReason">: {{ payment.failureReason }}</span>.
          </p>

          <div v-if="payment.status === 'PENDING'" class="dev-actions">
            <p class="dev-note">
              {{ t('payment.dev.note') }}
            </p>
            <button
              class="btn btn--primary"
              :disabled="confirmLoading"
              @click="simulateOutcome('COMPLETED')"
            >
              {{ t('payment.dev.simulateSuccess') }}
            </button>
            <button
              class="btn btn--light"
              :disabled="confirmLoading"
              @click="simulateOutcome('FAILED')"
            >
              {{ t('payment.dev.simulateFailure') }}
            </button>
          </div>

          <div v-if="payment.status === 'FAILED'" class="failed-actions">
            <button class="btn btn--primary" @click="retryPayment">
              {{ t('payment.actions.retry') }}
            </button>
            <button class="btn btn--light" :disabled="cancelLoading" @click="requestCancelOrder">
              {{ cancelLoading ? t('payment.actions.cancelling') : t('payment.actions.cancelOrder') }}
            </button>
          </div>

          <button v-if="payment.status === 'COMPLETED'" class="btn btn--primary" @click="emit('done')">
            {{ t('payment.backToCatalog') }}
          </button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
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

.cancelled-block {
  margin-top: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

.cancelled-block p {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
}

.cancel-order-btn {
  margin-top: var(--space-3);
}

.failed-actions {
  margin-top: var(--space-4);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.failed-actions .btn {
  margin-top: 0;
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
