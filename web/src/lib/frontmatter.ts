import yaml from 'js-yaml';

const FM_RE = /^\\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export interface SplitDoc {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

export function splitFrontmatter(raw: string): SplitDoc {
  const m = FM_RE.exec(raw);
  if (!m) return { data: {}, body: raw, hasFrontmatter: false };
  let data: Record<string, unknown> = {};
  try {
    const loaded = yaml.load(m[1]!, { schema: yaml.JSON_SCHEMA });
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) data = loaded as Record<string, unknown>;
  } catch {
    /* leave data empty; caller can still edit raw */
  }
  return { data, body: raw.slice(m[0].length), hasFrontmatter: true };
}

export function joinFrontmatter(data: Record<string, unknown>, body: string, hasFrontmatter: boolean): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== '' && v !== null) clean[k] = v;
  }
  if (!hasFrontmatter && Object.keys(clean).length === 0) return body;
  const dumped = yaml.dump(clean, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true });
  return `---\n${dumped}---\n${body}`;
}
