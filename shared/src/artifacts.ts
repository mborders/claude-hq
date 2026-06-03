// ---------------------------------------------------------------------------
// Settings & permissions
// ---------------------------------------------------------------------------

/** e.g. "Bash(git:*)", "WebFetch(domain:x.com)", "Read(/p/**)", "WebSearch", "Skill(name)". */
export type PermissionRule = string;

export interface PermissionsBlock {
  allow?: PermissionRule[];
  deny?: PermissionRule[];
  ask?: PermissionRule[];
  additionalDirectories?: string[];
  defaultMode?: string;
}

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'UserPromptSubmit'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd'
  | (string & {});

export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookMatcherGroup {
  matcher?: string;
  hooks: HookCommand[];
}

export type HooksBlock = Partial<Record<HookEventName, HookMatcherGroup[]>>;

/** Flattened editor row for the Hooks UI. */
export interface HookRow {
  event: HookEventName;
  matcher?: string;
  command: string;
  timeout?: number;
}

export interface StatusLineConfig {
  type?: string;
  command?: string;
  [k: string]: unknown;
}

export interface MarketplaceSource {
  source: { source: 'github'; repo: string } | Record<string, unknown>;
}

/** Known top-level settings keys (global + project union); all optional. */
export interface KnownSettings {
  // global-flavored
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, MarketplaceSource>;
  alwaysThinkingEnabled?: boolean;
  skipWorkflowUsageWarning?: boolean;
  preferredNotifChannel?: string;
  fastMode?: boolean;
  // standard config (both scopes)
  permissions?: PermissionsBlock;
  env?: Record<string, string>;
  hooks?: HooksBlock;
  model?: string;
  statusLine?: StatusLineConfig;
  apiKeyHelper?: string;
  includeCoAuthoredBy?: boolean;
  cleanupPeriodDays?: number;
  outputStyle?: string;
}

export type SettingsVariant = 'settings' | 'local';

export interface SettingsFile {
  known: KnownSettings;
  /** Preserved verbatim and re-merged on write (future keys + anything unrecognized). */
  unknown: Record<string, unknown>;
  variant: SettingsVariant;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export type MemoryKind = 'project-root' | 'project-claude' | 'global-store' | 'global-feedback';

export interface MemoryFrontmatter {
  name?: string;
  description?: string;
  metadata?: { node_type?: string; type?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export interface MemoryDoc {
  hasFrontmatter: boolean;
  frontmatter: MemoryFrontmatter | null;
  body: string;
  memoryKind: MemoryKind;
}

// ---------------------------------------------------------------------------
// Subagents / commands / skills
// ---------------------------------------------------------------------------

export interface SubagentFrontmatter {
  name: string;
  description: string;
  model?: string;
  color?: string;
  tools?: string;
  [k: string]: unknown;
}

export interface Subagent {
  frontmatter: SubagentFrontmatter;
  body: string;
}

export interface SlashCommand {
  frontmatter: Record<string, unknown> | null;
  body: string;
  /** Derived from a leading "# Claude Command: X" heading if present. */
  title?: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  [k: string]: unknown;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  body: string;
  /** "skills/<name>/" */
  dir: string;
  hasReferences: boolean;
  hasExamples: boolean;
  extraFiles: string[];
}

/** Generic list-item summary returned for agents/commands/skills lists. */
export interface ArtifactSummary {
  name: string;
  description?: string;
  /** model badge for agents; first line for commands; etc. */
  badge?: string;
  mtimeMs: number;
  relPath: string;
}

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

export interface McpStdioServer {
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpHttpServer {
  transport: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type McpServer = { id: string } & (McpStdioServer | McpHttpServer);

/** On-disk `.mcp.json` shape (server bodies are the original, un-normalized form). */
export interface McpConfigFile {
  mcpServers: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Plugins & marketplaces
// ---------------------------------------------------------------------------

export interface Marketplace {
  name: string;
  source: MarketplaceSource['source'];
  installLocation?: string;
  lastUpdated?: string;
  /** Whether this came from settings.extraKnownMarketplaces (editable) vs known_marketplaces.json. */
  editable: boolean;
}

export interface PluginInstallEntry {
  scope: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
}

export interface Plugin {
  /** "name@marketplace" */
  id: string;
  name: string;
  marketplace: string;
  enabled: boolean;
  installs: PluginInstallEntry[];
}

export interface BlocklistEntry {
  plugin: string;
  added_at?: string;
  reason?: string;
  text?: string;
}

export interface PluginsResponse {
  plugins: Plugin[];
  marketplaces: Marketplace[];
  blocklist: BlocklistEntry[];
}

// ---------------------------------------------------------------------------
// Read-only runtime summary (global scope only)
// ---------------------------------------------------------------------------

export interface RuntimeSummary {
  sessionsCount?: number;
  projectsTracked?: number;
  tasksCount?: number;
  plansCount?: number;
  totalCostUsd?: number;
  lastActivityMs?: number;
}
