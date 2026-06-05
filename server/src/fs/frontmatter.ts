import yaml from 'js-yaml';

export interface FrontmatterDoc {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
  /** Exact original frontmatter incl. fences + trailing newline (for verbatim re-emit). */
  rawHeader: string | null;
  /** Snapshot of `data` at parse time, to detect whether frontmatter changed. */
  originalData: Record<string, unknown>;
  /** Set when the frontmatter block exists but is not valid YAML (data is then `{}`). */
  parseError?: string;
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;
const BOM = 0xfeff;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseFrontmatter(raw: string): FrontmatterDoc {
  const text = raw.charCodeAt(0) === BOM ? raw.slice(1) : raw;
  const m = FM_RE.exec(text);
  if (!m) {
    return { data: {}, body: text, hasFrontmatter: false, rawHeader: null, originalData: {} };
  }
  const body = text.slice(m[0].length);

  // JSON_SCHEMA: no custom tags (no code-exec), and predictable scalar typing
  // (avoids YAML-1.1 quirks like `no` -> false in a description). Frontmatter is
  // further validated by zod schemas at the route layer.
  let loaded: unknown;
  try {
    loaded = yaml.load(m[1]!, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    // Malformed YAML — e.g. a Claude-generated agent whose unquoted description
    // contains colons (`Examples:`, `user:`). Degrade gracefully (empty data +
    // the body, flagged) instead of throwing and breaking the entire list.
    return {
      data: {},
      body,
      hasFrontmatter: true,
      rawHeader: m[0],
      originalData: {},
      parseError: err instanceof Error ? err.message : 'Invalid YAML frontmatter',
    };
  }

  const data = isPlainObject(loaded) ? loaded : {};
  return {
    data,
    body,
    hasFrontmatter: true,
    rawHeader: m[0],
    originalData: structuredClone(data),
  };
}

function dumpYaml(data: Record<string, unknown>): string {
  // lineWidth: -1 prevents folding long descriptions onto multiple lines.
  return yaml.dump(data, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true });
}

export function stringifyFrontmatter(doc: FrontmatterDoc): string {
  const hasData = Object.keys(doc.data).length > 0;

  if (!doc.hasFrontmatter && !hasData) {
    return doc.body;
  }

  // Body-only edit: re-emit the exact original frontmatter region.
  const unchanged =
    doc.rawHeader !== null && JSON.stringify(doc.data) === JSON.stringify(doc.originalData);
  if (unchanged) {
    return doc.rawHeader + doc.body;
  }

  const header = `---\n${dumpYaml(doc.data)}---\n`;
  return header + doc.body;
}
