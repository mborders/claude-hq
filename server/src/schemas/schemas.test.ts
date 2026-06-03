import { describe, it, expect } from 'vitest';
import { validate } from './index';

describe('validation schemas', () => {
  it('settings: passthrough keeps unknown keys valid', () => {
    expect(validate('settings', { enabledPlugins: { 'a@b': true }, futureKey: 42 })).toEqual([]);
  });

  it('settings: permissions.allow must be a string array', () => {
    const issues = validate('settings', { permissions: { allow: [123] } });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.path).toContain('permissions.allow');
  });

  it('permissions: valid block passes', () => {
    expect(validate('permissions', { allow: ['Bash(git:*)'], deny: [] })).toEqual([]);
  });

  it('mcp: stdio server is valid', () => {
    expect(validate('mcp', { command: 'npx', args: ['-y', 'pkg'] })).toEqual([]);
  });

  it('mcp: http server is valid', () => {
    expect(validate('mcp', { type: 'http', url: 'https://example.com/mcp' })).toEqual([]);
  });

  it('mcp: http server with a bad url is invalid', () => {
    expect(validate('mcp', { type: 'http', url: 'not a url' }).length).toBeGreaterThan(0);
  });

  it('subagent: requires name and description', () => {
    expect(validate('subagent', { name: 'x', description: 'y' })).toEqual([]);
    expect(validate('subagent', { name: 'x' }).length).toBeGreaterThan(0);
  });

  it('command and memory are freeform (always valid)', () => {
    expect(validate('command', { anything: true })).toEqual([]);
    expect(validate('memory', 'just a string')).toEqual([]);
  });
});
