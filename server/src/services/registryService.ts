import path from 'node:path';
import type {
  McpInstall,
  McpRegistryEntry,
  McpRegistrySearchResponse,
  PluginRegistryEntry,
  PluginRegistrySearchResponse,
} from '@ccm/shared';
import { readText } from '../fs/safeFs';
import type { AppContext } from '../context';

const MCP_REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers';

/** Popular Claude Code plugin marketplaces (GitHub repos with .claude-plugin/marketplace.json). */
const CURATED_MARKETPLACE_REPOS = [
  'anthropics/claude-plugins-official',
  'wshobson/agents',
  'obra/superpowers-marketplace',
  'warpdotdev/claude-code-warp',
  'affaan-m/ecc',
];

// --- tiny TTL cache ---

interface CacheEntry<T> {
  value: T;
  expires: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && hit.expires > nowMs()) return hit.value as T;
  return undefined;
}
function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expires: nowMs() + ttlMs });
}
function nowMs(): number {
  // wrapped so it's easy to find; Date.now is fine in the server runtime.
  return Date.now();
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'claude-config-manager' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// --- MCP registry ---

export function sanitizeId(name: string): string {
  const leaf = name.split('/').pop() ?? name;
  const cleaned = leaf.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'server';
}

const RUNTIME_BY_REGISTRY: Record<string, string> = {
  npm: 'npx',
  pypi: 'uvx',
  oci: 'docker',
  nuget: 'dnx',
};

export function normalizeInstall(server: any): McpInstall | null {
  const pkg = Array.isArray(server.packages) ? server.packages[0] : undefined;
  const remote = Array.isArray(server.remotes) ? server.remotes[0] : undefined;

  if (pkg && pkg.identifier) {
    const runner = pkg.runtimeHint || RUNTIME_BY_REGISTRY[pkg.registryType] || 'npx';
    const runtimeArgs = (pkg.runtimeArguments ?? [])
      .map((a: any) => a.value ?? a.name)
      .filter((v: unknown): v is string => typeof v === 'string');
    const pkgArgs = (pkg.packageArguments ?? [])
      .map((a: any) => a.value ?? a.name)
      .filter((v: unknown): v is string => typeof v === 'string');
    const ident = pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier;
    const envVars = (pkg.environmentVariables ?? []) as any[];
    const env: Record<string, string> = {};
    for (const e of envVars) if (e?.name) env[e.name] = '';
    return {
      transport: 'stdio',
      command: runner,
      args: [...runtimeArgs, ident, ...pkgArgs],
      ...(Object.keys(env).length ? { env } : {}),
      requiredKeys: envVars.filter((e) => e?.isRequired).map((e) => e.name),
      secretKeys: envVars.filter((e) => e?.isSecret).map((e) => e.name),
    };
  }

  if (remote && remote.url) {
    const transport = remote.type === 'sse' ? 'sse' : 'http';
    const hdrs = (remote.headers ?? []) as any[];
    const headers: Record<string, string> = {};
    for (const h of hdrs) if (h?.name) headers[h.name] = h.value ?? '';
    return {
      transport,
      url: remote.url,
      ...(Object.keys(headers).length ? { headers } : {}),
      requiredKeys: hdrs.filter((h) => h?.isRequired).map((h) => h.name),
      secretKeys: hdrs.filter((h) => h?.isSecret).map((h) => h.name),
    };
  }

  return null;
}

export class RegistryService {
  constructor(private readonly ctx: AppContext) {}

  async searchMcp(query: string, limit = 30): Promise<McpRegistrySearchResponse> {
    const q = query.trim();
    const key = `mcp:${q.toLowerCase()}:${limit}`;
    const cached = getCached<McpRegistrySearchResponse>(key);
    if (cached) return cached;

    const url = q
      ? `${MCP_REGISTRY}?search=${encodeURIComponent(q)}&limit=${limit}`
      : `${MCP_REGISTRY}?limit=${limit}`;

    let response: McpRegistrySearchResponse;
    try {
      const data = (await fetchJson(url)) as { servers?: any[] };
      const byName = new Map<string, McpRegistryEntry>();
      for (const item of data.servers ?? []) {
        const server = item.server ?? item;
        if (!server?.name) continue;
        const meta = item._meta?.['io.modelcontextprotocol.registry/official'];
        const isLatest = meta?.isLatest !== false;
        const entry: McpRegistryEntry = {
          name: server.name,
          id: sanitizeId(server.name),
          title: server.title,
          description: server.description,
          version: server.version,
          repository: server.repository?.url,
          source: 'MCP Registry',
          install: normalizeInstall(server),
        };
        // Keep the latest version per name; only keep entries we can install.
        if (!entry.install) continue;
        if (!byName.has(server.name) || isLatest) byName.set(server.name, entry);
      }
      response = { results: [...byName.values()] };
    } catch (err) {
      response = { results: [], error: `Could not reach the MCP registry (${(err as Error).message}).` };
    }

    setCached(key, response, 5 * 60_000);
    return response;
  }

  private knownRepos(): Set<string> {
    const repos = new Set<string>();
    const known = readJsonFile(path.join(this.ctx.env.claudeHomeDir, 'plugins', 'known_marketplaces.json'));
    if (known && typeof known === 'object') {
      for (const m of Object.values(known as Record<string, any>)) {
        const repo = m?.source?.repo;
        if (typeof repo === 'string') repos.add(repo.toLowerCase());
      }
    }
    return repos;
  }

  private async fetchMarketplace(repo: string): Promise<{ name: string; plugins: any[] } | null> {
    const key = `mkt:${repo}`;
    const cached = getCached<{ name: string; plugins: any[] }>(key);
    if (cached) return cached;
    try {
      const data = (await fetchJson(
        `https://raw.githubusercontent.com/${repo}/HEAD/.claude-plugin/marketplace.json`,
      )) as { name?: string; plugins?: any[] };
      const value = { name: data.name ?? repo.split('/').pop()!, plugins: data.plugins ?? [] };
      setCached(key, value, 30 * 60_000);
      return value;
    } catch {
      return null;
    }
  }

  async searchPlugins(query: string): Promise<PluginRegistrySearchResponse> {
    const known = this.knownRepos();
    const fetched = await Promise.all(
      CURATED_MARKETPLACE_REPOS.map(async (repo) => ({ repo, mkt: await this.fetchMarketplace(repo) })),
    );

    const unavailable = fetched.filter((f) => !f.mkt).map((f) => f.repo);
    const all: PluginRegistryEntry[] = [];
    for (const { repo, mkt } of fetched) {
      if (!mkt) continue;
      for (const p of mkt.plugins) {
        if (!p?.name) continue;
        all.push({
          name: p.name,
          description: p.description,
          marketplace: mkt.name,
          repo,
          category: p.category,
          tags: Array.isArray(p.tags) ? p.tags : undefined,
          pluginId: `${p.name}@${mkt.name}`,
          homepage: typeof p.homepage === 'string' ? p.homepage : undefined,
          alreadyKnown: known.has(repo.toLowerCase()),
        });
      }
    }

    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((p) =>
          [p.name, p.description, p.marketplace, ...(p.tags ?? [])]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
        )
      : all;

    // New marketplaces first (discovery), then by name.
    filtered.sort(
      (a, b) => Number(a.alreadyKnown) - Number(b.alreadyKnown) || a.name.localeCompare(b.name),
    );

    return { results: filtered.slice(0, 80), ...(unavailable.length ? { unavailable } : {}) };
  }
}

function readJsonFile(absPath: string): unknown {
  const r = readText(absPath);
  if (!r) return null;
  try {
    return JSON.parse(r.content);
  } catch {
    return null;
  }
}
