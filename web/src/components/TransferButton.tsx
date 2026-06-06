import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRightLeft, Globe, FolderGit2, Loader2, Search } from 'lucide-react';
import type { TransferType, TransferMode, HookRow } from '@claude-hq/shared';
import { useScopes, useTransfer } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Modal, ConfirmDialog } from './Dialog';
import { Input, SegmentedControl, Tooltip } from './ui';
import { cn } from '../lib/cn';

export interface TransferIdentity {
  name?: string;
  id?: string;
  pluginId?: string;
  hook?: HookRow;
}

interface Destination {
  id: string;
  label: string;
  sub: string;
  has: boolean;
}

function useDestinations(fromScopeId: string): Destination[] {
  const { data } = useScopes();
  return useMemo(
    () => [
      ...(fromScopeId !== 'global' && data
        ? [{ id: 'global', label: 'Global', sub: '~/.claude', has: data.global.exists }]
        : []),
      ...(data?.projects ?? [])
        .filter((p) => p.id !== fromScopeId)
        .map((p) => ({ id: p.id, label: p.name, sub: p.path, has: p.hasClaudeDir })),
    ],
    [data, fromScopeId],
  );
}

/** The move/copy mode toggle + filterable list of destination scopes. Shared by single + bulk. */
function ScopeDestinationList({
  fromScopeId,
  mode,
  setMode,
  busyId,
  onPick,
}: {
  fromScopeId: string;
  mode: TransferMode;
  setMode: (m: TransferMode) => void;
  busyId: string | null;
  onPick: (toScopeId: string, toLabel: string) => void;
}) {
  const all = useDestinations(fromScopeId);
  const [filter, setFilter] = useState('');
  const destinations = filter.trim()
    ? all.filter((d) => (d.label + ' ' + d.sub).toLowerCase().includes(filter.toLowerCase()))
    : all;

  return (
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
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Destination</span>
          {all.length > 5 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter scopes"
                className="h-8 w-44 pl-7 text-sm"
              />
            </div>
          )}
        </div>
        <div className="max-h-72 space-y-1 overflow-auto">
          {destinations.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-subtle">
              {filter ? 'No matching scopes.' : 'No other scopes available.'}
            </p>
          )}
          {destinations.map((d) => (
            <button
              key={d.id}
              onClick={() => onPick(d.id, d.label)}
              disabled={busyId !== null}
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
              {busyId === d.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-clay" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TransferButton({
  type,
  label,
  identity,
  fromScopeId,
  onMove,
  className,
}: {
  type: TransferType;
  label: string;
  identity: TransferIdentity;
  fromScopeId: string;
  /** Called after a successful MOVE (e.g. to navigate away from a now-empty editor). */
  onMove?: () => void;
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
        <TransferDialog
          type={type}
          label={label}
          identity={identity}
          fromScopeId={fromScopeId}
          onMove={onMove}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TransferDialog({
  type,
  label,
  identity,
  fromScopeId,
  onMove,
  onClose,
}: {
  type: TransferType;
  label: string;
  identity: TransferIdentity;
  fromScopeId: string;
  onMove?: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const transfer = useTransfer();
  const [mode, setMode] = useState<TransferMode>('move');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ toScopeId: string; toLabel: string; warnings: string[] } | null>(null);

  const destPath = (toScopeId: string) =>
    identity.name ? `/scope/${toScopeId}/${type}/${encodeURIComponent(identity.name)}` : `/scope/${toScopeId}/${type}`;

  const run = async (toScopeId: string, toLabel: string, confirmOverwrite: boolean) => {
    setBusy(toScopeId);
    try {
      await transfer.mutateAsync({ type, fromScopeId, toScopeId, mode, confirm: confirmOverwrite, ...identity });
      toast.success(`${mode === 'move' ? 'Moved' : 'Copied'} ${label} to ${toLabel}`, {
        action: { label: 'Open', onClick: () => navigate(destPath(toScopeId)) },
      });
      if (mode === 'move' && onMove) onMove();
      else onClose();
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
        <ScopeDestinationList fromScopeId={fromScopeId} mode={mode} setMode={setMode} busyId={busy} onPick={(id, l) => run(id, l, false)} />
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

/** Move/copy several items at once. Loops the transfer endpoint with per-item conflict handling. */
export function BulkTransferDialog({
  type,
  label,
  items,
  fromScopeId,
  onClose,
  onDone,
}: {
  type: TransferType;
  /** Singular noun, e.g. "subagent" — pluralized by count. */
  label: string;
  items: TransferIdentity[];
  fromScopeId: string;
  onClose: () => void;
  /** Called once the whole batch settles (success, partial, or all-failed). */
  onDone: () => void;
}) {
  const transfer = useTransfer();
  const [mode, setMode] = useState<TransferMode>('move');
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    toScopeId: string;
    toLabel: string;
    conflicts: TransferIdentity[];
    done: number;
    failed: string[];
  } | null>(null);
  // ConfirmDialog calls onOpenChange(false) on BOTH confirm and dismiss; this flag
  // lets the confirm (overwrite) path suppress the dismiss handler that fires with it.
  const confirming = useRef(false);

  const idOf = (it: TransferIdentity) => it.name ?? it.id ?? it.pluginId ?? 'item';
  const plural = (n: number) => `${n} ${label}${n === 1 ? '' : 's'}`;

  const transferOne = async (
    toScopeId: string,
    it: TransferIdentity,
    confirmOverwrite: boolean,
  ): Promise<'done' | 'conflict' | 'failed'> => {
    try {
      await transfer.mutateAsync({ type, fromScopeId, toScopeId, mode, confirm: confirmOverwrite, ...it });
      return 'done';
    } catch (e) {
      if (e instanceof ApiClientError && e.needsConfirm) return 'conflict';
      return 'failed';
    }
  };

  const finalize = (toLabel: string, done: number, skipped: number, failed: string[]) => {
    const verb = mode === 'move' ? 'Moved' : 'Copied';
    if (done > 0) {
      const extra = [skipped ? `${skipped} skipped` : '', failed.length ? `${failed.length} failed` : ''].filter(Boolean);
      toast.success(`${verb} ${plural(done)} to ${toLabel}${extra.length ? ` · ${extra.join(' · ')}` : ''}`);
    } else if (failed.length) {
      toast.error(`Failed to ${mode} ${plural(failed.length)}`);
    }
    onDone();
  };

  const firstPass = async (toScopeId: string, toLabel: string) => {
    setBusy(toScopeId);
    let done = 0;
    const conflicts: TransferIdentity[] = [];
    const failed: string[] = [];
    for (const it of items) {
      const r = await transferOne(toScopeId, it, false);
      if (r === 'done') done++;
      else if (r === 'conflict') conflicts.push(it);
      else failed.push(idOf(it));
    }
    setBusy(null);
    if (conflicts.length) {
      setPending({ toScopeId, toLabel, conflicts, done, failed });
      return;
    }
    finalize(toLabel, done, 0, failed);
  };

  const overwritePass = async () => {
    if (!pending) return;
    confirming.current = true;
    const { toScopeId, toLabel, conflicts, done, failed } = pending;
    setPending(null);
    setBusy(toScopeId);
    let overwritten = 0;
    const failed2 = [...failed];
    for (const it of conflicts) {
      const r = await transferOne(toScopeId, it, true);
      if (r === 'done') overwritten++;
      else failed2.push(idOf(it));
    }
    setBusy(null);
    finalize(toLabel, done + overwritten, 0, failed2);
  };

  // Dismissing the conflict prompt: keep the already-done items, skip the conflicts.
  // Ignored when it's the close that rides along with a confirm (overwrite) click.
  const closeConflict = () => {
    if (confirming.current) {
      confirming.current = false;
      return;
    }
    if (!pending) return;
    const { toLabel, conflicts, done, failed } = pending;
    setPending(null);
    finalize(toLabel, done, conflicts.length, failed);
  };

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => !o && onClose()}
        title={`Move or copy ${plural(items.length)}`}
        description="Send the selected items to another scope."
      >
        <ScopeDestinationList fromScopeId={fromScopeId} mode={mode} setMode={setMode} busyId={busy} onPick={(id, l) => firstPass(id, l)} />
      </Modal>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && closeConflict()}
        title="Some items already exist"
        warnings={
          pending
            ? [
                `${pending.conflicts.length} of ${items.length} already exist in ${pending.toLabel}. Overwrite them?` +
                  (pending.done > 0
                    ? ` The other ${pending.done} ${pending.done === 1 ? 'was' : 'were'} ${mode === 'move' ? 'moved' : 'copied'}.`
                    : ''),
              ]
            : undefined
        }
        confirmLabel={`Overwrite ${pending?.conflicts.length ?? ''}`.trim()}
        tone="danger"
        onConfirm={overwritePass}
      />
    </>
  );
}
