/**
 * Domain error hierarchy for catalogService.
 * CatalogError is the base class with machine-readable `code`.
 * Subclasses model application failures and are mapped to HTTP in middleware.
 */
export class CatalogError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

// 404 - component does not exist (by id or sku)
export class ComponentNotFoundError extends CatalogError {
  constructor(identifier: string) {
    super('COMPONENT_NOT_FOUND', `Component "${identifier}" not found`);
  }
}

// 422 - invalid input data (missing field, out-of-range value, etc.)
export class ValidationError extends CatalogError {
  constructor(
    message: string,
    public readonly details: { field: string; reason: string }[],
  ) {
    super('VALIDATION_ERROR', message);
  }
}

// 409 - insufficient stock (used by cartService when decreasing stock)
export class InsufficientStockError extends CatalogError {
  constructor(sku: string, available: number) {
    super(
      'INSUFFICIENT_STOCK',
      `Insufficient stock for SKU "${sku}": ${available} unit(s) available`,
    );
  }
}

// 409 - [DS] version conflict from optimistic concurrency control
export class VersionConflictError extends CatalogError {
  constructor(id: string, expected: number, actual: number) {
    super(
      'VERSION_CONFLICT',
      `Component "${id}": expected version ${expected}, got ${actual}. Reload and retry.`,
    );
  }
}
