import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface FileStat {
  size: number;
  mtimeMs: number;
  sha256: string;
  /** Permission bits (mode & 0o777). */
  mode: number;
}

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Stat + content hash for an existing file, or null if it doesn't exist. */
export function statFile(absPath: string): FileStat | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(absPath);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const buf = fs.readFileSync(absPath);
  return { size: st.size, mtimeMs: st.mtimeMs, sha256: sha256Hex(buf), mode: st.mode & 0o777 };
}

export function readText(absPath: string): { content: string; stat: FileStat } | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(absPath);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const buf = fs.readFileSync(absPath);
  return {
    content: buf.toString('utf8'),
    stat: { size: st.size, mtimeMs: st.mtimeMs, sha256: sha256Hex(buf), mode: st.mode & 0o777 },
  };
}

let tmpCounter = 0;

/**
 * Atomically write `content` to `absPath`: write a temp file in the SAME
 * directory (so rename is atomic on the same volume), fsync, then rename over
 * the target. Preserves the existing file's mode; new files use opts.mode.
 */
export function writeAtomic(
  absPath: string,
  content: string,
  opts: { mode?: number } = {},
): FileStat {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });

  let mode = opts.mode ?? 0o644;
  try {
    const existing = fs.statSync(absPath).mode & 0o777;
    // Preserve existing perms, but let an explicit opts.mode TIGHTEN (never
    // loosen) — e.g. force secret-bearing files to 0o600 even if Claude Code
    // first created them world-readable.
    mode = opts.mode !== undefined ? existing & opts.mode : existing;
  } catch {
    /* new file — keep opts.mode ?? default */
  }

  const tmp = path.join(dir, `.${path.basename(absPath)}.ccm-tmp-${process.pid}-${tmpCounter++}`);
  try {
    const fd = fs.openSync(tmp, 'w', mode);
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, absPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }

  return statFile(absPath)!;
}

export function ensureDir(absPath: string): void {
  fs.mkdirSync(absPath, { recursive: true });
}

export function removeFile(absPath: string): void {
  try {
    fs.unlinkSync(absPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function fileExists(absPath: string): boolean {
  return fs.existsSync(absPath);
}
