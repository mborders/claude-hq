import type { ScopeId } from './scope';
import type { ValidationIssue } from './errors';

export type ArtifactKind =
  | 'settings'
  | 'permissions'
  | 'memory'
  | 'subagent'
  | 'command'
  | 'skill'
  | 'mcp'
  | 'hooks'
  | 'plugins'
  | 'keybindings'
  | 'raw';

export interface FileMeta {
  scopeId: ScopeId;
  /** POSIX-style path relative to the scope root (or claudeDir). */
  relPath: string;
  /** Absolute path (server truth; handy for a copy-path tooltip). */
  absPath: string;
  exists: boolean;
  size: number;
  mtimeMs: number;
  /** sha256 of raw bytes; powers optimistic-concurrency + change detection. */
  sha256: string;
  /** True for runtime-data files that may never be written. */
  readOnly: boolean;
}

/**
 * Universal read result. `structured` is null when the file can't be parsed
 * into its schema (corrupt / hand-broken) — the UI then forces raw mode.
 */
export interface ArtifactEnvelope<TStructured> {
  kind: ArtifactKind;
  meta: FileMeta;
  structured: TStructured | null;
  /** Exact file text (frontmatter + body for markdown). Secret values masked unless revealed. */
  raw: string;
  /** Why `structured` is null, if applicable. */
  parseError?: ValidationIssue[];
  /** JSON-paths whose values were masked in `structured`/`raw`. */
  redactedFields?: string[];
}

export interface RawWriteRequest {
  raw: string;
  /** Optimistic concurrency; 409 STALE_WRITE on mismatch. */
  expectedSha256?: string;
  expectedMtimeMs?: number;
  /** Required for destructive writes (see CONFIRM_REQUIRED). */
  confirm?: boolean;
}

export interface StructuredWriteRequest<TStructured> {
  structured: TStructured;
  expectedSha256?: string;
  expectedMtimeMs?: number;
  confirm?: boolean;
}

export interface BackupRef {
  /** "<basename>.backup.<epochMs>" */
  id: string;
  /** The scope-relative path this backs up. */
  relPath: string;
  createdAtMs: number;
  size: number;
}

export interface WriteResult {
  meta: FileMeta;
  /** Backup created before overwrite (absent on create). */
  backup?: BackupRef;
}
