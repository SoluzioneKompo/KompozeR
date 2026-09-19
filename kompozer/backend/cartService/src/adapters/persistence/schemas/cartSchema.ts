/**
 * Mongoose schema definitions for carts collection.
 */
import { Schema, model } from 'mongoose';

type CartItemDoc = {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type RemovedUnavailableItemSnapshotDoc = {
  sku: string;
  name: string;
  quantity: number;
  removedAt: Date;
};

type CartDoc = {
  _id: string;
  userId: string;
  items: CartItemDoc[];
  removedUnavailableItems?: Record<string, RemovedUnavailableItemSnapshotDoc>;
  total: number;
  updatedAt: Date;
  configId?: string;
  configName?: string;
};

const cartItemSchema = new Schema<CartItemDoc>(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const cartSchema = new Schema<CartDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
    removedUnavailableItems: {
      type: Map,
      of: new Schema<RemovedUnavailableItemSnapshotDoc>(
        {
          sku: { type: String, required: true },
          name: { type: String, required: true },
          quantity: { type: Number, required: true },
          removedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: {},
    },
    total: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, required: true },
    configId: { type: String, required: false },
    configName: { type: String, required: false },
  },
  { _id: false },
);

export const CartModel = model<CartDoc>('Cart', cartSchema, 'carts');
