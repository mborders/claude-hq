import fs from 'node:fs';
import path from 'node:path';
import { GLOBAL_SCOPE_ID, decodeScopeId } from './scopeId';
import type { ServerEnv } from '../env';

export interface ResolvedScope {
  id: string;
  kind: 'global' | 'project';
  /** Scope root. All relPaths/FileMeta.relPath are relative to this. */
  rootDir: string;
  /** Directory holding `.claude` artifacts. */
  configDir: string;
  /** '' for global, '.claude' for project — prefix for config-relative paths. */
  configSubdir: string;
  label: string;
  claudeDir: string;
  exists: boolean;
}

/** Resolve a scope id into concrete directories. Does NOT enforce the sandbox. */
export function resolveScope(scopeId: string, env: ServerEnv): ResolvedScope {
  const decoded = decodeScopeId(scopeId);
  if (decoded.kind === 'global') {
    const dir = env.claudeHomeDir;
    return {
      id: GLOBAL_SCOPE_ID,
      kind: 'global',
      rootDir: dir,
      configDir: dir,
      configSubdir: '',
      label: 'Global · ~/.claude',
      claudeDir: dir,
      exists: fs.existsSync(dir),
    };
  }
  const projectPath = decoded.path;
  const claudeDir = path.join(projectPath, '.claude');
  return {
    id: scopeId,
    kind: 'project',
    rootDir: projectPath,
    configDir: claudeDir,
    configSubdir: '.claude',
    label: path.basename(projectPath),
    claudeDir,
    exists: fs.existsSync(claudeDir),
  };
}

/** Scope-root-relative path for a config artifact (adds `.claude/` prefix for projects). */
export function configRel(scope: ResolvedScope, rel: string): string {
  return scope.configSubdir ? `${scope.configSubdir}/${rel}` : rel;
}
