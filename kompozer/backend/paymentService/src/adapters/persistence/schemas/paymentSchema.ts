/**
 * Mongoose schema definitions for payments collection.
 */
import { Schema, model } from 'mongoose';

export type PaymentDoc = {
  _id: string;
  orderId: string;
  userId: string;
  method: 'PAYPAL' | 'CARD';
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  providerReference?: string;
  failureReason?: string;
  createdAt: Date;
  completedAt?: Date;
};

const paymentSchema = new Schema<PaymentDoc>(
  {
    _id: { type: String, required: true },
    orderId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    method: { type: String, required: true, enum: ['PAYPAL', 'CARD'] },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, required: true, enum: ['PENDING', 'COMPLETED', 'FAILED'] },
    providerReference: { type: String, required: false },
    failureReason: { type: String, required: false },
    createdAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, required: false },
  },
  { _id: false },
);

paymentSchema.index({ userId: 1, createdAt: -1 });

export const PaymentModel = model<PaymentDoc>('Payment', paymentSchema, 'payments');
