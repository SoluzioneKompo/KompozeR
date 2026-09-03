/**
 * PayPal adapter — skeleton only.
 * TODO: replace with real PayPal Orders API calls (create order, capture)
 * once API credentials are available. For now it immediately returns a
 * PENDING reference so the checkout flow is fully wireable end to end.
 */
import { randomUUID } from 'crypto';
import { Payment } from '../domain/entities/Payment';
import { InitiateResult, PaymentGateway } from '../domain/ports/PaymentGateway';

export class PayPalGateway implements PaymentGateway {
  async initiate(_payment: Payment): Promise<InitiateResult> {
    return {
      providerReference: `stub-paypal-${randomUUID()}`,
    };
  }
}
