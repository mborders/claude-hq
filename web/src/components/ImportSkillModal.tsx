import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, FileArchive, AlertTriangle, FileText } from 'lucide-react';
import type { SkillImportPreview, SkillImportResult } from '@claude-hq/shared';
import { useImportSkill } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Modal } from './Dialog';
import { Button, Input, Field, Spinner } from './ui';

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function ImportSkillModal({
  scopeId,
  open,
  onOpenChange,
}: {
  scopeId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const importSkill = useImportSkill(scopeId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  const [name, setName] = useState('');
  const [conflict, setConflict] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setData(null);
    setFilename('');
    setPreview(null);
    setName('');
    setConflict(false);
    setError(null);
  };
  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const pickFile = async (file: File) => {
    reset();
    setReading(true);
    setFilename(file.name);
    try {
      const b64 = await readBase64(file);
      setData(b64);
      const p = (await importSkill.mutateAsync({ dataBase64: b64, dryRun: true })) as SkillImportPreview;
      setPreview(p);
      setName(p.name);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Could not read that archive.');
    } finally {
      setReading(false);
    }
  };

  // Overwrite is shown when the (unrenamed) name already exists, or once the server
  // reports a conflict for whatever name is currently entered.
  const showOverwrite = !!preview && ((name.trim() === preview.name && preview.wouldOverwrite) || conflict);

  const doImport = async () => {
    if (!data || !preview) return;
    try {
      const res = (await importSkill.mutateAsync({
        dataBase64: data,
        name: name.trim() || undefined,
        confirm: showOverwrite,
      })) as SkillImportResult;
      toast.success(`Imported skill “${res.name}”`);
      close(false);
      navigate(`/scope/${scopeId}/skills/${encodeURIComponent(res.name)}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsConfirm) {
        setConflict(true); // surface the warning + flip the button to "Overwrite"
        return;
      }
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      size="lg"
      title="Import a skill"
      description="Upload a .skill archive — a zip of a skill folder with a SKILL.md inside."
    >
      <input
        ref={fileRef}
        type="file"
        accept=".skill,.zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pickFile(f);
          e.target.value = '';
        }}
      />

      <div className="space-y-4">
        {!preview && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={reading}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center transition-colors hover:border-clay hover:bg-clay-soft/40 disabled:opacity-60"
          >
            {reading ? <Spinner /> : <Upload className="h-7 w-7 text-ink-subtle" />}
            <span className="text-sm text-ink">{reading ? 'Reading archive…' : 'Choose a .skill or .zip file'}</span>
            <span className="text-[11px] text-ink-subtle">It’s parsed and validated before anything is written.</span>
          </button>
        )}

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
        )}

        {preview && (
          <>
            <div className="flex items-center gap-2 text-[11px] text-ink-subtle">
              <FileArchive className="h-3.5 w-3.5" />
              <span className="font-mono">{filename}</span>
              <span>· {preview.files.length} file{preview.files.length === 1 ? '' : 's'} · {Math.max(1, Math.round(preview.totalBytes / 1024))} KB</span>
            </div>

            <Field label="Skill name" hint="Saved as skills/<name>/SKILL.md">
              <Input
                mono
                value={name}
                onChange={(e) => {
                  setName(e.target.value.replace(/[^A-Za-z0-9._-]/g, '-'));
                  setConflict(false);
                }}
              />
            </Field>

            {preview.description && (
              <Field label="Description">
                <p className="line-clamp-3 text-sm text-ink-muted">{preview.description}</p>
              </Field>
            )}

            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Contents</div>
              <div className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-border bg-surface-2 p-2">
                {preview.files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                    <FileText className="h-3 w-3 shrink-0 text-ink-subtle" />
                    <span className="truncate">{f.path}</span>
                  </div>
                ))}
              </div>
            </div>

            {showOverwrite && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>A skill named “{name.trim()}” already exists in this scope — importing will replace it.</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={reset}>
                Choose another
              </Button>
              <Button
                variant={showOverwrite ? 'danger' : 'primary'}
                loading={importSkill.isPending}
                disabled={!name.trim()}
                onClick={doImport}
              >
                {showOverwrite ? 'Overwrite & import' : 'Import skill'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
