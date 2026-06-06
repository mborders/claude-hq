import type { ApiErrorCode, ValidationIssue } from '@claude-hq/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  STALE_WRITE: 409,
  CONFIRM_REQUIRED: 409,
  FORBIDDEN_READONLY: 403,
  FORBIDDEN_PATH: 403,
  READ_ONLY_MODE: 403,
  CONFLICT: 409,
  ALREADY_EXISTS: 409,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  issues?: ValidationIssue[];
  warnings?: string[];
  current?: unknown;
  cause?: unknown;
}

/** A typed, HTTP-mappable error. The error handler serializes it to an ApiError body. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues?: ValidationIssue[];
  readonly warnings?: string[];
  readonly current?: unknown;

  constructor(code: ApiErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.issues = options.issues;
    this.warnings = options.warnings;
    this.current = options.current;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
