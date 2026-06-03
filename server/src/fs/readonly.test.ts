import { describe, it, expect } from 'vitest';
import { isRuntimeReadonlyRelPath } from './readonly';

describe('isRuntimeReadonlyRelPath (global scope)', () => {
  it('marks runtime/data subtrees read-only', () => {
    for (const p of [
      'sessions/abc.jsonl',
      'tasks/uuid/1.json',
      'plans/some-plan.md',
      'security/state.json',
      'metrics/costs.jsonl',
      'shell-snapshots/snap.sh',
      'history.jsonl',
      'debug/latest.log',
      'whatever.log',
      'ide/49267.lock',
    ]) {
      expect(isRuntimeReadonlyRelPath(p), p).toBe(true);
    }
  });

  it('marks session transcripts under projects/ read-only', () => {
    expect(isRuntimeReadonlyRelPath('projects/-Users-x/session.jsonl')).toBe(true);
  });

  it('ALLOWS the memory store under projects/<enc>/memory', () => {
    expect(isRuntimeReadonlyRelPath('projects/-Users-x/memory/MEMORY.md')).toBe(false);
    expect(isRuntimeReadonlyRelPath('projects/-Users-x/memory/feedback_foo.md')).toBe(false);
  });

  it('allows editable config artifacts', () => {
    for (const p of ['settings.json', 'agents/foo.md', 'commands/bar.md', 'CLAUDE.md', '.mcp.json']) {
      expect(isRuntimeReadonlyRelPath(p), p).toBe(false);
    }
  });
});
