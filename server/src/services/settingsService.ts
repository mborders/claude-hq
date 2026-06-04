import path from 'node:path';
import type {
  ArtifactEnvelope,
  SettingsFile,
  SettingsResponse,
  SettingsVariant,
  KnownSettings,
  PermissionsBlock,
  HooksBlock,
  HookRow,
  WriteResult,
} from '@ccm/shared';
import { isBroadRule } from '@ccm/shared';
import { parseJsonFile, serializeJsonObject, type JsonFileModel } from '../fs/jsonFile';
import { readText } from '../fs/safeFs';
import { configRel, type ResolvedScope } from '../domain/paths';
import { validate } from '../schemas';
import { redactSettings, SECRET_MASK } from './redact';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';

const KNOWN_KEYS = new Set([
  'enabledPlugins',
  'extraKnownMarketplaces',
  'alwaysThinkingEnabled',
  'skipWorkflowUsageWarning',
  'preferredNotifChannel',
  'fastMode',
  'permissions',
  'env',
  'hooks',
  'model',
  'statusLine',
  'apiKeyHelper',
  'includeCoAuthoredBy',
  'cleanupPeriodDays',
  'outputStyle',
]);

function splitKnown(obj: Record<string, unknown>): {
  known: KnownSettings;
  unknown: Record<string, unknown>;
} {
  const known: Record<string, unknown> = {};
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (KNOWN_KEYS.has(k)) known[k] = v;
    else unknown[k] = v;
  }
  return { known: known as KnownSettings, unknown };
}

function mergeKnown(known: KnownSettings, unknown: Record<string, unknown>): Record<string, unknown> {
  return { ...(known as Record<string, unknown>), ...unknown };
}

function defaultVariant(scope: ResolvedScope): SettingsVariant {
  return scope.kind === 'project' ? 'local' : 'settings';
}

function variantRel(scope: ResolvedScope, variant: SettingsVariant): string {
  return configRel(scope, variant === 'local' ? 'settings.local.json' : 'settings.json');
}

const EMPTY_MODEL: Pick<JsonFileModel, 'indent' | 'trailingNewline' | 'keyOrder'> = {
  indent: 2,
  trailingNewline: true,
  keyOrder: [],
};

export class SettingsService {
  constructor(private readonly ctx: AppContext) {}

  private envelope(scope: ResolvedScope, variant: SettingsVariant): ArtifactEnvelope<SettingsFile> {
    const rel = variantRel(scope, variant);
    const { meta, raw } = this.ctx.files.read(scope, rel);
    if (!meta.exists) {
      return { kind: 'settings', meta, structured: { known: {}, unknown: {}, variant }, raw: '' };
    }
    try {
      const model = parseJsonFile(raw);
      const { known, unknown } = splitKnown(model.data);
      const { value: redKnown, fields } = redactSettings(known);
      const structured: SettingsFile = { known: redKnown, unknown, variant };
      const outRaw = fields.length ? serializeJsonObject(mergeKnown(redKnown, unknown), model) : raw;
      return {
        kind: 'settings',
        meta,
        structured,
        raw: outRaw,
        ...(fields.length ? { redactedFields: fields } : {}),
      };
    } catch (e) {
      return {
        kind: 'settings',
        meta,
        structured: null,
        raw,
        parseError: [{ path: '', message: `Invalid JSON: ${(e as Error).message}` }],
      };
    }
  }

  private rawKnown(scope: ResolvedScope, variant: SettingsVariant): KnownSettings {
    const rel = variantRel(scope, variant);
    const r = this.ctx.files.read(scope, rel);
    if (!r.meta.exists) return {};
    try {
      return splitKnown(parseJsonFile(r.raw).data).known;
    } catch {
      return {};
    }
  }

  private findInherited(scope: ResolvedScope): { path: string; known: KnownSettings } | null {
    if (scope.kind !== 'project') return null;
    let dir = path.dirname(scope.rootDir);
    for (let i = 0; i < 6; i++) {
      if (!this.ctx.sandbox.isWithinRoots(dir)) break;
      for (const file of ['settings.local.json', 'settings.json']) {
        const abs = path.join(dir, '.claude', file);
        const r = readText(abs);
        if (r) {
          try {
            return { path: abs, known: splitKnown(parseJsonFile(r.content).data).known };
          } catch {
            /* skip unparseable ancestor */
          }
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  getSettings(scope: ResolvedScope): SettingsResponse {
    const files: ArtifactEnvelope<SettingsFile>[] = [];
    for (const v of ['settings', 'local'] as SettingsVariant[]) {
      const env = this.envelope(scope, v);
      if (env.meta.exists) files.push(env);
    }
    const def = defaultVariant(scope);
    if (!files.some((f) => f.structured?.variant === def)) {
      files.unshift(this.envelope(scope, def));
    }
    files.sort((a, b) => (a.structured?.variant === def ? -1 : 1) - (b.structured?.variant === def ? -1 : 1));

    const inherited = this.findInherited(scope);
    const base = this.rawKnown(scope, 'settings');
    const local = this.rawKnown(scope, 'local');
    const effective: KnownSettings = { ...(inherited?.known ?? {}), ...base, ...local };

    return {
      files,
      effective,
      ...(inherited ? { inheritedFrom: inherited.path } : {}),
    };
  }

  /** Merge a partial structured edit into a settings file, preserving siblings + formatting. */
  private writeMerged(
    scope: ResolvedScope,
    variant: SettingsVariant,
    mutate: (data: Record<string, unknown>) => string[],
    opts: { expectedSha256?: string; confirm?: boolean },
  ): Promise<WriteResult> {
    const rel = variantRel(scope, variant);
    // Read-modify-write happens atomically inside the file lock (writeTransform)
    // so concurrent edits can't drop each other's keys.
    return this.ctx.files.writeTransform(
      scope,
      rel,
      (currentRaw, exists) => {
        const model: JsonFileModel =
          exists && currentRaw.trim() ? parseJsonFile(currentRaw) : { data: {}, ...EMPTY_MODEL };
        const warnings = mutate(model.data);
        const issues = validate('settings', model.data);
        if (issues.length) throw new AppError('VALIDATION_FAILED', 'Settings are invalid.', { issues });
        return { content: serializeJsonObject(model.data, model), warnings };
      },
      {
        mode: 0o600,
        ...(opts.expectedSha256 !== undefined ? { expectedSha256: opts.expectedSha256 } : {}),
        ...(opts.confirm !== undefined ? { confirm: opts.confirm } : {}),
      },
    );
  }

  writeSettings(
    scope: ResolvedScope,
    variant: SettingsVariant,
    file: SettingsFile,
    opts: { expectedSha256?: string; confirm?: boolean },
  ): Promise<WriteResult> {
    const merged = mergeKnown(file.known, file.unknown);
    return this.writeMerged(
      scope,
      variant,
      (data) => {
        // `data` is the real on-disk settings (unmasked) read inside the lock.
        const oldEnv = (data.env as Record<string, string>) ?? {};
        const oldPerms = (data.permissions as PermissionsBlock) ?? {};
        // Replace top-level keys with the submitted set (known + unknown).
        for (const k of Object.keys(data)) delete data[k];
        Object.assign(data, merged);
        // Restore any env value the client sent back still masked, so a faithful
        // read-modify-write never persists the redaction placeholder over a secret.
        reconstituteSecrets(data.env as Record<string, string> | undefined, oldEnv);
        // Gate destructive permission changes made via the full-settings path too.
        return data.permissions
          ? permissionWarnings(oldPerms, data.permissions as PermissionsBlock)
          : [];
      },
      opts,
    );
  }

  // --- permissions sub-view ---

  getPermissions(
    scope: ResolvedScope,
    variant?: SettingsVariant,
  ): ArtifactEnvelope<PermissionsBlock> {
    const v = variant ?? defaultVariant(scope);
    const env = this.envelope(scope, v);
    const perms: PermissionsBlock = (env.structured?.known.permissions as PermissionsBlock) ?? {
      allow: [],
      deny: [],
    };
    return {
      kind: 'permissions',
      meta: env.meta,
      structured: perms,
      raw: JSON.stringify(perms, null, 2),
    };
  }

  writePermissions(
    scope: ResolvedScope,
    permissions: PermissionsBlock,
    opts: { variant?: SettingsVariant; expectedSha256?: string; confirm?: boolean },
  ): Promise<WriteResult> {
    const issues = validate('permissions', permissions);
    if (issues.length) throw new AppError('VALIDATION_FAILED', 'Permissions are invalid.', { issues });
    const v = opts.variant ?? defaultVariant(scope);
    return this.writeMerged(
      scope,
      v,
      (data) => {
        const prev = (data.permissions as PermissionsBlock) ?? {};
        data.permissions = permissions;
        return permissionWarnings(prev, permissions);
      },
      opts,
    );
  }

  // --- hooks ---

  getHooks(scope: ResolvedScope, variant?: SettingsVariant): { rows: HookRow[]; raw: HooksBlock } {
    const v = variant ?? defaultVariant(scope);
    const hooks = (this.rawKnown(scope, v).hooks ?? {}) as HooksBlock;
    return { rows: hooksToRows(hooks), raw: hooks };
  }

  writeHooks(
    scope: ResolvedScope,
    rows: HookRow[],
    opts: { variant?: SettingsVariant; expectedSha256?: string; confirm?: boolean },
  ): Promise<WriteResult> {
    const hooks = rowsToHooks(rows);
    const issues = validate('hooks', hooks);
    if (issues.length) throw new AppError('VALIDATION_FAILED', 'Hooks are invalid.', { issues });
    const v = opts.variant ?? defaultVariant(scope);
    return this.writeMerged(
      scope,
      v,
      (data) => {
        if (Object.keys(hooks).length === 0) delete data.hooks;
        else data.hooks = hooks;
        return [];
      },
      opts,
    );
  }

  // --- plugins / marketplaces (edit settings.json) ---

  setEnabledPlugin(
    scope: ResolvedScope,
    pluginId: string,
    enabled: boolean,
    opts: { confirm?: boolean } = {},
  ): Promise<WriteResult> {
    return this.writeMerged(
      scope,
      defaultVariant(scope),
      (data) => {
        const ep = (data.enabledPlugins as Record<string, boolean>) ?? {};
        ep[pluginId] = enabled;
        data.enabledPlugins = ep;
        return [];
      },
      opts,
    );
  }

  /** Remove an enabledPlugins entry entirely (used when moving a plugin to another scope). */
  removeEnabledPlugin(scope: ResolvedScope, pluginId: string): Promise<WriteResult> {
    return this.writeMerged(
      scope,
      defaultVariant(scope),
      (data) => {
        const ep = (data.enabledPlugins as Record<string, boolean>) ?? {};
        delete ep[pluginId];
        if (Object.keys(ep).length === 0) delete data.enabledPlugins;
        else data.enabledPlugins = ep;
        return [];
      },
      {},
    );
  }

  addMarketplace(scope: ResolvedScope, name: string, repo: string): Promise<WriteResult> {
    return this.writeMerged(
      scope,
      defaultVariant(scope),
      (data) => {
        const m = (data.extraKnownMarketplaces as Record<string, unknown>) ?? {};
        m[name] = { source: { source: 'github', repo } };
        data.extraKnownMarketplaces = m;
        return [];
      },
      {},
    );
  }

  removeMarketplace(scope: ResolvedScope, name: string, opts: { confirm?: boolean } = {}): Promise<WriteResult> {
    return this.writeMerged(
      scope,
      defaultVariant(scope),
      (data) => {
        const m = (data.extraKnownMarketplaces as Record<string, unknown>) ?? {};
        delete m[name];
        data.extraKnownMarketplaces = m;
        return [`Remove marketplace "${name}"?`];
      },
      opts,
    );
  }
}

/** Restore masked-but-unchanged secret values from the prior on-disk record. */
function reconstituteSecrets(next: Record<string, string> | undefined, prev: Record<string, string>): void {
  if (!next) return;
  for (const [k, v] of Object.entries(next)) {
    if (v === SECRET_MASK) {
      if (k in prev) next[k] = prev[k]!;
      else delete next[k]; // never persist the mask itself
    }
  }
}

function permissionWarnings(prev: PermissionsBlock, next: PermissionsBlock): string[] {
  const warnings: string[] = [];
  if ((prev.deny?.length ?? 0) > 0 && (next.deny?.length ?? 0) === 0) {
    warnings.push('You are clearing all deny rules.');
  }
  for (const r of [...(next.allow ?? []), ...(next.ask ?? [])]) {
    if (isBroadRule(r)) warnings.push(`Broad rule grants wide access: ${r}`);
  }
  return warnings;
}

function hooksToRows(hooks: HooksBlock): HookRow[] {
  const rows: HookRow[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    for (const g of groups ?? []) {
      for (const h of g.hooks ?? []) {
        rows.push({
          event,
          ...(g.matcher !== undefined ? { matcher: g.matcher } : {}),
          command: h.command,
          ...(h.timeout !== undefined ? { timeout: h.timeout } : {}),
        });
      }
    }
  }
  return rows;
}

function rowsToHooks(rows: HookRow[]): HooksBlock {
  const out: HooksBlock = {};
  for (const row of rows) {
    const groups = (out[row.event] ??= []);
    let group = groups.find((g) => (g.matcher ?? '') === (row.matcher ?? ''));
    if (!group) {
      group = { ...(row.matcher !== undefined ? { matcher: row.matcher } : {}), hooks: [] };
      groups.push(group);
    }
    group.hooks.push({
      type: 'command',
      command: row.command,
      ...(row.timeout !== undefined ? { timeout: row.timeout } : {}),
    });
  }
  return out;
}
