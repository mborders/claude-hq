import { describe, it, expect } from 'vitest';
import { parseJsonFile, serializeJsonObject } from './jsonFile';

describe('jsonFile (format-preserving)', () => {
  it('round-trips unchanged content (2-space indent + trailing newline)', () => {
    const raw = '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n';
    const m = parseJsonFile(raw);
    expect(serializeJsonObject(m.data, m)).toBe(raw);
  });

  it('preserves sibling keys when one nested key is edited', () => {
    const raw =
      '{\n  "enabledPlugins": { "x@y": true },\n  "permissions": { "allow": [] }\n}\n';
    const m = parseJsonFile(raw);
    (m.data.permissions as any).allow = ['Bash(git:*)'];
    const out = serializeJsonObject(m.data, m);
    expect(out).toContain('"enabledPlugins"');
    expect(out).toContain('Bash(git:*)');
    expect(JSON.parse(out).enabledPlugins).toEqual({ 'x@y': true });
  });

  it('preserves top-level key order and appends new keys at the end', () => {
    const raw = '{\n  "b": 1,\n  "a": 2,\n  "c": 3\n}\n';
    const m = parseJsonFile(raw);
    m.data.a = 99;
    m.data.zNew = true;
    const out = serializeJsonObject(m.data, m);
    expect(Object.keys(JSON.parse(out))).toEqual(['b', 'a', 'c', 'zNew']);
  });

  it('preserves 4-space indentation', () => {
    const raw = '{\n    "a": 1\n}\n';
    const m = parseJsonFile(raw);
    expect(serializeJsonObject(m.data, m)).toBe(raw);
  });

  it('preserves tab indentation', () => {
    const raw = '{\n\t"a": 1\n}\n';
    const m = parseJsonFile(raw);
    expect(serializeJsonObject(m.data, m)).toBe(raw);
  });

  it('preserves absence of a trailing newline', () => {
    const raw = '{\n  "a": 1\n}';
    const m = parseJsonFile(raw);
    expect(serializeJsonObject(m.data, m).endsWith('\n')).toBe(false);
  });

  it('parses an empty-object file and a whitespace-only file', () => {
    expect(parseJsonFile('{}').data).toEqual({});
    expect(parseJsonFile('').data).toEqual({});
  });
});
