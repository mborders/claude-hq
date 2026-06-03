import { Plus, X } from 'lucide-react';
import { Input, Button } from './ui';

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = 'KEY',
  valuePlaceholder = 'value',
  masked,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  masked?: boolean;
}) {
  const entries = Object.entries(value ?? {});

  const setKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  };
  const setVal = (key: string, v: string) => onChange({ ...value, [key]: v });
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const add = () => onChange({ ...value, '': '' });

  return (
    <div className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          <Input mono value={k} onChange={(e) => setKey(k, e.target.value)} placeholder={keyPlaceholder} className="w-1/3" />
          <span className="text-ink-subtle">=</span>
          <Input
            mono
            value={v}
            onChange={(e) => setVal(k, e.target.value)}
            placeholder={valuePlaceholder}
            type={masked ? 'text' : 'text'}
            className="flex-1"
          />
          <button onClick={() => remove(k)} className="rounded-sm p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger" aria-label="Remove">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
