import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathSandbox } from '../fs/sandbox';
import { BackupStore } from '../fs/backup';
import { FileService } from './fileService';
import { resolveScope } from '../domain/paths';
import { encodeProjectScopeId } from '../domain/scopeId';
import type { ServerEnv } from '../env';

let claudeHome: string;
let projectsRoot: string;
let appData: string;

function makeEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    port: 0,
    host: '127.0.0.1',
    claudeHomeDir: claudeHome,
    projectsRoots: [projectsRoot],
    appDataDir: appData,
    webDistDir: path.join(appData, 'web'),
    readOnly: false,
    nodeEnv: 'test',
    logLevel: 'silent',
    ...overrides,
  };
}

function makeService(env: ServerEnv) {
  const sandbox = new PathSandbox([env.claudeHomeDir, ...env.projectsRoots]);
  return new FileService(sandbox, new BackupStore(env.appDataDir), env);
}

beforeEach(() => {
  claudeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-home-')));
  projectsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-proj-')));
  appData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-data-')));
});
afterEach(() => {
  for (const d of [claudeHome, projectsRoot, appData]) fs.rmSync(d, { recursive: true, force: true });
});

describe('FileService write pipeline (global scope)', () => {
  it('creates a new file (no backup) and reads it back', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const scope = resolveScope('global', env);

    const res = await svc.write(scope, 'settings.json', '{"a":1}');
    expect(res.meta.exists).toBe(true);
    expect(res.backup).toBeUndefined();
    expect(svc.read(scope, 'settings.json').raw).toBe('{"a":1}');
  });

  it('backs up the previous content on overwrite', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const scope = resolveScope('global', env);
    await svc.write(scope, 'settings.json', 'OLD');
    const res = await svc.write(scope, 'settings.json', 'NEW');
    expect(res.backup).toBeDefined();
    expect(svc.read(scope, 'settings.json').raw).toBe('NEW');
  });

  it('rejects a stale write (sha mismatch) with STALE_WRITE', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const scope = resolveScope('global', env);
    const first = await svc.write(scope, 'settings.json', 'V1');
    // external change out-of-band
    fs.writeFileSync(path.join(claudeHome, 'settings.json'), 'EXTERNAL');
    await expect(
      svc.write(scope, 'settings.json', 'V2', { expectedSha256: first.meta.sha256 }),
    ).rejects.toMatchObject({ code: 'STALE_WRITE' });
  });

  it('forbids writing to runtime-readonly subtrees', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const scope = resolveScope('global', env);
    await expect(svc.write(scope, 'sessions/x.jsonl', 'nope')).rejects.toMatchObject({
      code: 'FORBIDDEN_READONLY',
    });
  });

  it('refuses all writes in READ_ONLY mode', async () => {
    const env = makeEnv({ readOnly: true });
    const svc = makeService(env);
    const scope = resolveScope('global', env);
    await expect(svc.write(scope, 'settings.json', 'x')).rejects.toMatchObject({
      code: 'READ_ONLY_MODE',
    });
  });

  it('requires confirmation when warnings are present', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const scope = resolveScope('global', env);
    await expect(
      svc.write(scope, 'settings.json', 'x', { warnings: ['risky'] }),
    ).rejects.toMatchObject({ code: 'CONFIRM_REQUIRED' });
    const ok = await svc.write(scope, 'settings.json', 'x', { warnings: ['risky'], confirm: true });
    expect(ok.meta.exists).toBe(true);
  });

  it('deletes a file, returning a backup', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const scope = resolveScope('global', env);
    await svc.write(scope, 'agents/foo.md', '# foo');
    const res = await svc.delete(scope, 'agents/foo.md');
    expect(res.backup).toBeDefined();
    expect(svc.read(scope, 'agents/foo.md').meta.exists).toBe(false);
  });
});

describe('FileService (project scope)', () => {
  it('writes under <project>/.claude with the right relPath', async () => {
    const env = makeEnv();
    const svc = makeService(env);
    const projectPath = path.join(projectsRoot, 'my-app');
    fs.mkdirSync(projectPath);
    const scope = resolveScope(encodeProjectScopeId(projectPath), env);

    const res = await svc.write(scope, '.claude/settings.local.json', '{"permissions":{}}');
    expect(res.meta.exists).toBe(true);
    expect(fs.existsSync(path.join(projectPath, '.claude/settings.local.json'))).toBe(true);
  });
});
