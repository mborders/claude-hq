import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import type { SkillImportPreview, SkillImportResult } from '@ccm/shared';
import { parseFrontmatter } from '../fs/frontmatter';
import { removeDirSafe, lstatSafe } from '../fs/safeFs';
import { configRel, type ResolvedScope } from '../domain/paths';
import { validate } from '../schemas';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';

const NAME_RE = /^[A-Za-z0-9._-]+$/;
const MAX_FILES = 300;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface ParsedSkill {
  name: string;
  description: string;
  files: { rel: string; data: Uint8Array }[];
}

/**
 * Imports a `.skill` archive (a ZIP of a skill folder) as a new skill. Extraction
 * is sandboxed: every entry must stay within `skills/<name>/` — the path sandbox
 * only stops escapes from the scope root, so we additionally reject any entry that
 * climbs out of the skill directory (e.g. `../../settings.json`).
 */
export class SkillImportService {
  constructor(private readonly ctx: AppContext) {}

  /** Parse + validate without writing — powers the preview. */
  inspect(scope: ResolvedScope, zip: Buffer, nameOverride?: string): SkillImportPreview {
    const parsed = this.parse(zip, nameOverride);
    return {
      name: parsed.name,
      description: parsed.description,
      files: parsed.files
        .map((f) => ({ path: f.rel, bytes: f.data.length }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      totalBytes: parsed.files.reduce((n, f) => n + f.data.length, 0),
      wouldOverwrite: fs.existsSync(this.skillDirAbs(scope, parsed.name)),
    };
  }

  async import(
    scope: ResolvedScope,
    zip: Buffer,
    opts: { name?: string; confirm?: boolean },
  ): Promise<SkillImportResult> {
    if (this.ctx.env.readOnly) throw new AppError('READ_ONLY_MODE', 'The server is read-only.');
    const parsed = this.parse(zip, opts.name);

    // The literal (non-realpathed) skill dir. If it's a planted symlink, refuse:
    // sandbox.resolve would otherwise follow it and we'd rmSync/write onto its target.
    const literalDir = path.join(scope.rootDir, this.skillDirRel(scope, parsed.name));
    if (lstatSafe(literalDir)?.isSymbolicLink()) {
      throw new AppError('FORBIDDEN_PATH', `Skill "${parsed.name}" already exists as a symlink; refusing to import over it.`);
    }
    const dirAbs = this.skillDirAbs(scope, parsed.name);

    if (fs.existsSync(dirAbs) && !opts.confirm) {
      throw new AppError('CONFIRM_REQUIRED', `Skill "${parsed.name}" already exists.`, {
        warnings: [`Overwrite skill "${parsed.name}"?`],
      });
    }

    // Resolve every target path up front — a single unsafe entry aborts the whole
    // import before we touch disk, so a bad archive never half-writes or clobbers.
    const targets = parsed.files.map((f) => ({
      abs: this.resolveWithin(scope, parsed.name, f.rel),
      data: f.data,
    }));

    fs.mkdirSync(scope.claudeDir, { recursive: true });
    removeDirSafe(literalDir); // clean replace (refuses to follow a symlink)
    for (const t of targets) {
      fs.mkdirSync(path.dirname(t.abs), { recursive: true });
      fs.writeFileSync(t.abs, t.data, { mode: 0o644 });
    }
    return { name: parsed.name, files: parsed.files.map((f) => f.rel), fileCount: parsed.files.length };
  }

  // --- internals ---

  private skillDirRel(scope: ResolvedScope, name: string): string {
    return configRel(scope, `skills/${name}`);
  }

  private skillDirAbs(scope: ResolvedScope, name: string): string {
    return this.ctx.sandbox.resolve(scope.rootDir, this.skillDirRel(scope, name));
  }

  /** Resolve a skill-relative entry path, rejecting anything that escapes skills/<name>/. */
  private resolveWithin(scope: ResolvedScope, name: string, rel: string): string {
    const segs = rel.split('/');
    if (segs.some((s) => s === '..' || s === '.' || s === '')) {
      throw new AppError('BAD_REQUEST', `Unsafe path in archive: ${rel}`);
    }
    const dirAbs = this.skillDirAbs(scope, name);
    const abs = this.ctx.sandbox.resolve(scope.rootDir, `${this.skillDirRel(scope, name)}/${rel}`);
    if (abs !== dirAbs && !abs.startsWith(dirAbs + path.sep)) {
      throw new AppError('BAD_REQUEST', `Path escapes the skill directory: ${rel}`);
    }
    return abs;
  }

  private parse(zip: Buffer, nameOverride?: string): ParsedSkill {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(zip);
    } catch (e) {
      throw new AppError('BAD_REQUEST', 'Could not read the archive — is it a valid .skill/.zip file?', {
        cause: e,
      });
    }

    const fileKeys = Object.keys(entries).filter((k) => !k.endsWith('/') && entries[k] != null);
    if (fileKeys.length > MAX_FILES) {
      throw new AppError('PAYLOAD_TOO_LARGE', `Archive has too many files (${fileKeys.length} > ${MAX_FILES}).`);
    }

    // The folder holding the shallowest SKILL.md is the skill root.
    const skillMdKey = fileKeys
      .filter((k) => k === 'SKILL.md' || k.endsWith('/SKILL.md'))
      .sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!skillMdKey) throw new AppError('BAD_REQUEST', 'No SKILL.md found in the archive.');
    const prefix = skillMdKey.slice(0, skillMdKey.length - 'SKILL.md'.length); // '' or 'wrapper/'

    const files: { rel: string; data: Uint8Array }[] = [];
    let totalBytes = 0;
    for (const key of fileKeys) {
      if (!key.startsWith(prefix)) continue; // outside the skill root — ignore
      const rel = key.slice(prefix.length);
      if (!rel) continue;
      const data = entries[key];
      if (!data) continue;
      if (data.length > MAX_FILE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', `File too large: ${rel}`);
      totalBytes += data.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new AppError('PAYLOAD_TOO_LARGE', 'Archive contents exceed the size limit.');
      }
      files.push({ rel, data });
    }

    const skillMd = files.find((f) => f.rel === 'SKILL.md');
    if (!skillMd) throw new AppError('BAD_REQUEST', 'No SKILL.md found in the archive.');
    const fm = parseFrontmatter(Buffer.from(skillMd.data).toString('utf8'));
    const issues = validate('skill', fm.data);
    if (issues.length) throw new AppError('VALIDATION_FAILED', 'SKILL.md frontmatter is invalid.', { issues });

    const folderName = prefix ? (prefix.replace(/\/$/, '').split('/').pop() ?? '') : '';
    const name = (nameOverride ?? (fm.data.name as string) ?? folderName ?? '').trim();
    if (!name || !NAME_RE.test(name) || name === '.' || name === '..') {
      throw new AppError('BAD_REQUEST', `Could not determine a valid skill name: "${name}".`);
    }

    return { name, description: (fm.data.description as string) ?? '', files };
  }
}
