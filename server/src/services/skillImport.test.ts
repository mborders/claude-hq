import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { loadEnv } from '../env';
import { createContext, type AppContext } from '../context';
import { ScopeService } from './scopeService';
import { SkillImportService } from './skillImportService';
import type { ResolvedScope } from '../domain/paths';

const SKILL_MD = `---
name: my-skill
description: A test skill that does a useful thing.
---

# My Skill

Do the thing.
`;

/** Build a .skill (zip) buffer from a flat {path: textContent} map. */
function skillZip(files: Record<string, string>): Buffer {
  const entries = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]));
  return Buffer.from(zipSync(entries));
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? 'NO_CODE';
  }
  throw new Error('expected the call to throw');
}

let claudeHome: string, projectsRoot: string, appData: string;
let ctx: AppContext, scope: ResolvedScope, svc: SkillImportService;

beforeEach(() => {
  claudeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-imp-home-')));
  projectsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-imp-proj-')));
  appData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-imp-data-')));
  const env = loadEnv({
    NODE_ENV: 'test',
    CLAUDE_HOME_DIR: claudeHome,
    PROJECTS_ROOTS: projectsRoot,
    APP_DATA_DIR: appData,
    WEB_DIST_DIR: path.join(appData, 'web'),
  });
  ctx = createContext(env);
  scope = new ScopeService(ctx).requireScope('global');
  svc = new SkillImportService(ctx);
});

afterEach(() => {
  for (const d of [claudeHome, projectsRoot, appData]) fs.rmSync(d, { recursive: true, force: true });
});

const skillDir = (name: string) => path.join(claudeHome, 'skills', name);

describe('SkillImportService', () => {
  it('imports a skill with SKILL.md at the zip root and derives the name from frontmatter', async () => {
    const res = await svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD, 'reference.md': '# ref\n' }), {});
    expect(res.name).toBe('my-skill');
    expect(fs.readFileSync(path.join(skillDir('my-skill'), 'SKILL.md'), 'utf8')).toContain('name: my-skill');
    expect(fs.readFileSync(path.join(skillDir('my-skill'), 'reference.md'), 'utf8')).toBe('# ref\n');
  });

  it('strips a single wrapping folder and preserves nested files', async () => {
    await svc.import(scope, skillZip({ 'wrapper/SKILL.md': SKILL_MD, 'wrapper/refs/a.md': 'a\n' }), {});
    expect(fs.existsSync(path.join(skillDir('my-skill'), 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(skillDir('my-skill'), 'refs', 'a.md'), 'utf8')).toBe('a\n');
  });

  it('inspect() previews name/description/files without writing anything', () => {
    const preview = svc.inspect(scope, skillZip({ 'SKILL.md': SKILL_MD, 'a.txt': 'x' }));
    expect(preview.name).toBe('my-skill');
    expect(preview.description).toContain('useful thing');
    expect(preview.files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'a.txt']);
    expect(preview.wouldOverwrite).toBe(false);
    expect(fs.existsSync(skillDir('my-skill'))).toBe(false);
  });

  it('rejects an archive with no SKILL.md', () => {
    expect(codeOf(() => svc.inspect(scope, skillZip({ 'readme.md': '# nope\n' })))).toBe('BAD_REQUEST');
  });

  it('rejects a SKILL.md whose frontmatter is missing required fields', () => {
    const bad = `---\nname: x\n---\nbody\n`;
    expect(codeOf(() => svc.inspect(scope, skillZip({ 'SKILL.md': bad })))).toBe('VALIDATION_FAILED');
  });

  it('rejects a zip-slip entry that escapes the skill directory', async () => {
    await expect(
      svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD, '../evil.md': 'pwned' }), {}),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fs.existsSync(path.join(claudeHome, 'evil.md'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(claudeHome), 'evil.md'))).toBe(false);
  });

  it('rejects an entry that climbs into a sibling config file', async () => {
    // ../../settings.json stays inside ~/.claude but escapes skills/<name>/.
    await expect(
      svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD, '../../settings.json': '{"evil":true}' }), {}),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fs.existsSync(path.join(claudeHome, 'settings.json'))).toBe(false);
  });

  it('requires confirm to overwrite an existing skill, then replaces it cleanly', async () => {
    await svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD, 'old.md': 'old\n' }), {});
    await expect(svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD }), {})).rejects.toMatchObject({
      code: 'CONFIRM_REQUIRED',
    });
    expect(svc.inspect(scope, skillZip({ 'SKILL.md': SKILL_MD })).wouldOverwrite).toBe(true);
    await svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD, 'new.md': 'new\n' }), { confirm: true });
    expect(fs.existsSync(path.join(skillDir('my-skill'), 'new.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillDir('my-skill'), 'old.md'))).toBe(false); // clean replace
  });

  it('honors a name override', async () => {
    const res = await svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD }), { name: 'renamed-skill' });
    expect(res.name).toBe('renamed-skill');
    expect(fs.existsSync(path.join(skillDir('renamed-skill'), 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(skillDir('my-skill'))).toBe(false);
  });

  it('rejects an archive with too many files', () => {
    const many: Record<string, string> = { 'SKILL.md': SKILL_MD };
    for (let i = 0; i < 600; i++) many[`f${i}.txt`] = 'x';
    expect(codeOf(() => svc.inspect(scope, skillZip(many)))).toBe('PAYLOAD_TOO_LARGE');
  });

  it('refuses to import over a symlinked skill directory without following it onto the target', async () => {
    // Pre-plant skills/my-skill -> a sibling dir holding real data.
    const target = path.join(claudeHome, 'sensitive');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'keep.txt'), 'important');
    fs.mkdirSync(path.join(claudeHome, 'skills'), { recursive: true });
    fs.symlinkSync(target, skillDir('my-skill'));

    await expect(svc.import(scope, skillZip({ 'SKILL.md': SKILL_MD }), { confirm: true })).rejects.toMatchObject({
      code: 'FORBIDDEN_PATH',
    });
    expect(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('important'); // target untouched
  });
});
