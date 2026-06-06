import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtifactEnvelope,
  MemoryDoc,
  MemoryKind,
  MemoryListItem,
  WriteResult,
} from '@claude-hq/shared';
import { parseFrontmatter, stringifyFrontmatter } from '../fs/frontmatter';
import { type ResolvedScope } from '../domain/paths';
import { AppError } from '../http/appError';
import type { AppContext } from '../context';

function classify(scope: ResolvedScope, relPath: string): MemoryKind {
  if (relPath.startsWith('projects/')) {
    return relPath.endsWith('MEMORY.md') ? 'global-store' : 'global-feedback';
  }
  if (relPath === '.claude/CLAUDE.md') return 'project-claude';
  return 'project-root';
}

export class MemoryService {
  constructor(private readonly ctx: AppContext) {}

  private candidateRelPaths(scope: ResolvedScope): string[] {
    if (scope.kind === 'project') return ['CLAUDE.md', '.claude/CLAUDE.md'];
    // global: ~/.claude/CLAUDE.md plus the auto-memory store under projects/<enc>/memory
    const rels = ['CLAUDE.md'];
    const projectsDir = path.join(scope.rootDir, 'projects');
    try {
      for (const enc of fs.readdirSync(projectsDir)) {
        const memDir = path.join(projectsDir, enc, 'memory');
        let files: string[];
        try {
          files = fs.readdirSync(memDir);
        } catch {
          continue;
        }
        for (const f of files) {
          if (f.endsWith('.md')) rels.push(`projects/${enc}/memory/${f}`);
        }
      }
    } catch {
      /* no projects dir */
    }
    return rels;
  }

  list(scope: ResolvedScope): MemoryListItem[] {
    const out: MemoryListItem[] = [];
    for (const rel of this.candidateRelPaths(scope)) {
      const { meta, raw } = this.ctx.files.read(scope, rel);
      // Always surface the canonical CLAUDE.md (so it can be created); skip
      // non-existent store entries.
      if (!meta.exists && rel.startsWith('projects/')) continue;
      out.push({
        relPath: rel,
        meta,
        memoryKind: classify(scope, rel),
        ...(meta.exists ? { preview: firstMeaningfulLine(raw) } : {}),
      });
    }
    return out;
  }

  getDoc(scope: ResolvedScope, relPath: string): ArtifactEnvelope<MemoryDoc> {
    const { meta, raw } = this.ctx.files.read(scope, relPath);
    const fm = parseFrontmatter(raw);
    const structured: MemoryDoc = {
      hasFrontmatter: fm.hasFrontmatter,
      frontmatter: fm.hasFrontmatter ? fm.data : null,
      body: fm.body,
      memoryKind: classify(scope, relPath),
    };
    return { kind: 'memory', meta, structured, raw };
  }

  putDoc(
    scope: ResolvedScope,
    relPath: string,
    input: { raw?: string; structured?: MemoryDoc; expectedSha256?: string },
  ): Promise<WriteResult> {
    if (!isMemoryRelPath(relPath)) {
      throw new AppError('BAD_REQUEST', `Not a memory document: ${relPath} (use the raw editor for other files).`);
    }
    let content: string;
    if (input.raw !== undefined) {
      content = input.raw;
    } else if (input.structured) {
      const s = input.structured;
      content = stringifyFrontmatter({
        data: s.frontmatter ?? {},
        body: s.body,
        hasFrontmatter: s.hasFrontmatter && s.frontmatter !== null,
        rawHeader: null,
        originalData: {},
      });
    } else {
      throw new AppError('BAD_REQUEST', 'Either raw or structured content is required.');
    }
    return this.ctx.files.write(scope, relPath, content, {
      mode: 0o644,
      ...(input.expectedSha256 !== undefined ? { expectedSha256: input.expectedSha256 } : {}),
    });
  }
}

/** Constrain memory writes to CLAUDE.md files and the global memory store. */
function isMemoryRelPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  return (
    p === 'CLAUDE.md' ||
    p.endsWith('/CLAUDE.md') ||
    /^projects\/[^/]+\/memory\/[^/]+\.md$/.test(p)
  );
}

function firstMeaningfulLine(raw: string): string {
  const body = parseFrontmatter(raw).body;
  const line = body.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.replace(/^#+\s*/, '').trim().slice(0, 140);
}
