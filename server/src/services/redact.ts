import type { KnownSettings } from '@ccm/shared';

export const SECRET_MASK = '••••••• (hidden)';

function maskValues(
  obj: Record<string, string> | undefined,
  basePath: string,
  fields: string[],
): Record<string, string> | undefined {
  if (!obj) return obj;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_MASK;
    fields.push(`${basePath}.${k}`);
    void v;
  }
  return out;
}

/** Mask settings.env values (the only secret-bearing settings field). */
export function redactSettings(s: KnownSettings): { value: KnownSettings; fields: string[] } {
  const fields: string[] = [];
  if (!s.env) return { value: s, fields };
  return { value: { ...s, env: maskValues(s.env, 'env', fields) }, fields };
}

/** Mask an MCP server's headers + env values. */
export function redactMcpServer(
  server: Record<string, unknown>,
): { value: Record<string, unknown>; fields: string[] } {
  const fields: string[] = [];
  const value: Record<string, unknown> = { ...server };
  if (server.headers && typeof server.headers === 'object') {
    value.headers = maskValues(server.headers as Record<string, string>, 'headers', fields);
  }
  if (server.env && typeof server.env === 'object') {
    value.env = maskValues(server.env as Record<string, string>, 'env', fields);
  }
  return { value, fields };
}
