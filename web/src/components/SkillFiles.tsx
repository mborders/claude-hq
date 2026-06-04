import { useState } from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import { useTree, useRawFile } from '../lib/queries';
import { Card, Spinner } from './ui';
import { Modal } from './Dialog';
import { CodeMirror } from './CodeMirror';

const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'pdf', 'zip', 'gz', 'tar', 'tgz',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'wav', 'webm', 'bin', 'exe', 'dll',
  'so', 'dylib', 'wasm', 'class', 'jar', 'db', 'sqlite',
]);

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface SkillFile {
  relPath: string; // scope-root relative (for the API)
  rel: string; // skill-relative (for display), e.g. references/api.md
  name: string;
  size: number;
}

/** Lists a skill's supporting files (everything under skills/<name>/ except SKILL.md). */
export function SkillFilesPanel({ scopeId, skillDir }: { scopeId: string; skillDir: string }) {
  const { data, isLoading } = useTree(scopeId, skillDir, true);
  const [viewing, setViewing] = useState<SkillFile | null>(null);

  const prefix = `${skillDir}/`;
  const files: SkillFile[] = (data?.entries ?? [])
    .filter((e) => e.type === 'file' && e.relPath !== `${skillDir}/SKILL.md`)
    .map((e) => ({
      relPath: e.relPath,
      rel: e.relPath.startsWith(prefix) ? e.relPath.slice(prefix.length) : e.relPath,
      name: e.relPath.split('/').pop() ?? e.relPath,
      size: e.size,
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  if (isLoading || files.length === 0) return null; // nothing extra to show

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <FolderOpen className="h-4 w-4 text-ink-subtle" />
        Files
        <span className="text-ink-subtle">({files.length})</span>
      </div>
      <p className="text-[12px] text-ink-muted">Supporting files bundled with this skill. Click one to view it.</p>
      <Card className="divide-y divide-border">
        {files.map((f) => (
          <button
            key={f.relPath}
            onClick={() => setViewing(f)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
            <span className="flex-1 truncate font-mono text-[12px] text-ink">{f.rel}</span>
            <span className="shrink-0 text-[11px] text-ink-subtle">{kb(f.size)}</span>
          </button>
        ))}
      </Card>

      {viewing && (
        <FileViewerModal key={viewing.relPath} scopeId={scopeId} file={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function FileViewerModal({
  scopeId,
  file,
  onClose,
}: {
  scopeId: string;
  file: SkillFile;
  onClose: () => void;
}) {
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
  const previewable = !BINARY_EXTS.has(ext) && file.size <= 2 * 1024 * 1024;
  const raw = useRawFile(scopeId, file.relPath, previewable);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="xl" title={file.name} description={file.rel}>
      {!previewable ? (
        <div className="py-12 text-center text-sm text-ink-subtle">
          Preview isn’t available for this file type ({kb(file.size)}).
        </div>
      ) : raw.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : raw.isError ? (
        <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Couldn’t read this file.
        </div>
      ) : (
        <CodeMirror value={raw.data?.raw ?? ''} language={ext === 'json' ? 'json' : 'markdown'} readOnly minHeight="55vh" />
      )}
    </Modal>
  );
}
