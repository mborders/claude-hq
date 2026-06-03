export type ScopeKind = 'global' | 'project';

/**
 * Opaque on the wire. Either the literal "global" or "project:<base64url(absPath)>".
 * Decoded only server-side, then re-validated against the sandbox allow-list.
 */
export type ScopeId = string;

export interface Scope {
  id: ScopeId;
  kind: ScopeKind;
  /** Display label, e.g. "Global · ~/.claude" or a project folder name. */
  label: string;
  /** Absolute project root (or the claude home for the global scope). */
  rootPath: string;
  /** Absolute path to the `.claude` directory. */
  claudeDir: string;
  /** Whether the `.claude` directory exists yet. */
  exists: boolean;
}

export interface ProjectRef {
  id: ScopeId;
  name: string;
  path: string;
  claudeDir: string;
  hasClaudeDir: boolean;
  hasMemory: boolean;
  source: 'scanned' | 'manual';
  /** Which configured scan root this was found under (scanned only). */
  scanRoot?: string;
  /** Nearest ancestor `.claude/settings*.json` providing an inherited baseline, if any. */
  parentBaseline?: string;
  /** Count of configured modules (settings/agents/commands/skills/mcp/hooks/memory present). */
  configuredModules?: number;
  /** ISO timestamp of the most recent change among `.claude` files (for sorting). */
  lastModified?: string;
}

/** Response for GET /api/scopes — powers both nav rails + overview in one call. */
export interface ScopesResponse {
  global: Scope;
  projects: ProjectRef[];
}
