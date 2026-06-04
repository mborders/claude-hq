import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadEnv } from './env';

let claudeHome: string;
let projectsRoot: string;
let appData: string;
let app: FastifyInstance;
let projectId: string;

function seed() {
  fs.writeFileSync(
    path.join(claudeHome, 'settings.json'),
    JSON.stringify(
      {
        enabledPlugins: { 'frontend-design@official': true },
        permissions: { allow: ['WebSearch'], deny: [] },
        env: { SECRET_TOKEN: 'super-secret-value' },
      },
      null,
      2,
    ) + '\n',
  );
  fs.mkdirSync(path.join(projectsRoot, 'my-app', '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(projectsRoot, 'my-app', '.claude', 'settings.local.json'),
    JSON.stringify({ permissions: { allow: ['Bash(git:*)'] } }, null, 2) + '\n',
  );
  fs.writeFileSync(path.join(projectsRoot, 'my-app', 'CLAUDE.md'), '# My App\n\nProject notes.\n');
}

beforeEach(async () => {
  claudeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-home-')));
  projectsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-proj-')));
  appData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-data-')));
  seed();
  const env = loadEnv({
    NODE_ENV: 'test',
    CLAUDE_HOME_DIR: claudeHome,
    PROJECTS_ROOTS: projectsRoot,
    APP_DATA_DIR: appData,
    WEB_DIST_DIR: path.join(appData, 'web'),
  });
  app = await buildApp({ env });
  const scopes = (await app.inject({ method: 'GET', url: '/api/scopes' })).json();
  projectId = scopes.projects.find((p: any) => p.name === 'my-app').id;
});

afterEach(async () => {
  await app.close();
  for (const d of [claudeHome, projectsRoot, appData]) fs.rmSync(d, { recursive: true, force: true });
});

describe('API integration', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toMatchObject({ ok: true, claudeHome });
  });

  it('lists global + project scopes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/scopes' });
    const body = res.json();
    expect(body.global.exists).toBe(true);
    const proj = body.projects.find((p: any) => p.name === 'my-app');
    expect(proj.hasClaudeDir).toBe(true);
    expect(proj.hasMemory).toBe(true);
  });

  it('redacts env secrets in settings', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/scopes/global/settings' });
    const body = res.json();
    const file = body.files.find((f: any) => f.structured?.known.env);
    expect(file.structured.known.env.SECRET_TOKEN).not.toBe('super-secret-value');
    expect(file.redactedFields).toContain('env.SECRET_TOKEN');
    // raw escape hatch reveals the true value
    const raw = await app.inject({ method: 'GET', url: '/api/scopes/global/raw?relPath=settings.json' });
    expect(raw.json().raw).toContain('super-secret-value');
  });

  it('edits permissions WITHOUT dropping enabledPlugins or env (format-preserving)', async () => {
    const before = (await app.inject({ method: 'GET', url: '/api/scopes/global/permissions' })).json();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/permissions',
      payload: {
        structured: { allow: ['WebSearch', 'Read(/repo/**)'], deny: [] },
        expectedSha256: before.meta.sha256,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().backup).toBeTruthy();

    const onDisk = JSON.parse(fs.readFileSync(path.join(claudeHome, 'settings.json'), 'utf8'));
    expect(onDisk.enabledPlugins).toEqual({ 'frontend-design@official': true });
    expect(onDisk.env).toEqual({ SECRET_TOKEN: 'super-secret-value' });
    expect(onDisk.permissions.allow).toContain('Read(/repo/**)');
  });

  it('rejects a stale permissions write with 409', async () => {
    const before = (await app.inject({ method: 'GET', url: '/api/scopes/global/permissions' })).json();
    // external change
    fs.writeFileSync(path.join(claudeHome, 'settings.json'), '{"permissions":{"allow":[]}}');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/permissions',
      payload: { structured: { allow: ['X'] }, expectedSha256: before.meta.sha256 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('STALE_WRITE');
  });

  it('requires confirmation for a broad rule', async () => {
    const noConfirm = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/permissions',
      payload: { structured: { allow: ['Bash(*)'] } },
    });
    expect(noConfirm.statusCode).toBe(409);
    expect(noConfirm.json().code).toBe('CONFIRM_REQUIRED');

    const confirmed = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/permissions',
      payload: { structured: { allow: ['Bash(*)'] }, confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);
  });

  it('creates, reads, and deletes a subagent', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/scopes/global/agents',
      payload: { name: 'tester', structured: { frontmatter: { name: 'tester', description: 'A test agent' }, body: '# Tester\n' } },
    });
    expect(create.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: '/api/scopes/global/agents/tester' });
    expect(get.json().structured.frontmatter.name).toBe('tester');

    const del = await app.inject({ method: 'DELETE', url: '/api/scopes/global/agents/tester?confirm=true' });
    expect(del.statusCode).toBe(200);
    expect(fs.existsSync(path.join(claudeHome, 'agents', 'tester.md'))).toBe(false);
  });

  it('rejects an invalid subagent (missing description) with 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scopes/global/agents',
      payload: { name: 'bad', structured: { frontmatter: { name: 'bad' }, body: '' } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION_FAILED');
  });

  it('forbids writing runtime-readonly paths via the raw hatch', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/raw?relPath=sessions/x.json',
      payload: { raw: '{}' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN_READONLY');
  });

  it('lists and restores a backup', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/permissions',
      payload: { structured: { allow: ['WebSearch', 'Grep'] } },
    });
    const backups = (
      await app.inject({ method: 'GET', url: '/api/scopes/global/backups?relPath=settings.json' })
    ).json().backups;
    expect(backups.length).toBeGreaterThan(0);

    const restore = await app.inject({
      method: 'POST',
      url: `/api/scopes/global/backups/${backups[0].id}/restore`,
      payload: { relPath: 'settings.json', confirm: true },
    });
    expect(restore.statusCode).toBe(200);
  });

  it('reads project-scope permissions', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/scopes/${projectId}/permissions` });
    expect(res.json().structured.allow).toContain('Bash(git:*)');
  });

  it('returns JSON 404 for unknown api routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('does NOT write the redaction mask over a real env secret on full-settings save (C1)', async () => {
    const settings = (await app.inject({ method: 'GET', url: '/api/scopes/global/settings' })).json();
    const file = settings.files.find((f: any) => f.structured?.known.env);
    expect(file.structured.known.env.SECRET_TOKEN).not.toBe('super-secret-value'); // masked on read
    const variant = file.structured.variant === 'local' ? 'local' : 'settings';
    const res = await app.inject({
      method: 'PUT',
      url: `/api/scopes/global/settings/${variant}`,
      payload: { structured: file.structured, expectedSha256: file.meta.sha256 },
    });
    expect(res.statusCode).toBe(200);
    const onDisk = JSON.parse(fs.readFileSync(path.join(claudeHome, 'settings.json'), 'utf8'));
    expect(onDisk.env.SECRET_TOKEN).toBe('super-secret-value'); // real secret preserved
    expect(onDisk.enabledPlugins).toEqual({ 'frontend-design@official': true });
  });

  it('preserves a real MCP header secret on round-trip (C2)', async () => {
    fs.writeFileSync(
      path.join(claudeHome, '.mcp.json'),
      JSON.stringify(
        { mcpServers: { api: { type: 'http', url: 'https://x.com/mcp', headers: { Authorization: 'Bearer real-token' } } } },
        null,
        2,
      ),
    );
    const list = (await app.inject({ method: 'GET', url: '/api/scopes/global/mcp' })).json();
    const server = list.servers.find((s: any) => s.id === 'api');
    expect(server.headers.Authorization).not.toBe('Bearer real-token'); // masked
    const res = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/mcp/api',
      payload: { server: { type: 'http', url: server.url, headers: server.headers } },
    });
    expect(res.statusCode).toBe(200);
    const onDisk = JSON.parse(fs.readFileSync(path.join(claudeHome, '.mcp.json'), 'utf8'));
    expect(onDisk.mcpServers.api.headers.Authorization).toBe('Bearer real-token');
  });

  it('gates a broad permission rule added via the full-settings path (H2)', async () => {
    const settings = (await app.inject({ method: 'GET', url: '/api/scopes/global/settings' })).json();
    const file = settings.files[0];
    const structured = {
      ...file.structured,
      known: { ...file.structured.known, permissions: { allow: ['Bash(*)'] } },
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/scopes/global/settings/settings',
      payload: { structured },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CONFIRM_REQUIRED');
  });

  async function makeProjectAgent(name: string, body = '# m') {
    return app.inject({
      method: 'POST',
      url: `/api/scopes/${projectId}/agents`,
      payload: { name, structured: { frontmatter: { name, description: 'd' }, body } },
    });
  }

  it('copies an agent from a project to global, keeping the source', async () => {
    await makeProjectAgent('mover');
    const res = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: { type: 'agents', name: 'mover', fromScopeId: projectId, toScopeId: 'global', mode: 'copy' },
    });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(path.join(claudeHome, 'agents', 'mover.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectsRoot, 'my-app', '.claude', 'agents', 'mover.md'))).toBe(true);
  });

  it('moves an agent (removes source) and gates a destination conflict', async () => {
    await makeProjectAgent('mv2');
    const move = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: { type: 'agents', name: 'mv2', fromScopeId: projectId, toScopeId: 'global', mode: 'move' },
    });
    expect(move.statusCode).toBe(200);
    expect(fs.existsSync(path.join(claudeHome, 'agents', 'mv2.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectsRoot, 'my-app', '.claude', 'agents', 'mv2.md'))).toBe(false);

    // Re-create in the project; copying to global now conflicts.
    await makeProjectAgent('mv2', '# changed');
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: { type: 'agents', name: 'mv2', fromScopeId: projectId, toScopeId: 'global', mode: 'copy' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('CONFIRM_REQUIRED');

    const overwrite = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: { type: 'agents', name: 'mv2', fromScopeId: projectId, toScopeId: 'global', mode: 'copy', confirm: true },
    });
    expect(overwrite.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(claudeHome, 'agents', 'mv2.md'), 'utf8')).toContain('# changed');
  });

  it('rejects a transfer to the same scope', async () => {
    await makeProjectAgent('same');
    const res = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: { type: 'agents', name: 'same', fromScopeId: projectId, toScopeId: projectId, mode: 'copy' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses to transfer onto a symlinked destination skill dir without following it', async () => {
    // Source skill in global.
    const src = path.join(claudeHome, 'skills', 'portme');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nname: portme\ndescription: A portable skill.\n---\n');
    // Destination: plant my-app/.claude/skills/portme -> a sibling dir holding real data.
    const proj = path.join(projectsRoot, 'my-app');
    const target = path.join(proj, 'sensitive');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'keep.txt'), 'important');
    fs.mkdirSync(path.join(proj, '.claude', 'skills'), { recursive: true });
    fs.symlinkSync(target, path.join(proj, '.claude', 'skills', 'portme'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: { type: 'skills', name: 'portme', fromScopeId: 'global', toScopeId: projectId, mode: 'copy', confirm: true },
    });
    expect(res.statusCode).toBe(403); // FORBIDDEN_PATH — symlinked dest refused
    expect(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('important'); // target untouched
  });
});

describe('plugins: global inheritance', () => {
  const PID = encodeURIComponent('frontend-design@official');
  const find = (body: any) => body.plugins.find((x: any) => x.id === 'frontend-design@official');

  it('shows a globally-enabled plugin as inherited (not a local override) in a project', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/scopes/${projectId}/plugins` })).json();
    expect(find(body)).toMatchObject({ enabled: true, enabledGlobally: true, localOverride: false });
  });

  it('shows the same plugin as a local entry in the global scope', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/scopes/global/plugins' })).json();
    expect(find(body)).toMatchObject({ enabled: true, enabledGlobally: true, localOverride: true });
  });

  it('does not treat an ancestor .claude entry as the project’s own override', async () => {
    // A parent directory's .claude that also enables the plugin is an inherited
    // baseline — it must NOT read as this project's own enabledPlugins entry
    // (otherwise the "global" badge and the toggle's clear-override logic break).
    fs.mkdirSync(path.join(projectsRoot, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(projectsRoot, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'frontend-design@official': true } }, null, 2),
    );
    const body = (await app.inject({ method: 'GET', url: `/api/scopes/${projectId}/plugins` })).json();
    expect(find(body)).toMatchObject({ enabled: true, localOverride: false });
  });

  it('disabling in a project writes an override and leaves global untouched', async () => {
    await app.inject({ method: 'PUT', url: `/api/scopes/${projectId}/plugins/${PID}/enabled`, payload: { enabled: false } });

    const proj = find((await app.inject({ method: 'GET', url: `/api/scopes/${projectId}/plugins` })).json());
    expect(proj).toMatchObject({ enabled: false, enabledGlobally: true, localOverride: true });

    const global = find((await app.inject({ method: 'GET', url: '/api/scopes/global/plugins' })).json());
    expect(global.enabled).toBe(true);
  });

  it('clearing the override (enabled: null) reverts to the inherited global state', async () => {
    await app.inject({ method: 'PUT', url: `/api/scopes/${projectId}/plugins/${PID}/enabled`, payload: { enabled: false } });
    await app.inject({ method: 'PUT', url: `/api/scopes/${projectId}/plugins/${PID}/enabled`, payload: { enabled: null } });

    const proj = find((await app.inject({ method: 'GET', url: `/api/scopes/${projectId}/plugins` })).json());
    expect(proj).toMatchObject({ enabled: true, localOverride: false });

    // The project's own settings no longer carries an enabledPlugins entry.
    const local = JSON.parse(
      fs.readFileSync(path.join(projectsRoot, 'my-app', '.claude', 'settings.local.json'), 'utf8'),
    );
    expect(local.enabledPlugins?.['frontend-design@official']).toBeUndefined();
  });

  it('counts configured areas (permissions + memory) for the project badge', async () => {
    const scopes = (await app.inject({ method: 'GET', url: '/api/scopes' })).json();
    const proj = scopes.projects.find((p: any) => p.name === 'my-app');
    expect(proj.configuredModules).toBe(2);
  });

  it('adds then removes a custom marketplace, leaving no empty key behind', async () => {
    const localPath = path.join(projectsRoot, 'my-app', '.claude', 'settings.local.json');

    await app.inject({ method: 'POST', url: `/api/scopes/${projectId}/marketplaces`, payload: { name: 'zz', repo: 'octo/zz' } });
    let local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    expect(local.extraKnownMarketplaces.zz).toEqual({ source: { source: 'github', repo: 'octo/zz' } });

    await app.inject({ method: 'DELETE', url: `/api/scopes/${projectId}/marketplaces/zz?confirm=true` });
    local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    expect(local.extraKnownMarketplaces).toBeUndefined();
  });
});

describe('skill import (.skill upload)', () => {
  const SKILL_MD = `---\nname: imported\ndescription: An imported skill for the test.\n---\n\n# Imported\n`;
  const b64 = () =>
    Buffer.from(zipSync({ 'SKILL.md': strToU8(SKILL_MD), 'ref.md': strToU8('r') })).toString('base64');

  it('previews (dry run) then imports a .skill into the global scope', async () => {
    const preview = await app.inject({
      method: 'POST',
      url: '/api/scopes/global/skills/import',
      payload: { dataBase64: b64(), dryRun: true },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ name: 'imported', wouldOverwrite: false });
    expect(fs.existsSync(path.join(claudeHome, 'skills', 'imported'))).toBe(false); // dry run wrote nothing

    const res = await app.inject({
      method: 'POST',
      url: '/api/scopes/global/skills/import',
      payload: { dataBase64: b64() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'imported', fileCount: 2 });
    expect(fs.readFileSync(path.join(claudeHome, 'skills', 'imported', 'SKILL.md'), 'utf8')).toContain('name: imported');
    expect(fs.existsSync(path.join(claudeHome, 'skills', 'imported', 'ref.md'))).toBe(true);
  });

  it('rejects a malformed archive with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scopes/global/skills/import',
      payload: { dataBase64: Buffer.from('not a zip at all').toString('base64') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deleting a skill removes the whole skill directory, not just SKILL.md', async () => {
    const dir = path.join(claudeHome, 'skills', 'multi');
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: multi\ndescription: A multi-file skill.\n---\nbody\n');
    fs.writeFileSync(path.join(dir, 'references', 'r.md'), 'reference');

    const res = await app.inject({ method: 'DELETE', url: '/api/scopes/global/skills/multi?confirm=true' });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(dir)).toBe(false); // whole folder gone, not just SKILL.md
  });
});

describe('tree listing', () => {
  it('lists a folder recursively without following symlinked dirs', async () => {
    const skillDir = path.join(claudeHome, 'skills', 'nested');
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: nested\ndescription: x\n---\n');
    fs.writeFileSync(path.join(skillDir, 'references', 'a.md'), 'a');
    fs.writeFileSync(path.join(skillDir, 'references', 'b.md'), 'b');
    // a symlinked dir pointing elsewhere must NOT be walked into
    const outside = path.join(claudeHome, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'secret.md'), 's');
    fs.symlinkSync(outside, path.join(skillDir, 'linkdir'));

    const res = await app.inject({ method: 'GET', url: '/api/scopes/global/tree?subdir=skills/nested&recursive=true' });
    expect(res.statusCode).toBe(200);
    const paths = res.json().entries.map((e: { relPath: string }) => e.relPath);
    expect(paths).toContain('skills/nested/references/a.md');
    expect(paths).toContain('skills/nested/references/b.md');
    expect(paths.some((p: string) => p.endsWith('secret.md'))).toBe(false); // symlink target not walked
  });

  it('lists only the top level when not recursive', async () => {
    const skillDir = path.join(claudeHome, 'skills', 'flat');
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: flat\ndescription: x\n---\n');
    fs.writeFileSync(path.join(skillDir, 'references', 'a.md'), 'a');

    const res = await app.inject({ method: 'GET', url: '/api/scopes/global/tree?subdir=skills/flat' });
    const paths = res.json().entries.map((e: { relPath: string }) => e.relPath);
    expect(paths).toContain('skills/flat/references'); // the dir entry
    expect(paths).not.toContain('skills/flat/references/a.md'); // not recursed
  });
});
