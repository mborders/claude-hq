import { useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Clock } from 'lucide-react';
import type { BackupRef } from '@ccm/shared';
import { useBackups, useBackupPreview, useRestoreBackup } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Modal, ConfirmDialog } from './Dialog';
import { Button, Spinner } from './ui';
import { CodeMirror } from './CodeMirror';
import { cn } from '../lib/cn';

function relTime(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
const kb = (b: number) => `${Math.max(1, Math.round(b / 1024))} KB`;
const langFor = (relPath: string): 'json' | 'markdown' => (relPath.endsWith('.json') ? 'json' : 'markdown');

export function BackupsModal({
  scopeId,
  relPath,
  open,
  onOpenChange,
}: {
  scopeId: string;
  relPath: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data, isLoading } = useBackups(scopeId, relPath, open);
  const restore = useRestoreBackup(scopeId);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BackupRef | null>(null);

  const backups = data?.backups ?? [];
  // Fall back to the newest when nothing valid is selected (no effect needed).
  const activeId = selected && backups.some((b) => b.id === selected) ? selected : backups[0]?.id ?? null;
  const preview = useBackupPreview(scopeId, activeId ?? '', relPath, open && !!activeId);

  const doRestore = async (ref: BackupRef) => {
    try {
      await restore.mutateAsync({ backupId: ref.id, relPath });
      // Reload so whichever editor is open reflects the restored file.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Restore failed');
    }
  };

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} size="xl" title="Version history" description={relPath}>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-subtle">
            No backups yet. One is saved automatically before each change to this file.
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="max-h-[52vh] w-56 shrink-0 space-y-1 overflow-auto border-r border-border pr-3">
              {backups.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                    activeId === b.id ? 'border-clay bg-clay-soft/40' : 'border-transparent hover:bg-surface-2',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm text-ink">
                    <Clock className="h-3 w-3 text-ink-subtle" /> {relTime(b.createdAtMs)}
                  </span>
                  <span className="text-[11px] text-ink-subtle">
                    {new Date(b.createdAtMs).toLocaleString()} · {kb(b.size)}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {preview.isLoading ? (
                <div className="flex min-h-[44vh] items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <CodeMirror value={preview.data?.raw ?? ''} language={langFor(relPath)} readOnly minHeight="300px" maxHeight="44vh" />
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-ink-subtle">Restoring backs up your current file first — it’s reversible.</span>
                <Button
                  variant="primary"
                  disabled={!activeId}
                  loading={restore.isPending}
                  onClick={() => {
                    const b = backups.find((x) => x.id === activeId);
                    if (b) setConfirm(b);
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Restore this version
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Restore this version?"
        warnings={
          confirm
            ? [
                `Replace the current file with the version from ${new Date(confirm.createdAtMs).toLocaleString()}? Your current file is backed up first, and the editor reloads to show the restored file.`,
              ]
            : undefined
        }
        confirmLabel="Restore"
        tone="danger"
        onConfirm={() => {
          if (confirm) void doRestore(confirm);
        }}
      />
    </>
  );
}
