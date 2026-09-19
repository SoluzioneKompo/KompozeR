/**
 * Domain error hierarchy for cartService.
 */
export class CartError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CartError';
  }
}

export class ValidationError extends CartError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

export class CartEmptyError extends CartError {
  constructor() {
    super('CART_EMPTY', 'Cart is empty');
  }
}

export class CartItemUnavailableError extends CartError {
  constructor(public readonly sku: string) {
    super('ITEM_UNAVAILABLE', `Item ${sku} is no longer available`);
  }
}

export class CartConfigConflictError extends CartError {
  constructor(message: string) {
    super('CONFIG_CONFLICT', message);
  }
}

export class CartItemPriceChangedError extends CartError {
  constructor(
    public readonly sku: string,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super('PRICE_CHANGED', `Item ${sku} has changed price (${expected} -> ${actual})`);
  }
}

export class CatalogLookupError extends CartError {
  constructor(message: string) {
    super('CATALOG_LOOKUP_FAILED', message);
  }
}

export class OrderSubmissionError extends CartError {
  constructor(message: string) {
    super('ORDER_SUBMISSION_FAILED', message);
  }
}
