import fs from 'node:fs';
import path from 'node:path';
import type { BackupRef } from '@claude-hq/shared';

function sanitizeScope(scopeId: string): string {
  // base64url has no path separators; ':' is replaced to be cross-fs safe.
  return scopeId.replace(/:/g, '_');
}

function assertSafeRelPath(relPath: string): void {
  if (relPath.includes('\0') || relPath.split(/[\\/]+/).includes('..') || path.isAbsolute(relPath)) {
    throw new Error(`Unsafe backup relPath: ${relPath}`);
  }
}

/**
 * Timestamped backups stored under APP_DATA_DIR/backups/<scope>/<relPath>.backups/
 * — deliberately OUTSIDE ~/.claude so they survive a read-only global mount and
 * never collide with Claude Code's own backups.
 */
export class BackupStore {
  constructor(private readonly appDataDir: string) {}

  private dirFor(scopeId: string, relPath: string): string {
    assertSafeRelPath(relPath);
    return path.join(this.appDataDir, 'backups', sanitizeScope(scopeId), `${relPath}.backups`);
  }

  /** Copy the current file into a new timestamped backup. Null if the source is missing. */
  create(scopeId: string, relPath: string, sourceAbsPath: string): BackupRef | null {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(sourceAbsPath);
    } catch {
      return null;
    }
    const dir = this.dirFor(scopeId, relPath);
    fs.mkdirSync(dir, { recursive: true });

    let ms = Date.now();
    while (fs.existsSync(path.join(dir, `${ms}.bak`))) ms++; // guarantee a unique id
    fs.writeFileSync(path.join(dir, `${ms}.bak`), buf);

    return { id: String(ms), relPath, createdAtMs: ms, size: buf.length };
  }

  /** Backups for a file, newest first. */
  list(scopeId: string, relPath: string): BackupRef[] {
    const dir = this.dirFor(scopeId, relPath);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return [];
    }
    const refs: BackupRef[] = [];
    for (const n of names) {
      const m = /^(\d+)\.bak$/.exec(n);
      if (!m) continue;
      let size = 0;
      try {
        size = fs.statSync(path.join(dir, n)).size;
      } catch {
        /* ignore */
      }
      refs.push({ id: m[1]!, relPath, createdAtMs: Number(m[1]), size });
    }
    refs.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return refs;
  }

  read(scopeId: string, relPath: string, id: string): string | null {
    if (!/^\d+$/.test(id)) return null; // ids are epoch-ms only — blocks path tricks
    try {
      return fs.readFileSync(path.join(this.dirFor(scopeId, relPath), `${id}.bak`), 'utf8');
    } catch {
      return null;
    }
  }

  /** Delete a specific backup. Returns true if it existed. */
  remove(scopeId: string, relPath: string, id: string): boolean {
    if (!/^\d+$/.test(id)) return false;
    try {
      fs.unlinkSync(path.join(this.dirFor(scopeId, relPath), `${id}.bak`));
      return true;
    } catch {
      return false;
    }
  }

  /** Keep only the newest `keep` backups for a file. */
  prune(scopeId: string, relPath: string, keep: number): void {
    const dir = this.dirFor(scopeId, relPath);
    for (const ref of this.list(scopeId, relPath).slice(Math.max(0, keep))) {
      try {
        fs.unlinkSync(path.join(dir, `${ref.id}.bak`));
      } catch {
        /* ignore */
      }
    }
  }
}
