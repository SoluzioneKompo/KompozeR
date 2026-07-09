/**
 * Domain port for submitting orders during checkout.
 */
import { CartItem } from '../entities/Cart';

export interface ExpeditionInfo {
  name: string;
  surname: string;
  mail: string;
  nation: string;
  city: string;
  cap: string;
  address: string;
  phone: string;
  deliveryNotes?: string;
}

export interface SubmitOrderInput {
  userId: string;
  expeditionInfo: ExpeditionInfo;
  items: CartItem[];
  total: number;
}

export interface SubmitOrderOutput {
  orderId: string;
  status: 'SUBMITTED';
  submittedAt: Date;
}

export interface OrderServiceClient {
  submitOrder(input: SubmitOrderInput): Promise<SubmitOrderOutput>;
}
