/**
 * Domain port implemented by every payment provider adapter (PayPal, card, ...).
 * Real provider calls are not wired yet — see infrastructure/*Gateway.ts.
 */
import { Payment, PaymentMethod } from '../entities/Payment';

export interface InitiateResult {
  providerReference: string;
  redirectUrl?: string;
}

export interface PaymentGateway {
  initiate(payment: Payment): Promise<InitiateResult>;
}

/** Resolves the concrete PaymentGateway adapter for a payment method. */
export interface PaymentGatewayResolver {
  resolve(method: PaymentMethod): PaymentGateway;
}
