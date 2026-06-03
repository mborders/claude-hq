import type { FileMeta, ArtifactEnvelope, BackupRef } from './envelope';
import type { ValidationIssue } from './errors';
import type {
  SettingsFile,
  KnownSettings,
  ArtifactSummary,
  McpServer,
  MemoryKind,
} from './artifacts';

/** The tool's own persisted state (in APP_DATA_DIR/config.json — never in ~/.claude). */
export interface AppConfig {
  version: 1;
  scanRoots: string[];
  manualProjects: string[];
  hiddenProjects: string[];
  theme: 'light' | 'dark' | 'system';
  revealSecrets: boolean;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  claudeHome: string;
  projectsRoots: string[];
  appDataDir: string;
  readOnly: boolean;
  uid: number | null;
  gid: number | null;
}

/** Artifact families with uniform CRUD (markdown frontmatter + body). */
export type ArtifactType = 'agents' | 'commands' | 'skills';

// --- settings / permissions ---

export interface SettingsResponse {
  /** settings.json and/or settings.local.json, each as an envelope. */
  files: ArtifactEnvelope<SettingsFile>[];
  /** Merged effective view (settings <- local <- inherited baseline). */
  effective: KnownSettings;
  /** Absolute path of the ancestor settings providing an inherited baseline, if any. */
  inheritedFrom?: string;
}

// --- memory ---

export interface MemoryListItem {
  relPath: string;
  meta: FileMeta;
  memoryKind: MemoryKind;
  /** First non-empty line / title, for the list. */
  preview?: string;
}

export interface MemoryListResponse {
  docs: MemoryListItem[];
}

// --- agents / commands / skills ---

export interface ArtifactListResponse {
  items: ArtifactSummary[];
}

export interface UpsertArtifactRequest {
  name?: string;
  structured?: unknown;
  raw?: string;
  expectedSha256?: string;
  confirm?: boolean;
}

// --- mcp ---

export interface McpListResponse {
  meta: FileMeta;
  servers: McpServer[];
  redactedFields?: string[];
}

// --- validation ---

export type ValidateKind =
  | 'settings'
  | 'permissions'
  | 'mcp'
  | 'subagent'
  | 'skill'
  | 'command'
  | 'hooks'
  | 'memory';

export interface ValidateRequest {
  relPath?: string;
  raw?: string;
  structured?: unknown;
}

export interface ValidateResponse {
  valid: boolean;
  issues: ValidationIssue[];
  normalized?: unknown;
}

// --- backups ---

export interface BackupsResponse {
  backups: BackupRef[];
}

export interface BackupPreviewResponse {
  ref: BackupRef;
  raw: string;
}

// --- raw / tree ---

export interface RawFileResponse {
  meta: FileMeta;
  raw: string;
}

export interface TreeEntry {
  relPath: string;
  type: 'file' | 'dir';
  size: number;
  mtimeMs: number;
  readOnly: boolean;
}

export interface TreeResponse {
  entries: TreeEntry[];
}

// --- projects ---

export interface ManualProjectRequest {
  path: string;
}
