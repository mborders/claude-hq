/** A single validation problem, addressed by a dot/bracket JSON path. */
export interface ValidationIssue {
  /** e.g. "permissions.allow[2]" or "frontmatter.name" */
  path: string;
  message: string;
  code?: string;
}

export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'STALE_WRITE'
  | 'CONFIRM_REQUIRED'
  | 'FORBIDDEN_READONLY'
  | 'FORBIDDEN_PATH'
  | 'READ_ONLY_MODE'
  | 'CONFLICT'
  | 'ALREADY_EXISTS'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL';

/** Uniform error body returned by every non-2xx API response. */
export interface ApiError {
  error: string;
  code: ApiErrorCode;
  /** Present for VALIDATION_FAILED. */
  issues?: ValidationIssue[];
  /** Present for CONFIRM_REQUIRED — human-readable reasons the action is risky. */
  warnings?: string[];
  /** Present for STALE_WRITE — the current on-disk metadata so the UI can reconcile. */
  current?: unknown;
}
