/**
 * Mongoose schema definitions for orders collection.
 */
import { Schema, model } from 'mongoose';

export type OrderDoc = {
  _id: string;
  userId: string;
  expeditionInfo: {
    name: string;
    surname: string;
    mail: string;
    nation: string;
    city: string;
    cap: string;
    address: string;
    phone: string;
    deliveryNotes?: string;
  };
  items: Array<{
    sku: string;
    name: string;
    unitPrice: number;
    quantity: number;
  }>;
  total: number;
  status: 'AWAITING_PAYMENT' | 'SUBMITTED' | 'DONE' | 'CANCELLED';
  submittedAt: Date;
  doneAt?: Date;
  cancelledAt?: Date;
};

const orderItemSchema = new Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const expeditionInfoSchema = new Schema(
  {
    name: { type: String, required: true },
    surname: { type: String, required: true },
    mail: { type: String, required: true },
    nation: { type: String, required: true },
    city: { type: String, required: true },
    cap: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    deliveryNotes: { type: String, required: false },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    expeditionInfo: { type: expeditionInfoSchema, required: true },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    status: { type: String, required: true, enum: ['AWAITING_PAYMENT', 'SUBMITTED', 'DONE', 'CANCELLED'] },
    submittedAt: { type: Date, required: true, index: true },
    doneAt: { type: Date, required: false },
    cancelledAt: { type: Date, required: false },
  },
  { _id: false },
);

orderSchema.index({ userId: 1, submittedAt: -1 });

export const OrderModel = model<OrderDoc>('Order', orderSchema, 'orders');
