/** Coordinates payment operations and local UI state for the payment view. */
import { ref } from 'vue';
import { orderService } from '@/services/orderService';
import { paymentService } from '@/services/paymentService';
import { useNotificationStore } from '@/store/notificationStore';
import type { Order } from '@/types/order';
import type { Payment, PaymentMethod } from '@/types/payment';
import { ApiError } from '@/types/api';

export function usePayment() {
  const order = ref<Order | null>(null);
  const payment = ref<Payment | null>(null);
  const loading = ref(false);
  const payLoading = ref(false);
  const confirmLoading = ref(false);
  const error = ref('');

  const notifications = useNotificationStore();

  /** Loads the order and, if one already exists, its payment. */
  async function load(orderId: string): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      order.value = await orderService.get(orderId);
      try {
        payment.value = await paymentService.getByOrder(orderId);
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'PAYMENT_NOT_FOUND') {
          throw e;
        }
        payment.value = null;
      }
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Errore caricamento ordine';
    } finally {
      loading.value = false;
    }
  }

  /** Starts a payment attempt for the given order and method. */
  async function pay(orderId: string, method: PaymentMethod): Promise<void> {
    if (!order.value) {
      return;
    }
    payLoading.value = true;
    try {
      payment.value = await paymentService.create(orderId, method, order.value.total, 'EUR');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Errore durante avvio pagamento';
      notifications.addToast('error', msg);
    } finally {
      payLoading.value = false;
    }
  }

  /** Dev-only: simulates the provider callback that finalizes the payment. */
  async function simulateOutcome(status: 'COMPLETED' | 'FAILED'): Promise<void> {
    if (!payment.value) {
      return;
    }
    confirmLoading.value = true;
    try {
      payment.value = await paymentService.confirm(payment.value.id, status);
      notifications.addToast(
        status === 'COMPLETED' ? 'success' : 'error',
        status === 'COMPLETED' ? 'Pagamento completato' : 'Pagamento fallito',
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Errore durante conferma pagamento';
      notifications.addToast('error', msg);
    } finally {
      confirmLoading.value = false;
    }
  }

  return {
    order,
    payment,
    loading,
    payLoading,
    confirmLoading,
    error,
    load,
    pay,
    simulateOutcome,
  };
}
