import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import type {
  AppConfig,
  ArtifactType,
  ValidateKind,
  ValidateResponse,
  RuntimeSummary,
  TreeEntry,
} from '@ccm/shared';
import type { AppContext } from '../context';
import type { ResolvedScope } from '../domain/paths';
import { createServices } from '../services';
import { TransferService } from '../services/transferService';
import { validate } from '../schemas';
import { parseFrontmatter } from '../fs/frontmatter';
import { readText } from '../fs/safeFs';
import { AppError } from '../http/appError';

const ARTIFACT_TYPES: ArtifactType[] = ['agents', 'commands', 'skills'];
const VALIDATE_KINDS = new Set<ValidateKind>([
  'settings',
  'permissions',
  'mcp',
  'subagent',
  'skill',
  'command',
  'hooks',
  'memory',
]);

function q(req: { query: unknown }, key: string): string | undefined {
  const v = (req.query as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}
function requireRel(req: { query: unknown }): string {
  const rel = q(req, 'relPath');
  if (!rel) throw new AppError('BAD_REQUEST', 'relPath query parameter is required.');
  return rel;
}
function isTrue(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

export function apiRoutes(ctx: AppContext): FastifyPluginAsync {
  const s = createServices(ctx);
  const transfers = new TransferService(ctx);
  const requireScope = (id: string) => s.scopes.requireScope(id);

  return async (app) => {
    // --- scopes & projects ---
    app.get('/scopes', async () => s.scopes.listScopes());
    app.get('/scopes/:scopeId', async (req) => s.scopes.getScope((req.params as any).scopeId));
    app.post('/scopes/:scopeId/init', async (req) => ({ scope: s.scopes.initScope((req.params as any).scopeId) }));

    app.post('/projects/scan', async () => ({ projects: s.scopes.listProjects() }));
    app.post('/projects/manual', async (req) => s.scopes.addManualProject((req.body as any).path));
    app.delete('/projects/manual', async (req, reply) => {
      s.scopes.removeManualProject((req.body as any).path);
      return reply.code(204).send();
    });
    app.post('/projects/hide', async (req, reply) => {
      s.scopes.hideProject((req.body as any).id);
      return reply.code(204).send();
    });

    // --- app config ---
    app.get('/app-config', async () => ctx.appConfig.load());
    app.patch('/app-config', async (req) => applyAppConfigPatch(ctx, (req.body as Partial<AppConfig>) ?? {}));

    // --- move / copy an item between scopes ---
    app.post('/transfer', async (req) => transfers.transfer(req.body as any));

    // --- settings / permissions / hooks ---
    app.get('/scopes/:scopeId/settings', async (req) =>
      s.settings.getSettings(requireScope((req.params as any).scopeId)),
    );
    app.put('/scopes/:scopeId/settings/:variant', async (req) => {
      const { scopeId, variant } = req.params as any;
      if (variant !== 'settings' && variant !== 'local') {
        throw new AppError('BAD_REQUEST', `Unknown settings variant: ${variant}`);
      }
      const body = req.body as any;
      return s.settings.writeSettings(requireScope(scopeId), variant, body.structured, {
        expectedSha256: body.expectedSha256,
        confirm: body.confirm,
      });
    });

    app.get('/scopes/:scopeId/permissions', async (req) =>
      s.settings.getPermissions(requireScope((req.params as any).scopeId), q(req, 'variant') as any),
    );
    app.put('/scopes/:scopeId/permissions', async (req) => {
      const body = req.body as any;
      return s.settings.writePermissions(requireScope((req.params as any).scopeId), body.structured, {
        variant: q(req, 'variant') as any,
        expectedSha256: body.expectedSha256,
        confirm: body.confirm,
      });
    });

    app.get('/scopes/:scopeId/hooks', async (req) =>
      s.settings.getHooks(requireScope((req.params as any).scopeId), q(req, 'variant') as any),
    );
    app.put('/scopes/:scopeId/hooks', async (req) => {
      const body = req.body as any;
      return s.settings.writeHooks(requireScope((req.params as any).scopeId), body.rows ?? [], {
        variant: q(req, 'variant') as any,
        expectedSha256: body.expectedSha256,
        confirm: body.confirm,
      });
    });

    // --- memory ---
    app.get('/scopes/:scopeId/memory', async (req) => ({
      docs: s.memory.list(requireScope((req.params as any).scopeId)),
    }));
    app.get('/scopes/:scopeId/memory/doc', async (req) =>
      s.memory.getDoc(requireScope((req.params as any).scopeId), requireRel(req)),
    );
    app.put('/scopes/:scopeId/memory/doc', async (req) => {
      const body = req.body as any;
      return s.memory.putDoc(requireScope((req.params as any).scopeId), requireRel(req), {
        raw: body.raw,
        structured: body.structured,
        expectedSha256: body.expectedSha256,
      });
    });

    // --- agents / commands / skills ---
    app.get('/scopes/:scopeId/:type', async (req) => {
      const { scopeId, type } = req.params as any;
      assertType(type);
      return { items: s.artifacts.list(requireScope(scopeId), type) };
    });
    app.get('/scopes/:scopeId/:type/:name', async (req) => {
      const { scopeId, type, name } = req.params as any;
      assertType(type);
      return s.artifacts.get(requireScope(scopeId), type, name);
    });
    app.post('/scopes/:scopeId/:type', async (req) => {
      const { scopeId, type } = req.params as any;
      assertType(type);
      const body = req.body as any;
      return s.artifacts.upsert(requireScope(scopeId), type, body.name, body, true);
    });
    app.put('/scopes/:scopeId/:type/:name', async (req) => {
      const { scopeId, type, name } = req.params as any;
      assertType(type);
      return s.artifacts.upsert(requireScope(scopeId), type, name, req.body as any, false);
    });
    app.delete('/scopes/:scopeId/:type/:name', async (req) => {
      const { scopeId, type, name } = req.params as any;
      assertType(type);
      return s.artifacts.delete(requireScope(scopeId), type, name, {
        confirm: isTrue(q(req, 'confirm')),
        expectedSha256: q(req, 'expectedSha256'),
      });
    });

    // --- mcp ---
    app.get('/scopes/:scopeId/mcp', async (req) =>
      s.mcp.list(requireScope((req.params as any).scopeId), isTrue(q(req, 'reveal'))),
    );
    app.post('/scopes/:scopeId/mcp', async (req) => {
      const body = req.body as any;
      return s.mcp.upsert(requireScope((req.params as any).scopeId), body.id, body.server, { create: true });
    });
    app.put('/scopes/:scopeId/mcp/:id', async (req) => {
      const { scopeId, id } = req.params as any;
      const body = req.body as any;
      return s.mcp.upsert(requireScope(scopeId), id, body.server, { expectedSha256: body.expectedSha256 });
    });
    app.delete('/scopes/:scopeId/mcp/:id', async (req) => {
      const { scopeId, id } = req.params as any;
      return s.mcp.remove(requireScope(scopeId), id, { confirm: isTrue(q(req, 'confirm')) });
    });

    // --- plugins / marketplaces ---
    app.get('/scopes/:scopeId/plugins', async (req) =>
      s.plugins.getPlugins(requireScope((req.params as any).scopeId)),
    );
    app.put('/scopes/:scopeId/plugins/:pluginId/enabled', async (req) => {
      const { scopeId, pluginId } = req.params as any;
      return s.settings.setEnabledPlugin(requireScope(scopeId), pluginId, !!(req.body as any).enabled);
    });
    app.post('/scopes/:scopeId/marketplaces', async (req) => {
      const body = req.body as any;
      return s.settings.addMarketplace(requireScope((req.params as any).scopeId), body.name, body.repo);
    });
    app.delete('/scopes/:scopeId/marketplaces/:name', async (req) => {
      const { scopeId, name } = req.params as any;
      return s.settings.removeMarketplace(requireScope(scopeId), name, { confirm: isTrue(q(req, 'confirm')) });
    });

    // --- validation (dry run) ---
    app.post('/scopes/:scopeId/validate/:kind', async (req) => {
      const { scopeId, kind } = req.params as any;
      requireScope(scopeId);
      if (!VALIDATE_KINDS.has(kind)) throw new AppError('BAD_REQUEST', `Unknown kind: ${kind}`);
      return computeValidate(kind, req.body as any);
    });

    // --- backups ---
    app.get('/scopes/:scopeId/backups', async (req) => {
      const scope = requireScope((req.params as any).scopeId);
      return { backups: ctx.backups.list(scope.id, requireRel(req)) };
    });
    app.get('/scopes/:scopeId/backups/:backupId', async (req) => {
      const scope = requireScope((req.params as any).scopeId);
      const rel = requireRel(req);
      const id = (req.params as any).backupId;
      const raw = ctx.backups.read(scope.id, rel, id);
      if (raw === null) throw new AppError('NOT_FOUND', 'Backup not found.');
      const ref = ctx.backups.list(scope.id, rel).find((b) => b.id === id);
      return { ref, raw };
    });
    app.post('/scopes/:scopeId/backups/:backupId/restore', async (req) => {
      const scope = requireScope((req.params as any).scopeId);
      const body = req.body as any;
      const rel: string = body.relPath;
      if (!rel) throw new AppError('BAD_REQUEST', 'relPath is required.');
      const content = ctx.backups.read(scope.id, rel, (req.params as any).backupId);
      if (content === null) throw new AppError('NOT_FOUND', 'Backup not found.');
      return ctx.files.write(scope, rel, content, {
        warnings: ['Restoring will overwrite the current file (a backup of it is taken first).'],
        confirm: body.confirm,
        expectedSha256: body.expectedSha256,
      });
    });
    app.delete('/scopes/:scopeId/backups/:backupId', async (req, reply) => {
      const scope = requireScope((req.params as any).scopeId);
      if (!isTrue(q(req, 'confirm'))) {
        throw new AppError('CONFIRM_REQUIRED', 'Confirm backup deletion.', {
          warnings: ['Deleting this backup permanently removes a recovery point.'],
        });
      }
      ctx.backups.remove(scope.id, requireRel(req), (req.params as any).backupId);
      return reply.code(204).send();
    });

    // --- raw escape hatch + tree ---
    app.get('/scopes/:scopeId/raw', async (req) => {
      const scope = requireScope((req.params as any).scopeId);
      return ctx.files.read(scope, requireRel(req)); // unmasked — explicit hatch
    });
    app.put('/scopes/:scopeId/raw', async (req) => {
      const scope = requireScope((req.params as any).scopeId);
      const rel = requireRel(req);
      const body = req.body as any;
      assertRawParsable(rel, body.raw);
      return ctx.files.write(scope, rel, body.raw, {
        expectedSha256: body.expectedSha256,
        confirm: body.confirm,
      });
    });
    app.get('/scopes/:scopeId/tree', async (req) => {
      const scope = requireScope((req.params as any).scopeId);
      return { entries: listTree(ctx, scope, q(req, 'subdir')) };
    });

    // --- runtime summary (global, read-only) ---
    app.get('/scopes/:scopeId/runtime/summary', async (req) =>
      runtimeSummary(ctx, requireScope((req.params as any).scopeId)),
    );
  };
}

function assertType(type: string): asserts type is ArtifactType {
  if (!ARTIFACT_TYPES.includes(type as ArtifactType)) {
    throw new AppError('NOT_FOUND', `Unknown resource: ${type}`);
  }
}

function applyAppConfigPatch(ctx: AppContext, patch: Partial<AppConfig>): AppConfig {
  const allowed: Partial<AppConfig> = {};
  if (patch.theme) allowed.theme = patch.theme;
  if (typeof patch.revealSecrets === 'boolean') allowed.revealSecrets = patch.revealSecrets;
  if (Array.isArray(patch.hiddenProjects)) allowed.hiddenProjects = patch.hiddenProjects;
  for (const key of ['scanRoots', 'manualProjects'] as const) {
    if (Array.isArray(patch[key])) {
      const resolved = patch[key]!.map((p) => path.resolve(p));
      for (const p of resolved) {
        if (!ctx.sandbox.isWithinRoots(p)) {
          throw new AppError('BAD_REQUEST', `Path is outside the mounted roots: ${p}`);
        }
      }
      allowed[key] = resolved;
    }
  }
  return ctx.appConfig.update(allowed);
}

function computeValidate(kind: ValidateKind, body: { raw?: string; structured?: unknown }): ValidateResponse {
  let value = body.structured;
  if (value === undefined && body.raw !== undefined) {
    if (kind === 'settings' || kind === 'permissions' || kind === 'mcp' || kind === 'hooks') {
      try {
        value = JSON.parse(body.raw);
      } catch (e) {
        return { valid: false, issues: [{ path: '', message: `Invalid JSON: ${(e as Error).message}` }] };
      }
    } else if (kind === 'subagent' || kind === 'skill') {
      value = parseFrontmatter(body.raw).data;
    } else {
      value = body.raw;
    }
  }
  const issues = validate(kind, value);
  return { valid: issues.length === 0, issues };
}

function assertRawParsable(relPath: string, raw: string): void {
  if (relPath.endsWith('.json')) {
    try {
      JSON.parse(raw);
    } catch (e) {
      throw new AppError('VALIDATION_FAILED', `Invalid JSON: ${(e as Error).message}`, {
        issues: [{ path: '', message: (e as Error).message }],
      });
    }
  }
}

function listTree(ctx: AppContext, scope: ResolvedScope, subdir?: string): TreeEntry[] {
  const rel = subdir ?? scope.configSubdir ?? '';
  let dirAbs: string;
  try {
    dirAbs = ctx.sandbox.resolve(scope.rootDir, rel || '.');
  } catch {
    return [];
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TreeEntry[] = [];
  for (const e of entries) {
    const entryRel = rel ? `${rel}/${e.name}` : e.name;
    let size = 0;
    let mtimeMs = 0;
    try {
      const st = fs.statSync(path.join(dirAbs, e.name));
      size = st.size;
      mtimeMs = st.mtimeMs;
    } catch {
      /* ignore */
    }
    out.push({
      relPath: entryRel,
      type: e.isDirectory() ? 'dir' : 'file',
      size,
      mtimeMs,
      readOnly: ctx.files.isReadOnly(scope, entryRel),
    });
  }
  out.sort((a, b) => (a.type === b.type ? a.relPath.localeCompare(b.relPath) : a.type === 'dir' ? -1 : 1));
  return out;
}

function countEntries(dir: string, kind: 'file' | 'dir'): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => (kind === 'dir' ? e.isDirectory() : e.isFile())).length;
  } catch {
    return 0;
  }
}

function runtimeSummary(ctx: AppContext, scope: ResolvedScope): RuntimeSummary {
  if (scope.kind !== 'global') return {};
  const home = ctx.env.claudeHomeDir;
  const summary: RuntimeSummary = {
    sessionsCount: countEntries(path.join(home, 'sessions'), 'file'),
    projectsTracked: countEntries(path.join(home, 'projects'), 'dir'),
    tasksCount: countEntries(path.join(home, 'tasks'), 'dir'),
    plansCount: countEntries(path.join(home, 'plans'), 'file'),
  };
  const costs = readText(path.join(home, 'metrics', 'costs.jsonl'));
  if (costs) {
    let total = 0;
    for (const line of costs.content.split('\n')) {
      if (!line.trim()) continue;
      try {
        total += Number(JSON.parse(line).estimated_cost_usd ?? 0);
      } catch {
        /* skip */
      }
    }
    summary.totalCostUsd = Number(total.toFixed(4));
  }
  return summary;
}
