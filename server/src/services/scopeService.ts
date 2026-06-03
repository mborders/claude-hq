import fs from 'node:fs';
import path from 'node:path';
import type { Scope, ProjectRef, ScopesResponse } from '@ccm/shared';
import { GLOBAL_SCOPE_ID, encodeProjectScopeId } from '../domain/scopeId';
import { resolveScope, type ResolvedScope } from '../domain/paths';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.next', '.cache', 'vendor', 'target']);

function hasMemory(projectPath: string): boolean {
  return (
    fs.existsSync(path.join(projectPath, 'CLAUDE.md')) ||
    fs.existsSync(path.join(projectPath, '.claude', 'CLAUDE.md'))
  );
}

function countConfiguredModules(projectPath: string): number {
  const claudeDir = path.join(projectPath, '.claude');
  const checks = [
    path.join(claudeDir, 'settings.json'),
    path.join(claudeDir, 'settings.local.json'),
    path.join(claudeDir, 'agents'),
    path.join(claudeDir, 'commands'),
    path.join(claudeDir, 'skills'),
    path.join(claudeDir, 'hooks'),
    path.join(projectPath, '.mcp.json'),
  ];
  let n = checks.reduce((acc, c) => acc + (fs.existsSync(c) ? 1 : 0), 0);
  if (hasMemory(projectPath)) n += 1;
  return n;
}

function toProjectRef(projectPath: string, source: 'scanned' | 'manual', scanRoot?: string): ProjectRef {
  const claudeDir = path.join(projectPath, '.claude');
  return {
    id: encodeProjectScopeId(projectPath),
    name: path.basename(projectPath),
    path: projectPath,
    claudeDir,
    hasClaudeDir: fs.existsSync(claudeDir),
    hasMemory: hasMemory(projectPath),
    source,
    ...(scanRoot ? { scanRoot } : {}),
    configuredModules: countConfiguredModules(projectPath),
  };
}

export class ScopeService {
  constructor(private readonly ctx: AppContext) {}

  globalScope(): Scope {
    const s = resolveScope(GLOBAL_SCOPE_ID, this.ctx.env);
    return { id: s.id, kind: s.kind, label: s.label, rootPath: s.rootDir, claudeDir: s.claudeDir, exists: s.exists };
  }

  listProjects(): ProjectRef[] {
    const cfg = this.ctx.appConfig.load();
    const hidden = new Set(cfg.hiddenProjects);
    const seen = new Set<string>();
    const out: ProjectRef[] = [];

    // env.projectsRoots is authoritative (and correct in Docker); persisted
    // scanRoots are additive. A root that doesn't exist in this context (e.g. a
    // host path persisted then read inside a container) is simply skipped.
    const roots = [...new Set([...this.ctx.env.projectsRoots, ...cfg.scanRoots])];
    for (const root of roots) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name.startsWith('.') || IGNORE_DIRS.has(e.name)) continue;
        const p = path.join(root, e.name);
        try {
          if (!fs.statSync(p).isDirectory()) continue;
        } catch {
          continue;
        }
        if (seen.has(p)) continue;
        seen.add(p);
        if (!hidden.has(p)) out.push(toProjectRef(p, 'scanned', root));
      }
    }

    for (const p of cfg.manualProjects) {
      if (seen.has(p) || hidden.has(p) || !fs.existsSync(p)) continue;
      seen.add(p);
      out.push(toProjectRef(p, 'manual'));
    }

    out.sort(
      (a, b) => Number(b.hasClaudeDir) - Number(a.hasClaudeDir) || a.name.localeCompare(b.name),
    );
    return out;
  }

  listScopes(): ScopesResponse {
    return { global: this.globalScope(), projects: this.listProjects() };
  }

  /** Resolve + sandbox-validate a scope; throws on an unknown or out-of-bounds scope. */
  requireScope(scopeId: string): ResolvedScope {
    let scope: ResolvedScope;
    try {
      scope = resolveScope(scopeId, this.ctx.env);
    } catch {
      throw new AppError('NOT_FOUND', `Unknown scope: ${scopeId}`);
    }
    this.ctx.sandbox.assertAllowedBase(scope.rootDir);
    // A "project" scope that resolves into the global claude home would escape
    // the runtime-readonly rules (which only apply to the global scope). Reject
    // it — the user config must be edited via the Global scope.
    if (scope.kind === 'project') {
      const home = this.ctx.env.claudeHomeDir;
      const rel = path.relative(home, scope.rootDir);
      if (scope.rootDir === home || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
        throw new AppError('FORBIDDEN_PATH', 'Use the Global scope to edit the user config directory.');
      }
    }
    return scope;
  }

  getScope(scopeId: string): Scope {
    const s = this.requireScope(scopeId);
    return { id: s.id, kind: s.kind, label: s.label, rootPath: s.rootDir, claudeDir: s.claudeDir, exists: s.exists };
  }

  addManualProject(p: string): ProjectRef {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new AppError('BAD_REQUEST', `Not a directory: ${abs}`);
    }
    if (!this.ctx.sandbox.isWithinRoots(abs)) {
      throw new AppError('FORBIDDEN_PATH', `Path is outside the mounted roots: ${abs}`);
    }
    const cfg = this.ctx.appConfig.load();
    if (!cfg.manualProjects.includes(abs)) {
      this.ctx.appConfig.update({
        manualProjects: [...cfg.manualProjects, abs],
        hiddenProjects: cfg.hiddenProjects.filter((h) => h !== abs),
      });
    }
    return toProjectRef(abs, 'manual');
  }

  removeManualProject(p: string): void {
    const abs = path.resolve(p);
    const cfg = this.ctx.appConfig.load();
    this.ctx.appConfig.update({ manualProjects: cfg.manualProjects.filter((x) => x !== abs) });
  }

  hideProject(scopeId: string): void {
    const s = this.requireScope(scopeId);
    const cfg = this.ctx.appConfig.load();
    if (!cfg.hiddenProjects.includes(s.rootDir)) {
      this.ctx.appConfig.update({ hiddenProjects: [...cfg.hiddenProjects, s.rootDir] });
    }
  }

  initScope(scopeId: string): Scope {
    if (this.ctx.env.readOnly) throw new AppError('READ_ONLY_MODE', 'The server is read-only.');
    const s = this.requireScope(scopeId);
    fs.mkdirSync(s.claudeDir, { recursive: true });
    return this.getScope(scopeId);
  }
}
