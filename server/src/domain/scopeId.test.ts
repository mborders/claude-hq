import { describe, it, expect } from 'vitest';
import { GLOBAL_SCOPE_ID, encodeProjectScopeId, decodeScopeId } from './scopeId';

describe('scopeId', () => {
  it('round-trips a project absolute path through encode/decode', () => {
    const p = '/Users/mborders/Documents/GitHub/avemariatech';
    const id = encodeProjectScopeId(p);
    expect(id.startsWith('project:')).toBe(true);
    expect(decodeScopeId(id)).toEqual({ kind: 'project', path: p });
  });

  it('round-trips paths with spaces and unicode (no slash/percent ambiguity)', () => {
    const p = '/Users/me/My Projects/café-app';
    expect(decodeScopeId(encodeProjectScopeId(p))).toEqual({ kind: 'project', path: p });
  });

  it('decodes the global sentinel', () => {
    expect(decodeScopeId(GLOBAL_SCOPE_ID)).toEqual({ kind: 'global' });
  });

  it('throws on a malformed id', () => {
    expect(() => decodeScopeId('not-a-scope')).toThrow();
  });

  it('throws when the decoded project path is not absolute (anti-traversal)', () => {
    const bad = 'project:' + Buffer.from('relative/path', 'utf8').toString('base64url');
    expect(() => decodeScopeId(bad)).toThrow();
  });
});
