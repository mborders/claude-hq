import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../http/appError';

function realpathSafe(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Realpath the longest EXISTING ancestor of `p`, then re-append the
 * not-yet-existing tail. This lets us validate paths to files that don't exist
 * yet while still defeating symlink escapes through existing components.
 */
function realpathExistingPrefix(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  while (!fs.existsSync(cur)) {
    tail.unshift(path.basename(cur));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const realBase = realpathSafe(cur);
  return tail.length ? path.join(realBase, ...tail) : realBase;
}

/**
 * Confines all filesystem access to an allow-list of real roots. This is the
 * single security gate every read/write funnels through.
 */
export class PathSandbox {
  private readonly roots: string[];

  constructor(roots: string[]) {
    // realpath each root so symlinked mount points (e.g. macOS /var -> /private/var)
    // compare consistently against resolved candidates.
    this.roots = roots.map(realpathSafe);
  }

  private containedByRoot(realAbs: string): boolean {
    return this.roots.some((r) => realAbs === r || realAbs.startsWith(r + path.sep));
  }

  /** True if `absPath` resolves within (or equal to) one of the allow-listed roots. */
  isWithinRoots(absPath: string): boolean {
    return this.containedByRoot(realpathExistingPrefix(absPath));
  }

  /** Throw FORBIDDEN_PATH unless `baseDir` is within an allow-listed root. */
  assertAllowedBase(baseDir: string): void {
    const real = realpathSafe(baseDir);
    if (!this.containedByRoot(real)) {
      throw new AppError('FORBIDDEN_PATH', `Path is outside the allowed roots: ${baseDir}`);
    }
  }

  /**
   * Resolve `relPath` under `baseDir`, guaranteeing the result cannot escape the
   * base via traversal or symlinks and that `baseDir` is itself allow-listed.
   * Returns the absolute path (the leaf need not exist).
   */
  resolve(baseDir: string, relPath: string): string {
    if (relPath.includes('\0')) {
      throw new AppError('FORBIDDEN_PATH', 'Path contains a NUL byte');
    }
    if (path.isAbsolute(relPath)) {
      throw new AppError('FORBIDDEN_PATH', `Absolute paths are not allowed: ${relPath}`);
    }
    if (relPath.split(/[\\/]+/).includes('..')) {
      throw new AppError('FORBIDDEN_PATH', `Path traversal is not allowed: ${relPath}`);
    }

    this.assertAllowedBase(baseDir);

    const realBase = realpathSafe(baseDir);
    const candidate = path.resolve(realBase, relPath);
    const realCandidate = realpathExistingPrefix(candidate);
    if (realCandidate !== realBase && !realCandidate.startsWith(realBase + path.sep)) {
      throw new AppError('FORBIDDEN_PATH', `Resolved path escapes its scope: ${relPath}`);
    }

    return path.join(realBase, relPath);
  }
}
