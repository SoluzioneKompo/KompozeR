<script setup lang="ts">
/** Cart view for quantity updates, totals review, and checkout actions. */
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRouter } from 'vue-router';
import { useCart } from '@/composables/useCart';
import { getIntlLocale } from '@/i18n/format';
import type { CartItem, ExpeditionInfo } from '@/types/cart';

const { t } = useI18n();
const { cart, loading, checkoutLoading, clearLoading, error, load, setQuantity, clearCart, checkout } = useCart();
const router = useRouter();

onMounted(() => {
  void load();
});

const items = computed(() => cart.value?.items ?? []);
const total = computed(() => cart.value?.total ?? 0);
const showCheckoutModal = ref(false);
const checkoutError = ref('');
const checkoutForm = reactive<ExpeditionInfo>({
  name: '',
  surname: '',
  mail: '',
  nation: '',
  city: '',
  cap: '',
  address: '',
  phone: '',
  deliveryNotes: '',
});

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat(getIntlLocale(), {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function increment(item: CartItem): void {
  void setQuantity(item, item.quantity + 1);
}

function decrement(item: CartItem): void {
  void setQuantity(item, item.quantity - 1);
}

function openCheckoutModal(): void {
  checkoutError.value = '';
  showCheckoutModal.value = true;
}

function closeCheckoutModal(): void {
  showCheckoutModal.value = false;
  checkoutError.value = '';
}

async function submitCheckout(): Promise<void> {
  checkoutError.value = '';

  if (
    !checkoutForm.name.trim() ||
    !checkoutForm.surname.trim() ||
    !checkoutForm.mail.trim() ||
    !checkoutForm.nation.trim() ||
    !checkoutForm.city.trim() ||
    !checkoutForm.cap.trim() ||
    !checkoutForm.address.trim() ||
    !checkoutForm.phone.trim()
  ) {
    checkoutError.value = t('cart.checkout.missingFields');
    return;
  }

  const payload: ExpeditionInfo = {
    ...checkoutForm,
    deliveryNotes: checkoutForm.deliveryNotes?.trim() || undefined,
  };

  try {
    const orderId = await checkout(payload);
    closeCheckoutModal();
    await router.push({ name: 'payment', params: { orderId } });
  } catch {
    checkoutError.value = t('cart.checkout.genericError');
  }
}
</script>

<template>
  <div class="view-container">
    <header class="cart-header">
      <div>
        <h1>{{ t('cart.title') }}</h1>
        <p class="subtitle">{{ t('cart.subtitle') }}</p>
      </div>
      <button class="btn btn--light" :disabled="loading" @click="load">{{ t('cart.refresh') }}</button>
    </header>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">{{ t('cart.loading') }}</p>
    <div v-else-if="items.length === 0" class="empty-state">
      <p class="placeholder">{{ t('cart.empty.title') }}</p>
      <p class="empty-hint">
        {{ t('cart.empty.description') }}
        {{ t('cart.empty.before') }}<RouterLink :to="{ name: 'configurations' }" class="empty-link">{{ t('cart.empty.reorderLink') }}</RouterLink>{{ t('cart.empty.between') }}<RouterLink :to="{ name: 'cad' }" class="empty-link">{{ t('cart.empty.createLink') }}</RouterLink>{{ t('cart.empty.after') }}
      </p>
    </div>

    <div v-else class="layout">
      <section class="items">
        <article v-for="item in items" :key="item.sku" class="item-row">
          <div class="item-main">
            <h2 class="item-name">{{ item.name }}</h2>
            <p class="item-sku">{{ t('cart.item.sku', { sku: item.sku }) }}</p>
            <p class="item-price">{{ t('cart.item.unitPrice', { price: formatCurrency(item.unitPrice) }) }}</p>
          </div>

          <div class="qty-controls">
            <button class="qty-btn" :aria-label="t('cart.item.decreaseAria', { name: item.name })" @click="decrement(item)">-</button>
            <span class="qty-value">{{ item.quantity }}</span>
            <button class="qty-btn" :aria-label="t('cart.item.increaseAria', { name: item.name })" @click="increment(item)">+</button>
          </div>

          <div class="line-total">
            {{ formatCurrency(item.lineTotal) }}
          </div>
        </article>
      </section>

      <aside class="summary">
        <h2>{{ t('cart.summary.title') }}</h2>
        <div class="summary-row">
          <span>{{ t('cart.summary.total') }}</span>
          <strong>{{ formatCurrency(total) }}</strong>
        </div>
        <button class="btn btn--danger summary-btn-secondary" :disabled="clearLoading" @click="clearCart">
          {{ clearLoading ? t('cart.summary.clearing') : t('cart.summary.clearButton') }}
        </button>
        <button
          class="btn btn--primary summary-btn"
          :disabled="checkoutLoading || clearLoading"
          @click="openCheckoutModal"
        >
          {{ checkoutLoading ? t('cart.checkout.inProgress') : t('cart.summary.checkoutButton') }}
        </button>
      </aside>
    </div>

    <div v-if="showCheckoutModal" class="checkout-modal-backdrop" role="presentation">
      <div class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
        <h2 id="checkout-modal-title" class="checkout-modal__title">{{ t('cart.checkout.modalTitle') }}</h2>

        <form class="checkout-form" @submit.prevent="submitCheckout">
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.name') }}</span>
            <input v-model="checkoutForm.name" class="field__input" type="text" required />
          </label>
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.surname') }}</span>
            <input v-model="checkoutForm.surname" class="field__input" type="text" required />
          </label>
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.email') }}</span>
            <input v-model="checkoutForm.mail" class="field__input" type="email" required />
          </label>
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.nation') }}</span>
            <input v-model="checkoutForm.nation" class="field__input" type="text" required />
          </label>
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.city') }}</span>
            <input v-model="checkoutForm.city" class="field__input" type="text" required />
          </label>
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.cap') }}</span>
            <input v-model="checkoutForm.cap" class="field__input" type="text" required />
          </label>
          <label class="field field--full">
            <span class="field__label">{{ t('cart.checkout.fields.address') }}</span>
            <input v-model="checkoutForm.address" class="field__input" type="text" required />
          </label>
          <label class="field">
            <span class="field__label">{{ t('cart.checkout.fields.phone') }}</span>
            <input v-model="checkoutForm.phone" class="field__input" type="text" required />
          </label>
          <label class="field field--full">
            <span class="field__label">{{ t('cart.checkout.fields.deliveryNotes') }}</span>
            <textarea v-model="checkoutForm.deliveryNotes" class="field__textarea" rows="3" />
          </label>

          <p v-if="checkoutError" class="error" role="alert" aria-live="assertive">{{ checkoutError }}</p>

          <div class="checkout-modal__actions">
            <button class="btn btn--light" type="button" @click="closeCheckoutModal">{{ t('cart.checkout.cancel') }}</button>
            <button class="btn btn--primary" type="submit" :disabled="checkoutLoading">
              {{ checkoutLoading ? t('cart.checkout.inProgress') : t('cart.checkout.confirm') }}
            </button>
          </div>
        </form>
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

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
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

.empty-state {
  margin-top: var(--space-4);
}

.empty-hint {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.empty-link {
  color: var(--color-accent);
  text-decoration: underline;
}

.layout {
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-6);
}

.items {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.item-row {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-4);
  align-items: center;
}

.item-name { font-size: var(--font-size-base); }
.item-sku, .item-price { color: var(--color-text-secondary); font-size: var(--font-size-sm); }

.qty-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.qty-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
}

.qty-value {
  min-width: 24px;
  text-align: center;
}

.line-total {
  font-weight: var(--font-weight-semibold);
}

.summary {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  height: fit-content;
}

.summary-row {
  margin-top: var(--space-4);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-btn {
  margin-top: var(--space-3);
  width: 100%;
}

.summary-btn-secondary {
  margin-top: var(--space-6);
  width: 100%;
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

.btn--danger {
  background: var(--color-error-subtle);
  color: var(--color-error);
  border: 1px solid #f0cccc;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.checkout-modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
  z-index: 120;
}

.checkout-modal {
  width: min(760px, 100%);
  max-height: calc(100dvh - var(--space-8));
  overflow: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-md);
}

.checkout-modal__title {
  margin: 0 0 var(--space-4);
}

.checkout-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field--full {
  grid-column: 1 / -1;
}

.field__label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.field__input,
.field__textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-base);
}

.field__textarea {
  resize: vertical;
}

.checkout-modal__actions {
  grid-column: 1 / -1;
  margin-top: var(--space-2);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .item-row {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
}

@media (max-width: 700px) {
  .view-container {
    padding: var(--space-6) var(--space-4);
  }

  .cart-header {
    flex-direction: column;
  }

  .checkout-form {
    grid-template-columns: 1fr;
  }
}
</style>
