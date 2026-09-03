/**
 * MongoDB implementation of PaymentRepository.
 */
import { Payment } from '../../domain/entities/Payment';
import { PaymentRepository } from '../../domain/ports/PaymentRepository';
import { PaymentModel } from './schemas/paymentSchema';

function toEntity(doc: {
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
}): Payment {
  return {
    id: doc._id,
    orderId: doc.orderId,
    userId: doc.userId,
    method: doc.method,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    providerReference: doc.providerReference,
    failureReason: doc.failureReason,
    createdAt: doc.createdAt,
    completedAt: doc.completedAt,
  };
}

export class MongoPaymentRepository implements PaymentRepository {
  async create(payment: Payment): Promise<void> {
    await PaymentModel.create({
      _id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      providerReference: payment.providerReference,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    });
  }

  async findById(paymentId: string): Promise<Payment | null> {
    const doc = await PaymentModel.findById(paymentId).lean();
    return doc ? toEntity(doc) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const doc = await PaymentModel.findOne({ orderId }).lean();
    return doc ? toEntity(doc) : null;
  }

  async listByUserId(userId: string): Promise<Payment[]> {
    const docs = await PaymentModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(toEntity);
  }

  async update(payment: Payment): Promise<void> {
    await PaymentModel.findByIdAndUpdate(payment.id, {
      orderId: payment.orderId,
      userId: payment.userId,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      providerReference: payment.providerReference,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    });
  }
}
