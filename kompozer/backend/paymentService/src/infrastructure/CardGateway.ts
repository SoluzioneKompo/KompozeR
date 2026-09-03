/**
 * Card (credit/debit) adapter — skeleton only.
 * TODO: replace with a real card processor integration (e.g. Stripe
 * PaymentIntents) once API credentials are available. For now it
 * immediately returns a PENDING reference so the checkout flow is fully
 * wireable end to end.
 */
import { randomUUID } from 'crypto';
import { Payment } from '../domain/entities/Payment';
import { InitiateResult, PaymentGateway } from '../domain/ports/PaymentGateway';

export class CardGateway implements PaymentGateway {
  async initiate(_payment: Payment): Promise<InitiateResult> {
    return {
      providerReference: `stub-card-${randomUUID()}`,
    };
  }
}
