import { z } from 'zod';
import type { ValidationIssue, ValidateKind } from '@claude-hq/shared';

const ruleArray = z.array(z.string());

export const permissionsBlockSchema = z
  .object({
    allow: ruleArray.optional(),
    deny: ruleArray.optional(),
    ask: ruleArray.optional(),
    additionalDirectories: z.array(z.string()).optional(),
    defaultMode: z.string().optional(),
  })
  .passthrough();

export const hookCommandSchema = z.object({
  type: z.literal('command'),
  command: z.string().min(1),
  timeout: z.number().optional(),
});

export const hooksBlockSchema = z.record(
  z.array(
    z.object({
      matcher: z.string().optional(),
      hooks: z.array(hookCommandSchema),
    }),
  ),
);

/** Tolerant of unknown keys (passthrough) so future Claude Code settings stay valid. */
export const settingsSchema = z
  .object({
    permissions: permissionsBlockSchema.optional(),
    env: z.record(z.string()).optional(),
    hooks: hooksBlockSchema.optional(),
    model: z.string().optional(),
    enabledPlugins: z.record(z.boolean()).optional(),
    extraKnownMarketplaces: z.record(z.any()).optional(),
    alwaysThinkingEnabled: z.boolean().optional(),
    fastMode: z.boolean().optional(),
    preferredNotifChannel: z.string().optional(),
    skipWorkflowUsageWarning: z.boolean().optional(),
    statusLine: z.any().optional(),
    cleanupPeriodDays: z.number().optional(),
    includeCoAuthoredBy: z.boolean().optional(),
    outputStyle: z.string().optional(),
    apiKeyHelper: z.string().optional(),
  })
  .passthrough();

export const mcpStdioSchema = z
  .object({
    type: z.literal('stdio').optional(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  })
  .passthrough();

export const mcpHttpSchema = z
  .object({
    type: z.enum(['http', 'sse']),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  })
  .passthrough();

export const subagentFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    model: z.string().optional(),
    color: z.string().optional(),
    tools: z.string().optional(),
  })
  .passthrough();

export const skillFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .passthrough();

export const appConfigSchema = z.object({
  version: z.literal(1),
  scanRoots: z.array(z.string()),
  manualProjects: z.array(z.string()),
  hiddenProjects: z.array(z.string()),
  theme: z.enum(['light', 'dark', 'system']),
  revealSecrets: z.boolean(),
});

function formatPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === 'number') return `${acc}[${seg}]`;
    return acc ? `${acc}.${seg}` : String(seg);
  }, '');
}

export function zodToIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({ path: formatPath(i.path), message: i.message, code: i.code }));
}

export function runSchema(schema: z.ZodTypeAny, value: unknown): ValidationIssue[] {
  const r = schema.safeParse(value);
  return r.success ? [] : zodToIssues(r.error);
}

function validateMcpServer(value: unknown): ValidationIssue[] {
  const looksHttp =
    !!value &&
    typeof value === 'object' &&
    ('url' in (value as object) ||
      ['http', 'sse'].includes((value as Record<string, unknown>).type as string));
  return runSchema(looksHttp ? mcpHttpSchema : mcpStdioSchema, value);
}

/** Validate a value for a given artifact kind; returns [] when valid. */
export function validate(kind: ValidateKind, value: unknown): ValidationIssue[] {
  switch (kind) {
    case 'settings':
      return runSchema(settingsSchema, value);
    case 'permissions':
      return runSchema(permissionsBlockSchema, value);
    case 'mcp':
      return validateMcpServer(value);
    case 'hooks':
      return runSchema(hooksBlockSchema, value);
    case 'subagent':
      return runSchema(subagentFrontmatterSchema, value);
    case 'skill':
      return runSchema(skillFrontmatterSchema, value);
    case 'command':
    case 'memory':
      return []; // freeform markdown
    default:
      return [];
  }
}
