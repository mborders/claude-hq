import type { McpServer, McpListResponse, WriteResult } from '@ccm/shared';
import { parseJsonFile, serializeJsonObject, type JsonFileModel } from '../fs/jsonFile';
import { type ResolvedScope } from '../domain/paths';
import { validate } from '../schemas';
import { redactMcpServer, SECRET_MASK } from './redact';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';

const MCP_REL = '.mcp.json';
const ID_RE = /^[A-Za-z0-9._-]+$/;

function normalize(id: string, body: Record<string, unknown>): McpServer {
  const looksHttp = 'url' in body || ['http', 'sse'].includes(body.type as string);
  if (looksHttp) {
    return {
      id,
      transport: (body.type as 'http' | 'sse') ?? 'http',
      url: String(body.url ?? ''),
      ...(body.headers ? { headers: body.headers as Record<string, string> } : {}),
    };
  }
  return {
    id,
    transport: 'stdio',
    command: String(body.command ?? ''),
    ...(body.args ? { args: body.args as string[] } : {}),
    ...(body.env ? { env: body.env as Record<string, string> } : {}),
  };
}

export class McpService {
  constructor(private readonly ctx: AppContext) {}

  private readServers(scope: ResolvedScope): {
    meta: ReturnType<AppContext['files']['read']>['meta'];
    model: JsonFileModel | null;
    servers: Record<string, Record<string, unknown>>;
  } {
    const { meta, raw } = this.ctx.files.read(scope, MCP_REL);
    if (!meta.exists) return { meta, model: null, servers: {} };
    try {
      const model = parseJsonFile(raw);
      const servers = (model.data.mcpServers as Record<string, Record<string, unknown>>) ?? {};
      return { meta, model, servers };
    } catch (e) {
      throw new AppError('VALIDATION_FAILED', `Invalid .mcp.json: ${(e as Error).message}`);
    }
  }

  list(scope: ResolvedScope, reveal: boolean): McpListResponse {
    const { meta, servers } = this.readServers(scope);
    const out: McpServer[] = [];
    const redactedFields: string[] = [];
    for (const [id, body] of Object.entries(servers)) {
      const effective = reveal ? body : maskInto(body, id, redactedFields);
      out.push(normalize(id, effective));
    }
    return { meta, servers: out, ...(redactedFields.length ? { redactedFields } : {}) };
  }

  upsert(
    scope: ResolvedScope,
    id: string,
    body: Record<string, unknown>,
    opts: { expectedSha256?: string; create?: boolean },
  ): Promise<WriteResult> {
    if (!ID_RE.test(id)) throw new AppError('BAD_REQUEST', `Invalid server id: ${id}`);
    const issues = validate('mcp', body);
    if (issues.length) throw new AppError('VALIDATION_FAILED', 'MCP server is invalid.', { issues });

    return this.ctx.files.writeTransform(
      scope,
      MCP_REL,
      (currentRaw, exists) => {
        const model: JsonFileModel =
          exists && currentRaw.trim()
            ? parseJsonFile(currentRaw)
            : { data: { mcpServers: {} }, indent: 2, trailingNewline: true, keyOrder: ['mcpServers'] };
        const map = (model.data.mcpServers as Record<string, Record<string, unknown>>) ?? {};
        if (opts.create && map[id]) throw new AppError('ALREADY_EXISTS', `Server exists: ${id}`);
        // Restore masked headers/env from the existing server so editing a server
        // without revealing its secrets can't overwrite them with the mask.
        map[id] = reconstituteServerSecrets(body, map[id]);
        model.data.mcpServers = map;
        return { content: serializeJsonObject(model.data, model) };
      },
      { mode: 0o600, ...(opts.expectedSha256 !== undefined ? { expectedSha256: opts.expectedSha256 } : {}) },
    );
  }

  remove(scope: ResolvedScope, id: string, opts: { confirm?: boolean }): Promise<WriteResult> {
    return this.ctx.files.writeTransform(
      scope,
      MCP_REL,
      (currentRaw, exists) => {
        if (!exists || !currentRaw.trim()) throw new AppError('NOT_FOUND', `Server not found: ${id}`);
        const model = parseJsonFile(currentRaw);
        const map = (model.data.mcpServers as Record<string, unknown>) ?? {};
        if (!map[id]) throw new AppError('NOT_FOUND', `Server not found: ${id}`);
        delete map[id];
        model.data.mcpServers = map;
        return {
          content: serializeJsonObject(model.data, model),
          warnings: [`Remove MCP server "${id}"?`],
        };
      },
      { mode: 0o600, ...(opts.confirm !== undefined ? { confirm: opts.confirm } : {}) },
    );
  }
}

function reconstituteServerSecrets(
  body: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out = { ...body };
  for (const field of ['headers', 'env'] as const) {
    const sub = out[field];
    if (sub && typeof sub === 'object') {
      const prev = (existing?.[field] as Record<string, string>) ?? {};
      const next: Record<string, string> = { ...(sub as Record<string, string>) };
      for (const [k, v] of Object.entries(next)) {
        if (v === SECRET_MASK) {
          if (k in prev) next[k] = prev[k]!;
          else delete next[k];
        }
      }
      out[field] = next;
    }
  }
  return out;
}

function maskInto(body: Record<string, unknown>, id: string, fields: string[]): Record<string, unknown> {
  const { value, fields: f } = redactMcpServer(body);
  for (const path of f) fields.push(`${id}.${path}`);
  return value;
}
