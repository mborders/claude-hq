import { useCallback, useState } from 'react';
import { ArrowRightLeft, CheckSquare, Square, X } from 'lucide-react';
import { Button } from './ui';

/** Selection state for a list that supports bulk actions. */
export function useMultiSelect() {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected((s) => (s.size === ids.length ? new Set() : new Set(ids)));
  }, []);

  const start = useCallback(() => setSelecting(true), []);
  const clear = useCallback(() => {
    setSelected(new Set());
    setSelecting(false);
  }, []);

  return { selecting, selected, toggle, selectAll, start, clear };
}

export function RowCheckbox({ checked }: { checked: boolean }) {
  return checked ? (
    <CheckSquare className="h-4 w-4 shrink-0 text-clay" />
  ) : (
    <Square className="h-4 w-4 shrink-0 text-ink-subtle" />
  );
}

export function BulkActionBar({
  count,
  allSelected,
  onToggleAll,
  onAction,
  onClear,
}: {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onAction: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 rounded-lg border border-clay/30 bg-clay-soft/70 px-3 py-2 backdrop-blur">
      <button onClick={onToggleAll} className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
        {allSelected ? <CheckSquare className="h-4 w-4 text-clay" /> : <Square className="h-4 w-4" />}
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>
      <span className="text-sm font-medium text-ink">{count} selected</span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="primary" disabled={count === 0} onClick={onAction}>
          <ArrowRightLeft className="h-3.5 w-3.5" /> Move or copy…
        </Button>
        <button onClick={onClear} aria-label="Cancel selection" className="rounded-sm p-1.5 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
