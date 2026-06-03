import type { PermissionRule } from './artifacts';

export type PermissionPatternKind = 'command' | 'path' | 'domain' | 'name' | 'mcp' | 'none';

export interface PermissionToolDescriptor {
  tool: string;
  label: string;
  patternKind: PermissionPatternKind;
  patternHint?: string;
  /** Example rule to show in the builder. */
  example: string;
}

/** Tools the rule builder offers first, with adaptive pattern UIs. */
export const KNOWN_PERMISSION_TOOLS: PermissionToolDescriptor[] = [
  { tool: 'Bash', label: 'Bash', patternKind: 'command', patternHint: 'e.g. git:* or npm run test:*', example: 'Bash(git:*)' },
  { tool: 'Read', label: 'Read', patternKind: 'path', patternHint: 'path glob, e.g. /repo/**', example: 'Read(//path/**)' },
  { tool: 'Edit', label: 'Edit', patternKind: 'path', patternHint: 'path glob', example: 'Edit(/src/**)' },
  { tool: 'Write', label: 'Write', patternKind: 'path', patternHint: 'path glob', example: 'Write(/src/**)' },
  { tool: 'WebFetch', label: 'WebFetch', patternKind: 'domain', patternHint: 'domain:host', example: 'WebFetch(domain:github.com)' },
  { tool: 'WebSearch', label: 'WebSearch', patternKind: 'none', example: 'WebSearch' },
  { tool: 'Skill', label: 'Skill', patternKind: 'name', patternHint: 'skill name', example: 'Skill(commit)' },
  { tool: 'Task', label: 'Task', patternKind: 'name', patternHint: 'agent type', example: 'Task(Explore)' },
  { tool: 'Glob', label: 'Glob', patternKind: 'path', patternHint: 'glob', example: 'Glob(**/*.ts)' },
  { tool: 'Grep', label: 'Grep', patternKind: 'none', example: 'Grep' },
  { tool: 'NotebookEdit', label: 'NotebookEdit', patternKind: 'path', patternHint: 'path glob', example: 'NotebookEdit(/nb/**)' },
  { tool: 'mcp', label: 'MCP tool', patternKind: 'mcp', patternHint: 'server__tool', example: 'mcp__server__tool' },
];

export interface ParsedPermissionRule {
  tool: string;
  pattern?: string;
  raw: string;
  /** True when the raw string didn't match the expected Tool / Tool(pattern) shape. */
  malformed: boolean;
}

const RULE_RE = /^([A-Za-z][A-Za-z0-9_]*)(?:\((.*)\))?$/s;

/** Parse a permission rule string into its tool + optional pattern. */
export function parsePermissionRule(raw: PermissionRule): ParsedPermissionRule {
  const trimmed = raw.trim();
  // mcp rules look like mcp__server__tool (no parens).
  if (trimmed.startsWith('mcp__')) {
    return { tool: 'mcp', pattern: trimmed.slice('mcp__'.length), raw: trimmed, malformed: false };
  }
  const m = RULE_RE.exec(trimmed);
  if (!m) return { tool: trimmed, raw: trimmed, malformed: true };
  return {
    tool: m[1]!,
    pattern: m[2] === undefined ? undefined : m[2],
    raw: trimmed,
    malformed: false,
  };
}

/** Serialize a tool + optional pattern back into a rule string. */
export function formatPermissionRule(input: { tool: string; pattern?: string }): PermissionRule {
  const pattern = input.pattern?.trim();
  if (input.tool === 'mcp') return pattern ? `mcp__${pattern}` : 'mcp';
  return pattern ? `${input.tool}(${pattern})` : input.tool;
}

/** Group rules by tool (preserving order) for the columnar permissions editor. */
export function groupRulesByTool(rules: PermissionRule[]): Record<string, ParsedPermissionRule[]> {
  const out: Record<string, ParsedPermissionRule[]> = {};
  for (const r of rules) {
    const parsed = parsePermissionRule(r);
    (out[parsed.tool] ??= []).push(parsed);
  }
  return out;
}

/** Heuristic: is this an unusually broad/risky rule worth a confirm prompt? */
export function isBroadRule(raw: PermissionRule): boolean {
  const t = raw.trim();
  return (
    t === 'Bash(*)' ||
    t === 'Bash(:*)' ||
    /^(Read|Write|Edit)\(\/?\*\*?\)$/.test(t) ||
    /^(Read|Write|Edit)\(\/\*\*\)$/.test(t) ||
    t === 'WebFetch' ||
    t === 'Bash'
  );
}
