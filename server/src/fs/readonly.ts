/**
 * Runtime/data subtrees of the global `~/.claude` that the tool must never
 * write (sessions, telemetry, caches, credentials-adjacent state, etc.).
 * Applies to the GLOBAL scope only; project scopes have no such subtrees.
 */
const READONLY_TOP_DIRS = new Set([
  'sessions',
  'session-env',
  'session-data',
  'tasks',
  'plans',
  'security',
  'metrics',
  'shell-snapshots',
  'statsig',
  'ide',
  'telemetry',
  'file-history',
  'debug',
  'todos',
  'paste-cache',
  'backups', // Claude Code's own backups
  'cache',
  'logs',
]);

const READONLY_TOP_FILES = new Set([
  'history.jsonl',
  'bash-commands.log',
  'stats-cache.json',
  'mcp-needs-auth-cache.json',
  '.last_cost',
  '.credentials.json',
]);

/** True if `relPath` (relative to the global claude home) is a non-writable runtime path. */
export function isRuntimeReadonlyRelPath(relPath: string): boolean {
  const segs = relPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  if (segs.length === 0) return false;

  const top = segs[0]!;
  if (READONLY_TOP_FILES.has(top)) return true;
  if (top.endsWith('.log')) return true;

  // projects/<encoded-cwd>/... is session data EXCEPT the memory/ store, which
  // we explicitly allow editing.
  if (top === 'projects') {
    return segs[2] !== 'memory';
  }

  return READONLY_TOP_DIRS.has(top);
}
