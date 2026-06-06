import fs from 'node:fs';
import path from 'node:path';
import type { TransferRequest, TransferResult, McpServer, HookRow } from '@claude-hq/shared';
import { configRel, type ResolvedScope } from '../domain/paths';
import { lstatSafe, removeDirSafe } from '../fs/safeFs';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';
import { ScopeService } from './scopeService';
import { SettingsService } from './settingsService';
import { McpService } from './mcpService';
import { PluginsService } from './pluginsService';

export class TransferService {
  private readonly scopes: ScopeService;
  private readonly settings: SettingsService;
  private readonly mcp: McpService;
  private readonly plugins: PluginsService;

  constructor(private readonly ctx: AppContext) {
    this.scopes = new ScopeService(ctx);
    this.settings = new SettingsService(ctx);
    this.mcp = new McpService(ctx);
    this.plugins = new PluginsService(ctx, this.settings);
  }

  async transfer(req: TransferRequest): Promise<TransferResult> {
    if (this.ctx.env.readOnly) throw new AppError('READ_ONLY_MODE', 'The server is read-only.');
    if (req.fromScopeId === req.toScopeId) {
      throw new AppError('BAD_REQUEST', 'Source and destination are the same scope.');
    }
    const from = this.scopes.requireScope(req.fromScopeId);
    const to = this.scopes.requireScope(req.toScopeId);

    switch (req.type) {
      case 'agents':
      case 'commands':
        return this.transferFile(req, from, to);
      case 'skills':
        return this.transferSkill(req, from, to);
      case 'mcp':
        return this.transferMcp(req, from, to);
      case 'hooks':
        return this.transferHook(req, from, to);
      case 'plugins':
        return this.transferPlugin(req, from, to);
      default:
        throw new AppError('BAD_REQUEST', `Unknown transfer type: ${req.type}`);
    }
  }

  private ensureClaudeDir(scope: ResolvedScope): void {
    fs.mkdirSync(scope.claudeDir, { recursive: true });
  }

  // --- agents / commands (single markdown file) ---

  private async transferFile(req: TransferRequest, from: ResolvedScope, to: ResolvedScope): Promise<TransferResult> {
    const name = req.name;
    if (!name) throw new AppError('BAD_REQUEST', 'name is required.');
    const fromRel = configRel(from, `${req.type}/${name}.md`);
    const toRel = configRel(to, `${req.type}/${name}.md`);

    const src = this.ctx.files.read(from, fromRel);
    if (!src.meta.exists) throw new AppError('NOT_FOUND', `Not found: ${name}`);
    if (this.ctx.files.meta(to, toRel).exists && !req.confirm) {
      throw new AppError('CONFIRM_REQUIRED', `"${name}" already exists in ${to.label}.`, {
        warnings: [`Overwrite "${name}" in ${to.label}?`],
      });
    }
    this.ensureClaudeDir(to);
    await this.ctx.files.write(to, toRel, src.raw, { mode: 0o644 });

    let removedFromSource = false;
    if (req.mode === 'move') {
      await this.ctx.files.delete(from, fromRel, { confirm: true });
      removedFromSource = true;
    }
    return { ok: true, destRelPath: toRel, removedFromSource };
  }

  // --- skills (a directory: SKILL.md + references/examples/...) ---

  private async transferSkill(req: TransferRequest, from: ResolvedScope, to: ResolvedScope): Promise<TransferResult> {
    const name = req.name;
    if (!name) throw new AppError('BAD_REQUEST', 'name is required.');
    const fromDirRel = configRel(from, `skills/${name}`);
    const toDirRel = configRel(to, `skills/${name}`);
    const fromAbs = this.ctx.sandbox.resolve(from.rootDir, fromDirRel);
    const toAbs = this.ctx.sandbox.resolve(to.rootDir, toDirRel);
    // Literal (non-realpathed) dirs for symlink-safe removal: a planted
    // skills/<name> symlink must not redirect the rmSync/copy onto its target.
    const fromLiteral = path.join(from.rootDir, fromDirRel);
    const toLiteral = path.join(to.rootDir, toDirRel);

    if (!fs.existsSync(path.join(fromAbs, 'SKILL.md'))) {
      throw new AppError('NOT_FOUND', `Skill not found: ${name}`);
    }
    if (lstatSafe(toLiteral)?.isSymbolicLink()) {
      throw new AppError('FORBIDDEN_PATH', `Destination skill "${name}" is a symlink in ${to.label}; refusing to overwrite it.`);
    }
    if (fs.existsSync(toAbs) && !req.confirm) {
      throw new AppError('CONFIRM_REQUIRED', `Skill "${name}" already exists in ${to.label}.`, {
        warnings: [`Overwrite skill "${name}" in ${to.label}?`],
      });
    }
    this.ensureClaudeDir(to);
    removeDirSafe(toLiteral); // clean replace (refuses to follow a symlink)
    copyDir(fromAbs, toAbs);

    let removedFromSource = false;
    if (req.mode === 'move') {
      removeDirSafe(fromLiteral);
      removedFromSource = true;
    }
    return { ok: true, destRelPath: `${toDirRel}/SKILL.md`, removedFromSource };
  }

  // --- mcp server (.mcp.json entry) ---

  private async transferMcp(req: TransferRequest, from: ResolvedScope, to: ResolvedScope): Promise<TransferResult> {
    const id = req.id;
    if (!id) throw new AppError('BAD_REQUEST', 'id is required.');
    const server = this.mcp.list(from, true).servers.find((s) => s.id === id);
    if (!server) throw new AppError('NOT_FOUND', `MCP server not found: ${id}`);
    if (this.mcp.list(to, true).servers.some((s) => s.id === id) && !req.confirm) {
      throw new AppError('CONFIRM_REQUIRED', `MCP server "${id}" already exists in ${to.label}.`, {
        warnings: [`Overwrite "${id}" in ${to.label}?`],
      });
    }
    this.ensureClaudeDir(to);
    await this.mcp.upsert(to, id, toMcpBody(server), {});

    let removedFromSource = false;
    if (req.mode === 'move') {
      await this.mcp.remove(from, id, { confirm: true });
      removedFromSource = true;
    }
    return { ok: true, removedFromSource };
  }

  // --- hook (settings.hooks row) ---

  private async transferHook(req: TransferRequest, from: ResolvedScope, to: ResolvedScope): Promise<TransferResult> {
    const hook = req.hook;
    if (!hook) throw new AppError('BAD_REQUEST', 'hook is required.');
    this.ensureClaudeDir(to);
    const destRows = this.settings.getHooks(to).rows;
    if (!destRows.some((r) => sameHook(r, hook))) {
      await this.settings.writeHooks(to, [...destRows, hook], { confirm: true });
    }
    let removedFromSource = false;
    if (req.mode === 'move') {
      const srcRows = this.settings.getHooks(from).rows;
      await this.settings.writeHooks(from, srcRows.filter((r) => !sameHook(r, hook)), { confirm: true });
      removedFromSource = true;
    }
    return { ok: true, removedFromSource };
  }

  // --- plugin (enabledPlugins entry + marketplace source) ---

  private async transferPlugin(req: TransferRequest, from: ResolvedScope, to: ResolvedScope): Promise<TransferResult> {
    const pluginId = req.pluginId;
    if (!pluginId) throw new AppError('BAD_REQUEST', 'pluginId is required.');
    this.ensureClaudeDir(to);
    const marketplace = pluginId.split('@').pop() ?? '';
    const mkt = this.plugins.getPlugins(from).marketplaces.find((m) => m.name === marketplace);
    const repo = (mkt?.source as { repo?: string } | undefined)?.repo;
    if (repo) await this.settings.addMarketplace(to, marketplace, repo);
    await this.settings.setEnabledPlugin(to, pluginId, true);

    let removedFromSource = false;
    if (req.mode === 'move') {
      await this.settings.removeEnabledPlugin(from, pluginId);
      removedFromSource = true;
    }
    return { ok: true, removedFromSource };
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function sameHook(a: HookRow, b: HookRow): boolean {
  return (
    a.event === b.event &&
    (a.matcher ?? '') === (b.matcher ?? '') &&
    a.command === b.command &&
    (a.timeout ?? null) === (b.timeout ?? null)
  );
}

function toMcpBody(s: McpServer): Record<string, unknown> {
  if (s.transport === 'stdio') {
    return {
      command: s.command,
      ...(s.args && s.args.length ? { args: s.args } : {}),
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
    };
  }
  return {
    type: s.transport,
    url: s.url,
    ...(s.headers && Object.keys(s.headers).length ? { headers: s.headers } : {}),
  };
}
