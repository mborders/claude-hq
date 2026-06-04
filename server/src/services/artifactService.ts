import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtifactType,
  ArtifactEnvelope,
  ArtifactSummary,
  Subagent,
  SlashCommand,
  Skill,
  WriteResult,
  ValidateKind,
} from '@ccm/shared';
import {
  parseFrontmatter,
  stringifyFrontmatter,
  type FrontmatterDoc,
} from '../fs/frontmatter';
import { removeDirSafe, lstatSafe } from '../fs/safeFs';
import { configRel, type ResolvedScope } from '../domain/paths';
import { validate } from '../schemas';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';

const NAME_RE = /^[A-Za-z0-9._-]+$/;

function assertName(name: string): void {
  if (!NAME_RE.test(name) || name === '.' || name === '..') {
    throw new AppError('BAD_REQUEST', `Invalid name: ${name}`);
  }
}

function relFor(scope: ResolvedScope, type: ArtifactType, name: string): string {
  if (type === 'skills') return configRel(scope, `skills/${name}/SKILL.md`);
  return configRel(scope, `${type}/${name}.md`);
}

function validateKindFor(type: ArtifactType): ValidateKind {
  return type === 'agents' ? 'subagent' : type === 'skills' ? 'skill' : 'command';
}

function firstLine(body: string): string {
  const line = body.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.replace(/^#+\s*/, '').replace(/^#\s*Claude Command:\s*/i, '').trim().slice(0, 140);
}

export class ArtifactService {
  constructor(private readonly ctx: AppContext) {}

  list(scope: ResolvedScope, type: ArtifactType): ArtifactSummary[] {
    const dirRel = configRel(scope, type);
    let dirAbs: string;
    try {
      dirAbs = this.ctx.sandbox.resolve(scope.rootDir, dirRel);
    } catch {
      return [];
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return [];
    }

    const items: ArtifactSummary[] = [];
    for (const e of entries) {
      let name: string;
      let rel: string;
      if (type === 'skills') {
        if (!e.isDirectory()) continue;
        name = e.name;
        rel = relFor(scope, type, name);
        if (!fs.existsSync(this.ctx.sandbox.resolve(scope.rootDir, rel))) continue;
      } else {
        if (!e.isFile() || !e.name.endsWith('.md') || e.name.endsWith('.old')) continue;
        name = e.name.slice(0, -3);
        rel = relFor(scope, type, name);
      }
      const { meta, raw } = this.ctx.files.read(scope, rel);
      const fm = parseFrontmatter(raw);
      const description =
        (fm.data.description as string) || (type === 'commands' ? firstLine(fm.body) : '');
      items.push({
        name,
        description,
        ...(type === 'agents' && fm.data.model ? { badge: String(fm.data.model) } : {}),
        mtimeMs: meta.mtimeMs,
        relPath: rel,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }

  get(scope: ResolvedScope, type: ArtifactType, name: string): ArtifactEnvelope<Subagent | SlashCommand | Skill> {
    assertName(name);
    const rel = relFor(scope, type, name);
    const { meta, raw } = this.ctx.files.read(scope, rel);
    if (!meta.exists) throw new AppError('NOT_FOUND', `${type} not found: ${name}`);
    const fm = parseFrontmatter(raw);

    if (type === 'agents') {
      const structured: Subagent = { frontmatter: fm.data as Subagent['frontmatter'], body: fm.body };
      return { kind: 'subagent', meta, structured, raw };
    }
    if (type === 'skills') {
      const dirAbs = path.dirname(this.ctx.sandbox.resolve(scope.rootDir, rel));
      const structured: Skill = {
        frontmatter: fm.data as Skill['frontmatter'],
        body: fm.body,
        dir: configRel(scope, `skills/${name}`),
        hasReferences: fs.existsSync(path.join(dirAbs, 'references')),
        hasExamples: fs.existsSync(path.join(dirAbs, 'examples')),
        extraFiles: safeReaddir(dirAbs).filter((f) => f !== 'SKILL.md'),
      };
      return { kind: 'skill', meta, structured, raw };
    }
    const structured: SlashCommand = {
      frontmatter: fm.hasFrontmatter ? fm.data : null,
      body: fm.body,
      title: firstLine(fm.body) || name,
    };
    return { kind: 'command', meta, structured, raw };
  }

  upsert(
    scope: ResolvedScope,
    type: ArtifactType,
    name: string,
    input: { structured?: { frontmatter: Record<string, unknown> | null; body: string }; raw?: string; expectedSha256?: string; confirm?: boolean },
    create: boolean,
  ): Promise<WriteResult> {
    assertName(name);
    const rel = relFor(scope, type, name);
    const cur = this.ctx.files.meta(scope, rel);
    if (create && cur.exists) throw new AppError('ALREADY_EXISTS', `${type} already exists: ${name}`);

    let content: string;
    if (input.raw !== undefined) {
      content = input.raw;
      const fm = parseFrontmatter(content);
      const issues = validate(validateKindFor(type), fm.data);
      if (issues.length) throw new AppError('VALIDATION_FAILED', 'Frontmatter is invalid.', { issues });
    } else if (input.structured) {
      const fmData = input.structured.frontmatter ?? {};
      const issues = validate(validateKindFor(type), fmData);
      if (issues.length) throw new AppError('VALIDATION_FAILED', 'Frontmatter is invalid.', { issues });
      content = this.serialize(scope, rel, input.structured.frontmatter, input.structured.body);
    } else {
      throw new AppError('BAD_REQUEST', 'Either structured or raw content is required.');
    }

    return this.ctx.files.write(scope, rel, content, {
      mode: 0o644,
      ...(input.expectedSha256 !== undefined ? { expectedSha256: input.expectedSha256 } : {}),
    });
  }

  async delete(scope: ResolvedScope, type: ArtifactType, name: string, opts: { expectedSha256?: string; confirm?: boolean }): Promise<{ backup?: WriteResult['backup'] }> {
    assertName(name);
    const rel = relFor(scope, type, name);
    // A skill is a whole directory. Refuse to act through a symlinked skill dir
    // (don't delete its target), then remove the folder after its SKILL.md.
    const skillDir = type === 'skills' ? path.join(scope.rootDir, configRel(scope, `skills/${name}`)) : null;
    if (skillDir && lstatSafe(skillDir)?.isSymbolicLink()) {
      throw new AppError('FORBIDDEN_PATH', `Skill "${name}" is a symlink; refusing to delete through it.`);
    }
    const result = await this.ctx.files.delete(scope, rel, {
      warnings: [`Delete ${type.slice(0, -1)} "${name}"?`],
      ...(opts.confirm !== undefined ? { confirm: opts.confirm } : {}),
      ...(opts.expectedSha256 !== undefined ? { expectedSha256: opts.expectedSha256 } : {}),
    });
    // Clean up the rest of the folder (references/, examples/, scripts, …).
    if (skillDir) removeDirSafe(skillDir);
    return result;
  }

  /** Build file content, reusing the existing frontmatter block when it is unchanged. */
  private serialize(scope: ResolvedScope, rel: string, frontmatter: Record<string, unknown> | null, body: string): string {
    const existing = this.ctx.files.read(scope, rel);
    let doc: FrontmatterDoc;
    if (existing.meta.exists) {
      doc = parseFrontmatter(existing.raw);
      doc.data = frontmatter ?? {};
      doc.body = body;
    } else {
      doc = {
        data: frontmatter ?? {},
        body,
        hasFrontmatter: frontmatter !== null,
        rawHeader: null,
        originalData: {},
      };
    }
    return stringifyFrontmatter(doc);
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
