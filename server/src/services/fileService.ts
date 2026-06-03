import type { FileMeta, WriteResult, BackupRef } from '@ccm/shared';
import { PathSandbox } from '../fs/sandbox';
import { BackupStore } from '../fs/backup';
import { isRuntimeReadonlyRelPath } from '../fs/readonly';
import { statFile, readText, writeAtomic, removeFile, type FileStat } from '../fs/safeFs';
import { withFileLock } from '../fs/lock';
import { AppError } from '../http/appError';
import type { ResolvedScope } from '../domain/paths';
import type { ServerEnv } from '../env';

export interface WriteOptions {
  expectedSha256?: string;
  confirm?: boolean;
  /** Non-empty + !confirm => CONFIRM_REQUIRED. */
  warnings?: string[];
  mode?: number;
  backupKeep?: number;
}

const DEFAULT_BACKUP_KEEP = 25;

/**
 * The single funnel for reads/writes/deletes. Composes the sandbox, readonly
 * rules, sha256 concurrency, backups, and atomic writes. Every mutation runs
 * through `write`/`delete`.
 */
export class FileService {
  constructor(
    private readonly sandbox: PathSandbox,
    private readonly backups: BackupStore,
    private readonly env: ServerEnv,
  ) {}

  isReadOnly(scope: ResolvedScope, relPath: string): boolean {
    if (this.env.readOnly) return true;
    return scope.kind === 'global' && isRuntimeReadonlyRelPath(relPath);
  }

  private metaFor(scope: ResolvedScope, relPath: string, absPath: string, stat: FileStat | null): FileMeta {
    return {
      scopeId: scope.id,
      relPath,
      absPath,
      exists: stat !== null,
      size: stat?.size ?? 0,
      mtimeMs: stat?.mtimeMs ?? 0,
      sha256: stat?.sha256 ?? '',
      readOnly: this.isReadOnly(scope, relPath),
    };
  }

  meta(scope: ResolvedScope, relPath: string): FileMeta {
    const absPath = this.sandbox.resolve(scope.rootDir, relPath);
    return this.metaFor(scope, relPath, absPath, statFile(absPath));
  }

  read(scope: ResolvedScope, relPath: string): { meta: FileMeta; raw: string } {
    const absPath = this.sandbox.resolve(scope.rootDir, relPath);
    const r = readText(absPath);
    return { meta: this.metaFor(scope, relPath, absPath, r?.stat ?? null), raw: r?.content ?? '' };
  }

  private assertWritable(scope: ResolvedScope, relPath: string): string {
    if (this.env.readOnly) {
      throw new AppError('READ_ONLY_MODE', 'The server is running in read-only mode.');
    }
    const absPath = this.sandbox.resolve(scope.rootDir, relPath);
    if (scope.kind === 'global' && isRuntimeReadonlyRelPath(relPath)) {
      throw new AppError('FORBIDDEN_READONLY', `This path is read-only runtime data: ${relPath}`);
    }
    return absPath;
  }

  async write(
    scope: ResolvedScope,
    relPath: string,
    content: string,
    opts: WriteOptions = {},
  ): Promise<WriteResult> {
    const absPath = this.assertWritable(scope, relPath);
    if (opts.warnings && opts.warnings.length > 0 && !opts.confirm) {
      throw new AppError('CONFIRM_REQUIRED', 'This change needs confirmation.', {
        warnings: opts.warnings,
      });
    }

    return withFileLock(absPath, () => {
      const cur = statFile(absPath);
      if (opts.expectedSha256 !== undefined && cur && cur.sha256 !== opts.expectedSha256) {
        throw new AppError('STALE_WRITE', 'The file changed on disk since it was loaded.', {
          current: this.metaFor(scope, relPath, absPath, cur),
        });
      }

      let backup: BackupRef | undefined;
      if (cur) {
        backup = this.backups.create(scope.id, relPath, absPath) ?? undefined;
        this.backups.prune(scope.id, relPath, opts.backupKeep ?? DEFAULT_BACKUP_KEEP);
      }

      const stat = writeAtomic(absPath, content, opts.mode !== undefined ? { mode: opts.mode } : {});
      return { meta: this.metaFor(scope, relPath, absPath, stat), backup };
    });
  }

  /**
   * Atomic read-modify-write: the current file is read, transformed, and written
   * entirely INSIDE the per-file lock, so concurrent merge-edits can't drop each
   * other's changes (the plain read()+write() pattern has a read-outside-lock
   * race). `transform` may throw to abort. Warnings it returns gate on confirm.
   */
  async writeTransform(
    scope: ResolvedScope,
    relPath: string,
    transform: (currentRaw: string, exists: boolean) => { content: string; warnings?: string[] },
    opts: { expectedSha256?: string; confirm?: boolean; mode?: number; backupKeep?: number } = {},
  ): Promise<WriteResult> {
    const absPath = this.assertWritable(scope, relPath);
    return withFileLock(absPath, () => {
      const cur = statFile(absPath);
      if (opts.expectedSha256 !== undefined && cur && cur.sha256 !== opts.expectedSha256) {
        throw new AppError('STALE_WRITE', 'The file changed on disk since it was loaded.', {
          current: this.metaFor(scope, relPath, absPath, cur),
        });
      }
      const currentRaw = cur ? (readText(absPath)?.content ?? '') : '';
      const { content, warnings } = transform(currentRaw, cur !== null);
      if (warnings && warnings.length > 0 && !opts.confirm) {
        throw new AppError('CONFIRM_REQUIRED', 'This change needs confirmation.', { warnings });
      }
      let backup: BackupRef | undefined;
      if (cur) {
        backup = this.backups.create(scope.id, relPath, absPath) ?? undefined;
        this.backups.prune(scope.id, relPath, opts.backupKeep ?? DEFAULT_BACKUP_KEEP);
      }
      const stat = writeAtomic(absPath, content, opts.mode !== undefined ? { mode: opts.mode } : {});
      return { meta: this.metaFor(scope, relPath, absPath, stat), backup };
    });
  }

  async delete(
    scope: ResolvedScope,
    relPath: string,
    opts: WriteOptions = {},
  ): Promise<{ backup?: BackupRef }> {
    const absPath = this.assertWritable(scope, relPath);
    if (opts.warnings && opts.warnings.length > 0 && !opts.confirm) {
      throw new AppError('CONFIRM_REQUIRED', 'This deletion needs confirmation.', {
        warnings: opts.warnings,
      });
    }

    return withFileLock(absPath, () => {
      const cur = statFile(absPath);
      if (!cur) throw new AppError('NOT_FOUND', `File not found: ${relPath}`);
      if (opts.expectedSha256 !== undefined && cur.sha256 !== opts.expectedSha256) {
        throw new AppError('STALE_WRITE', 'The file changed on disk since it was loaded.', {
          current: this.metaFor(scope, relPath, absPath, cur),
        });
      }
      const backup = this.backups.create(scope.id, relPath, absPath) ?? undefined;
      removeFile(absPath);
      return { backup };
    });
  }
}
