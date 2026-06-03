import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeAtomic, readText, statFile, removeFile, sha256Hex } from './safeFs';

let dir: string;

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-safefs-')));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('safeFs', () => {
  it('sha256Hex matches node crypto', () => {
    const s = 'hello world';
    expect(sha256Hex(s)).toBe(crypto.createHash('sha256').update(s).digest('hex'));
  });

  it('writes then reads back identical content + correct sha', () => {
    const p = path.join(dir, 'a.json');
    const content = '{\n  "x": 1\n}\n';
    const stat = writeAtomic(p, content);
    const read = readText(p);
    expect(read?.content).toBe(content);
    expect(read?.stat.sha256).toBe(sha256Hex(content));
    expect(stat.sha256).toBe(sha256Hex(content));
  });

  it('preserves the mode of an existing file (e.g. 0o600 settings stay private)', () => {
    const p = path.join(dir, 'settings.json');
    fs.writeFileSync(p, '{}');
    fs.chmodSync(p, 0o600);
    writeAtomic(p, '{"a":1}');
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
  });

  it('creates missing parent directories', () => {
    const p = path.join(dir, 'nested/deep/file.md');
    writeAtomic(p, '# hi');
    expect(readText(p)?.content).toBe('# hi');
  });

  it('leaves no temp files behind after a write', () => {
    const p = path.join(dir, 'x.json');
    writeAtomic(p, '{}');
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('ccm-tmp'));
    expect(leftovers).toEqual([]);
  });

  it('readText returns null for a missing file', () => {
    expect(readText(path.join(dir, 'nope.json'))).toBeNull();
    expect(statFile(path.join(dir, 'nope.json'))).toBeNull();
  });

  it('removeFile deletes a file', () => {
    const p = path.join(dir, 'gone.md');
    writeAtomic(p, 'bye');
    removeFile(p);
    expect(fs.existsSync(p)).toBe(false);
  });
});
