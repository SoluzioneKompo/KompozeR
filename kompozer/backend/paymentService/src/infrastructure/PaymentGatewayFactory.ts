/**
 * Resolves the PaymentGateway adapter for a given payment method.
 */
import { PaymentMethod } from '../domain/entities/Payment';
import { PaymentGateway, PaymentGatewayResolver } from '../domain/ports/PaymentGateway';
import { PayPalGateway } from './PayPalGateway';
import { CardGateway } from './CardGateway';

export class PaymentGatewayFactory implements PaymentGatewayResolver {
  private readonly gateways: Record<PaymentMethod, PaymentGateway> = {
    PAYPAL: new PayPalGateway(),
    CARD: new CardGateway(),
  };

  resolve(method: PaymentMethod): PaymentGateway {
    return this.gateways[method];
  }
}
