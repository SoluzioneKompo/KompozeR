/**
 * Domain error hierarchy for paymentService.
 */
export class PaymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class ValidationError extends PaymentError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

export class PaymentNotFoundError extends PaymentError {
  constructor(paymentId: string) {
    super('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
  }
}

export class ForbiddenError extends PaymentError {
  constructor(message: string) {
    super('FORBIDDEN', message);
  }
}

export class PaymentAlreadyFinalizedError extends PaymentError {
  constructor(paymentId: string) {
    super('PAYMENT_ALREADY_FINALIZED', `Payment ${paymentId} is already finalized`);
  }
}
