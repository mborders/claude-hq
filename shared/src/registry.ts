// Discovery: searching MCP registries + plugin marketplaces.

export interface McpInstall {
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  /** Env var / header names that are required (for UI hints). */
  requiredKeys?: string[];
  /** Env var / header names that hold secrets (for UI hints). */
  secretKeys?: string[];
}

export interface McpRegistryEntry {
  /** Full registry name, e.g. "io.github.owner/server". */
  name: string;
  /** Suggested, sanitized server id for .mcp.json. */
  id: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: string;
  source: string;
  install: McpInstall | null;
}

export interface McpRegistrySearchResponse {
  results: McpRegistryEntry[];
  /** Set when the registry could not be reached. */
  error?: string;
}

export interface PluginRegistryEntry {
  name: string;
  description?: string;
  /** Marketplace display name (from its manifest). */
  marketplace: string;
  /** "owner/repo" of the marketplace. */
  repo: string;
  category?: string;
  tags?: string[];
  /** "<plugin>@<marketplace>" used as the enabledPlugins key. */
  pluginId: string;
  homepage?: string;
  /** Whether the user already has this marketplace registered. */
  alreadyKnown: boolean;
}

export interface PluginRegistrySearchResponse {
  results: PluginRegistryEntry[];
  /** Marketplaces that could not be fetched (best-effort discovery). */
  unavailable?: string[];
}
