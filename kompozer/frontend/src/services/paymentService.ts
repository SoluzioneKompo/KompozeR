/** Payment API client for starting and simulating checkout payments. */
import { http } from './httpClient';
import type { Payment, PaymentMethod } from '@/types/payment';

export const paymentService = {
  create(orderId: string, method: PaymentMethod, amount: number, currency: string): Promise<Payment> {
    return http.post<Payment>('/payments', { orderId, method, amount, currency });
  },

  getByOrder(orderId: string): Promise<Payment> {
    return http.get<Payment>(`/payments/order/${orderId}`);
  },

  confirm(paymentId: string, status: 'COMPLETED' | 'FAILED'): Promise<Payment> {
    return http.post<Payment>(`/payments/${paymentId}/confirm`, { status });
  },
};
