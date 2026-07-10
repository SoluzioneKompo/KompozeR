/** Base class for all CAD domain/application errors exposed by the service. */
export class CadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CadError';
  }
}

/** Raised when a request payload or domain state is invalid. */
export class ValidationError extends CadError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

/** Raised when a requested configuration/resource cannot be found. */
export class ResourceNotFoundError extends CadError {
  constructor(message: string) {
    super('RESOURCE_NOT_FOUND', message);
  }
}

/** Raised when an operation conflicts with current state or external systems. */
export class ResourceConflictError extends CadError {
  constructor(message: string) {
    super('RESOURCE_CONFLICT', message);
  }
}

/** Raised when a category-specific Step4 logic family is intentionally not implemented yet. */
export class CategoryLogicNotImplementedError extends CadError {
  constructor(category: string) {
    super(
      'CATEGORY_LOGIC_NOT_IMPLEMENTED',
      `Step4 logic for category ${category} is not implemented yet`,
    );
  }
}

/** Raised when the caller does not have permissions for the requested operation. */
export class ForbiddenError extends CadError {
  constructor(message: string) {
    super('FORBIDDEN', message);
  }
}

/** Raised when a collaborative session has expired and can no longer be used. */
export class SessionExpiredError extends CadError {
  constructor(message: string) {
    super('SESSION_EXPIRED', message);
  }
}

/** Raised when collaborative operations are applied against a stale baseline snapshot. */
export class CollabOperationStaleError extends CadError {
  constructor(message: string) {
    super('COLLAB_OPERATION_STALE', message);
  }
}
