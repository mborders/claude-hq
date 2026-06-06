import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BackupStore } from './backup';

let appData: string;
let scopeRoot: string;

beforeEach(() => {
  appData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-appdata-')));
  scopeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hq-scope-')));
});
afterEach(() => {
  fs.rmSync(appData, { recursive: true, force: true });
  fs.rmSync(scopeRoot, { recursive: true, force: true });
});

describe('BackupStore', () => {
  it('backs up the current file and reads it back identically', () => {
    const src = path.join(scopeRoot, 'settings.json');
    fs.writeFileSync(src, '{"v":1}');
    const store = new BackupStore(appData);

    const ref = store.create('global', 'settings.json', src);
    expect(ref).not.toBeNull();
    expect(ref!.relPath).toBe('settings.json');
    expect(store.read('global', 'settings.json', ref!.id)).toBe('{"v":1}');
  });

  it('returns null when the source file does not exist (nothing to back up)', () => {
    const store = new BackupStore(appData);
    expect(store.create('global', 'settings.json', path.join(scopeRoot, 'nope.json'))).toBeNull();
  });

  it('keeps multiple backups, newest first, each with its own content', () => {
    const src = path.join(scopeRoot, 'settings.json');
    const store = new BackupStore(appData);

    fs.writeFileSync(src, 'A');
    const a = store.create('global', 'settings.json', src)!;
    fs.writeFileSync(src, 'B');
    const b = store.create('global', 'settings.json', src)!;

    const list = store.list('global', 'settings.json');
    expect(list.length).toBe(2);
    expect(list[0]!.createdAtMs).toBeGreaterThanOrEqual(list[1]!.createdAtMs);
    expect(store.read('global', 'settings.json', a.id)).toBe('A');
    expect(store.read('global', 'settings.json', b.id)).toBe('B');
  });

  it('handles nested rel paths (agents/foo.md)', () => {
    const src = path.join(scopeRoot, 'agents', 'foo.md');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, '# foo');
    const store = new BackupStore(appData);

    const ref = store.create('project:abc', 'agents/foo.md', src)!;
    expect(store.read('project:abc', 'agents/foo.md', ref.id)).toBe('# foo');
  });

  it('prunes to the newest N backups', () => {
    const src = path.join(scopeRoot, 'f.txt');
    const store = new BackupStore(appData);
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(src, `v${i}`);
      store.create('global', 'f.txt', src);
    }
    store.prune('global', 'f.txt', 2);
    expect(store.list('global', 'f.txt').length).toBe(2);
  });
});
