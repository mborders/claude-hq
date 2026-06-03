import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathSandbox } from './sandbox';

let root: string;
let outside: string;

beforeEach(() => {
  // realpathSync so macOS /var -> /private/var symlinking doesn't confuse asserts.
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-root-')));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-out-')));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'TOP SECRET');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe('PathSandbox', () => {
  it('resolves a nested rel path under the base (even if it does not exist yet)', () => {
    const sb = new PathSandbox([root]);
    const abs = sb.resolve(root, '.claude/settings.json');
    expect(abs).toBe(path.join(root, '.claude/settings.json'));
  });

  it('rejects parent-traversal (..)', () => {
    const sb = new PathSandbox([root]);
    expect(() => sb.resolve(root, '../escape')).toThrow();
    expect(() => sb.resolve(root, '.claude/../../escape')).toThrow();
  });

  it('rejects absolute rel paths', () => {
    const sb = new PathSandbox([root]);
    expect(() => sb.resolve(root, '/etc/passwd')).toThrow();
  });

  it('rejects NUL bytes', () => {
    const sb = new PathSandbox([root]);
    const withNul = 'a' + String.fromCharCode(0) + 'b';
    expect(() => sb.resolve(root, withNul)).toThrow();
  });

  it('rejects symlink escape (a symlink inside the base pointing outside)', () => {
    const sb = new PathSandbox([root]);
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(() => sb.resolve(root, 'link/secret.txt')).toThrow();
  });

  it('rejects a base dir that is not within any allow-listed root', () => {
    const sb = new PathSandbox([root]);
    expect(() => sb.assertAllowedBase(outside)).toThrow();
    expect(() => sb.resolve(outside, 'file.txt')).toThrow();
  });

  it('accepts a base dir that is within an allow-listed root', () => {
    const sb = new PathSandbox([root]);
    const sub = path.join(root, 'project-a');
    fs.mkdirSync(sub);
    expect(() => sb.assertAllowedBase(sub)).not.toThrow();
    expect(sb.resolve(sub, 'CLAUDE.md')).toBe(path.join(sub, 'CLAUDE.md'));
  });

  it('isWithinRoots reflects containment', () => {
    const sb = new PathSandbox([root]);
    expect(sb.isWithinRoots(path.join(root, 'x/y'))).toBe(true);
    expect(sb.isWithinRoots(outside)).toBe(false);
  });
});
