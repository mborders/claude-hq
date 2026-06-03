import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAnyDirty, useDirty } from '../lib/stores';
import { Button } from '../components/ui';

export function SaveBar() {
  const { count, keys } = useAnyDirty();
  const handlers = useDirty((s) => s.handlers);

  const save = async () => {
    for (const k of keys) {
      try {
        await handlers[k]?.save();
      } catch {
        /* the editor surfaces its own error */
      }
    }
  };
  const discard = () => {
    for (const k of keys) handlers[k]?.discard();
    toast('Changes discarded');
  };

  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (count > 0) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, keys]);

  if (count === 0) return null;

  return (
    <div className="flex animate-slide-up items-center gap-1.5 rounded-md border border-clay/30 bg-surface px-1.5 py-1 shadow-md">
      <span className="flex items-center gap-1.5 px-1.5 text-sm text-ink">
        <span className="h-2 w-2 animate-pulse rounded-full bg-clay" />
        {count} unsaved
      </span>
      <Button size="sm" variant="ghost" onClick={discard}>
        Discard
      </Button>
      <Button size="sm" variant="primary" onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}
