import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter';

const WITH_FM = '---\nname: my-agent\ndescription: Does things\nmodel: sonnet\n---\nYou are an agent.\n';

describe('frontmatter', () => {
  it('parses frontmatter data + body', () => {
    const d = parseFrontmatter(WITH_FM);
    expect(d.hasFrontmatter).toBe(true);
    expect(d.data).toEqual({ name: 'my-agent', description: 'Does things', model: 'sonnet' });
    expect(d.body).toBe('You are an agent.\n');
  });

  it('treats a file without frontmatter as pure body (e.g. CLAUDE.md)', () => {
    const raw = '# Project memory\n\nSome notes.\n';
    const d = parseFrontmatter(raw);
    expect(d.hasFrontmatter).toBe(false);
    expect(d.data).toEqual({});
    expect(d.body).toBe(raw);
  });

  it('body-only edits keep the frontmatter block byte-identical', () => {
    const d = parseFrontmatter(WITH_FM);
    d.body = 'You are a BETTER agent.\n';
    expect(stringifyFrontmatter(d)).toBe(
      '---\nname: my-agent\ndescription: Does things\nmodel: sonnet\n---\nYou are a BETTER agent.\n',
    );
  });

  it('round-trips with no edits', () => {
    const d = parseFrontmatter(WITH_FM);
    expect(stringifyFrontmatter(d)).toBe(WITH_FM);
  });

  it('re-emits frontmatter when data changes', () => {
    const d = parseFrontmatter(WITH_FM);
    d.data.model = 'opus';
    const out = stringifyFrontmatter(d);
    expect(parseFrontmatter(out).data.model).toBe('opus');
    expect(out).toContain('You are an agent.');
  });

  it('creates frontmatter for a brand-new doc', () => {
    const out = stringifyFrontmatter({
      data: { name: 'x', description: 'y' },
      body: '# Body\n',
      hasFrontmatter: true,
      rawHeader: null,
      originalData: {},
    });
    const re = parseFrontmatter(out);
    expect(re.data).toEqual({ name: 'x', description: 'y' });
    expect(re.body).toBe('# Body\n');
  });
});
