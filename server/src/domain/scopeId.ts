import path from 'node:path';
import type { ScopeId } from '@ccm/shared';

export const GLOBAL_SCOPE_ID: ScopeId = 'global';

const PROJECT_PREFIX = 'project:';

export type DecodedScope = { kind: 'global' } | { kind: 'project'; path: string };

/** Encode an absolute project path into an opaque, URL-safe scope id. */
export function encodeProjectScopeId(absPath: string): ScopeId {
  return PROJECT_PREFIX + Buffer.from(absPath, 'utf8').toString('base64url');
}

/**
 * Decode a scope id. Throws on a malformed id or a non-absolute decoded path
 * (the latter is a defense against crafted ids; callers must still re-check the
 * decoded path against the sandbox allow-list).
 */
export function decodeScopeId(id: ScopeId): DecodedScope {
  if (id === GLOBAL_SCOPE_ID) return { kind: 'global' };
  if (!id.startsWith(PROJECT_PREFIX)) {
    throw new Error(`Invalid scope id: ${id}`);
  }
  const encoded = id.slice(PROJECT_PREFIX.length);
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  if (!decoded || !path.isAbsolute(decoded)) {
    throw new Error(`Invalid scope id (path not absolute): ${id}`);
  }
  return { kind: 'project', path: decoded };
}
