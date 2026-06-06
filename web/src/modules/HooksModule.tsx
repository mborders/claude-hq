import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, X, Webhook } from 'lucide-react';
import type { HookRow } from '@claude-hq/shared';
import { useHooks, useWriteHooks } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Button, Input, Spinner, EmptyState } from '../components/ui';
import { EditorFrame } from '../components/Editor';
import { TransferButton } from '../components/TransferButton';

const EVENTS = [
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'PreCompact',
];

export function HooksModule() {
  const { scopeId = 'global' } = useParams();
  const query = useHooks(scopeId);
  const write = useWriteHooks(scopeId);

  const [rows, setRows] = useState<HookRow[] | null>(null);
  const [baseline, setBaseline] = useState('');

  if (query.data && rows === null) {
    setRows(query.data.rows);
    setBaseline(JSON.stringify(query.data.rows));
  }

  const dirty = rows !== null && JSON.stringify(rows) !== baseline;
  const update = (next: HookRow[]) => setRows(next);
  const addRow = () => update([...(rows ?? []), { event: 'PreToolUse', matcher: '', command: '' }]);
  const setRow = (i: number, patch: Partial<HookRow>) => update(rows!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => update(rows!.filter((_, j) => j !== i));

  const save = async () => {
    try {
      await write.mutateAsync({ rows: (rows ?? []).filter((r) => r.command.trim()), expectedSha256: undefined });
      toast.success('Hooks saved');
      setBaseline(JSON.stringify(rows));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Save failed');
    }
  };

  if (query.isLoading || rows === null) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  return (
    <EditorFrame
      regKey={`${scopeId}:hooks`}
      title="Hooks"
      dirty={dirty}
      saving={write.isPending}
      onSave={save}
      onDiscard={() => setRows(JSON.parse(baseline))}
      headerExtra={
        <Button size="sm" variant="secondary" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add hook
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl px-6 py-5">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Webhook className="h-8 w-8" />}
            title="No hooks configured"
            description="Hooks run shell commands on Claude Code events (e.g. auto-approve safe Bash)."
            action={<Button variant="primary" onClick={addRow}><Plus className="h-4 w-4" /> Add hook</Button>}
          />
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[150px_120px_1fr_64px_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              <span>Event</span>
              <span>Matcher</span>
              <span>Command</span>
              <span>Timeout</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[150px_120px_1fr_64px_auto] items-center gap-2">
                <select
                  value={r.event}
                  onChange={(e) => setRow(i, { event: e.target.value })}
                  className="h-9 rounded-sm border border-border bg-surface px-2 text-sm text-ink focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay-ring/40"
                >
                  {EVENTS.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
                <Input value={r.matcher ?? ''} onChange={(e) => setRow(i, { matcher: e.target.value })} placeholder="Bash" />
                <Input mono value={r.command} onChange={(e) => setRow(i, { command: e.target.value })} placeholder="~/.claude/hooks/script.sh" />
                <Input
                  value={r.timeout?.toString() ?? ''}
                  onChange={(e) => setRow(i, { timeout: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="—"
                />
                <div className="flex items-center">
                  {r.command.trim() && (
                    <TransferButton type="hooks" label={`${r.event} hook`} identity={{ hook: r }} fromScopeId={scopeId} />
                  )}
                  <button onClick={() => removeRow(i)} className="flex h-9 w-8 items-center justify-center rounded-sm text-ink-subtle hover:bg-danger-soft hover:text-danger" aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </EditorFrame>
  );
}
