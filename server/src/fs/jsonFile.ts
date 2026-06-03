export interface JsonFileModel {
  data: Record<string, unknown>;
  /** Detected indentation: a space count (number) or '\t'. */
  indent: number | string;
  trailingNewline: boolean;
  /** Original top-level key order, for stable re-serialization. */
  keyOrder: string[];
}

function detectIndent(raw: string): number | string {
  const m = /\n([ \t]+)\S/.exec(raw);
  if (!m) return 2;
  const unit = m[1]!;
  if (unit.includes('\t')) return '\t';
  return unit.length || 2;
}

/** Parse a JSON object file, capturing formatting so writes stay minimal-diff. */
export function parseJsonFile(raw: string): JsonFileModel {
  const trimmed = raw.trim();
  const data = trimmed ? (JSON.parse(trimmed) as unknown) : {};
  const isPlainObject = typeof data === 'object' && data !== null && !Array.isArray(data);
  return {
    data: isPlainObject ? (data as Record<string, unknown>) : {},
    indent: detectIndent(raw),
    trailingNewline: raw.endsWith('\n'),
    keyOrder: isPlainObject ? Object.keys(data as Record<string, unknown>) : [],
  };
}

/**
 * Serialize an object back to text, preserving the original top-level key order
 * (new keys appended), indentation, and trailing-newline.
 */
export function serializeJsonObject(
  obj: Record<string, unknown>,
  model: Pick<JsonFileModel, 'indent' | 'trailingNewline' | 'keyOrder'>,
): string {
  const ordered: Record<string, unknown> = {};
  for (const k of model.keyOrder) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) ordered[k] = obj[k];
  }
  for (const k of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, k)) ordered[k] = obj[k];
  }
  let out = JSON.stringify(ordered, null, model.indent ?? 2);
  if (model.trailingNewline) out += '\n';
  return out;
}
