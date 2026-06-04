import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, Globe, FolderGit2, Loader2 } from 'lucide-react';
import type { TransferType, TransferMode, HookRow } from '@ccm/shared';
import { useScopes, useTransfer } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Modal, ConfirmDialog } from './Dialog';
import { SegmentedControl, Tooltip } from './ui';
import { cn } from '../lib/cn';

export interface TransferIdentity {
  name?: string;
  id?: string;
  pluginId?: string;
  hook?: HookRow;
}

export function TransferButton({
  type,
  label,
  identity,
  fromScopeId,
  className,
}: {
  type: TransferType;
  label: string;
  identity: TransferIdentity;
  fromScopeId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip content="Move or copy to another scope">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          aria-label="Move or copy to another scope"
          className={cn(
            'rounded-sm p-1.5 text-ink-subtle transition-colors hover:bg-clay-soft hover:text-clay',
            className,
          )}
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>
      </Tooltip>
      {open && (
        <TransferDialog type={type} label={label} identity={identity} fromScopeId={fromScopeId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function TransferDialog({
  type,
  label,
  identity,
  fromScopeId,
  onClose,
}: {
  type: TransferType;
  label: string;
  identity: TransferIdentity;
  fromScopeId: string;
  onClose: () => void;
}) {
  const { data } = useScopes();
  const transfer = useTransfer();
  const [mode, setMode] = useState<TransferMode>('move');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ toScopeId: string; toLabel: string; warnings: string[] } | null>(null);

  const destinations = [
    ...(fromScopeId !== 'global' && data
      ? [{ id: 'global', label: 'Global', sub: '~/.claude', has: data.global.exists }]
      : []),
    ...(data?.projects ?? [])
      .filter((p) => p.id !== fromScopeId)
      .map((p) => ({ id: p.id, label: p.name, sub: p.path, has: p.hasClaudeDir })),
  ];

  const run = async (toScopeId: string, toLabel: string, confirmOverwrite: boolean) => {
    setBusy(toScopeId);
    try {
      await transfer.mutateAsync({ type, fromScopeId, toScopeId, mode, confirm: confirmOverwrite, ...identity });
      toast.success(`${mode === 'move' ? 'Moved' : 'Copied'} ${label} to ${toLabel}`);
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError && e.needsConfirm) {
        setConfirm({ toScopeId, toLabel, warnings: e.warnings ?? ['Overwrite the existing item?'] });
      } else {
        toast.error(e instanceof ApiClientError ? e.message : 'Transfer failed');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Modal open onOpenChange={(o) => !o && onClose()} title={`Move or copy “${label}”`} description="Send this item to another scope.">
        <div className="space-y-4">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'move', label: 'Move' },
              { value: 'copy', label: 'Copy' },
            ]}
          />
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Destination</div>
            <div className="max-h-72 space-y-1 overflow-auto">
              {destinations.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-subtle">No other scopes available.</p>
              )}
              {destinations.map((d) => (
                <button
                  key={d.id}
                  onClick={() => run(d.id, d.label, false)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-2.5 rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
                >
                  {d.id === 'global' ? (
                    <Globe className="h-4 w-4 shrink-0 text-ink-subtle" />
                  ) : (
                    <FolderGit2 className="h-4 w-4 shrink-0 text-ink-subtle" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{d.label}</div>
                    <div className="truncate font-mono text-[11px] text-ink-subtle">{d.sub}</div>
                  </div>
                  {!d.has && <span className="shrink-0 text-[11px] text-ink-subtle">creates .claude</span>}
                  {busy === d.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-clay" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Already exists"
        warnings={confirm?.warnings}
        confirmLabel={mode === 'move' ? 'Move & overwrite' : 'Copy & overwrite'}
        tone="danger"
        onConfirm={() => confirm && run(confirm.toScopeId, confirm.toLabel, true)}
      />
    </>
  );
}
