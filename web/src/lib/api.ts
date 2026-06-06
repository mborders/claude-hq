import type { ApiError, ValidationIssue } from '@claude-hq/shared';

/** Error thrown for any non-2xx API response, carrying the structured ApiError. */
export class ApiClientError extends Error {
  status: number;
  code?: string;
  issues?: ValidationIssue[];
  warnings?: string[];
  current?: unknown;

  constructor(status: number, body: Partial<ApiError>) {
    super(body.error ?? `Request failed (${status})`);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = body.code;
    this.issues = body.issues;
    this.warnings = body.warnings;
    this.current = body.current;
  }

  /** True when the failure was a validation error (surface inline, don't toast). */
  get isValidation(): boolean {
    return this.code === 'VALIDATION_FAILED';
  }
  get needsConfirm(): boolean {
    return this.code === 'CONFIRM_REQUIRED';
  }
  get isStale(): boolean {
    return this.code === 'STALE_WRITE';
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiClientError(res.status, (data as ApiError) ?? {});
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

const enc = encodeURIComponent;
export function scopeUrl(scopeId: string, suffix = ''): string {
  return `/api/scopes/${enc(scopeId)}${suffix}`;
}

/** Query-key factory. */
export const qk = {
  scopes: ['scopes'] as const,
  scope: (id: string) => ['scope', id] as const,
  appConfig: ['app-config'] as const,
  settings: (id: string) => ['settings', id] as const,
  permissions: (id: string) => ['permissions', id] as const,
  hooks: (id: string) => ['hooks', id] as const,
  memory: (id: string) => ['memory', id] as const,
  memoryDoc: (id: string, rel: string) => ['memory-doc', id, rel] as const,
  list: (id: string, type: string) => ['list', id, type] as const,
  artifact: (id: string, type: string, name: string) => ['artifact', id, type, name] as const,
  mcp: (id: string, reveal: boolean) => ['mcp', id, reveal] as const,
  plugins: (id: string) => ['plugins', id] as const,
  backups: (id: string, rel: string) => ['backups', id, rel] as const,
  runtime: (id: string) => ['runtime', id] as const,
  tree: (id: string, sub: string) => ['tree', id, sub] as const,
};
