import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as Popover from '@radix-ui/react-popover';
import { Plus, X, ShieldCheck, ShieldX, Search, FolderPlus } from 'lucide-react';
import type { PermissionsBlock } from '@claude-hq/shared';
import {
  KNOWN_PERMISSION_TOOLS,
  formatPermissionRule,
  groupRulesByTool,
  isBroadRule,
} from '@claude-hq/shared';
import { usePermissions, useWritePermissions } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Button, Input, Spinner, Badge } from '../components/ui';
import { EditorFrame } from '../components/Editor';
import { ConfirmDialog } from '../components/Dialog';
import { cn } from '../lib/cn';

type Col = 'allow' | 'deny';

export function PermissionsModule() {
  const { scopeId = 'global' } = useParams();
  const query = usePermissions(scopeId);
  const write = useWritePermissions(scopeId);

  const [draft, setDraft] = useState<PermissionsBlock | null>(null);
  const [baseline, setBaseline] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<{ warnings: string[] } | null>(null);

  // Initialize from the query once loaded / when it changes underneath us.
  const loadedRaw = query.data ? JSON.stringify(query.data.structured ?? {}) : null;
  if (loadedRaw !== null && loadedRaw !== baseline && draft === null) {
    setDraft(JSON.parse(loadedRaw));
    setBaseline(loadedRaw);
  }

  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  const meta = query.data?.meta;

  const update = (next: PermissionsBlock) => setDraft(next);
  const addRule = (col: Col, rule: string) => {
    if (!draft || !rule.trim()) return;
    const list = draft[col] ?? [];
    if (list.includes(rule)) return;
    update({ ...draft, [col]: [...list, rule] });
  };
  const removeRule = (col: Col, rule: string) =>
    draft && update({ ...draft, [col]: (draft[col] ?? []).filter((r) => r !== rule) });
  const setDirs = (dirs: string[]) => draft && update({ ...draft, additionalDirectories: dirs });

  const doSave = async (withConfirm: boolean) => {
    if (!draft) return;
    try {
      await write.mutateAsync({ structured: draft, expectedSha256: meta?.sha256, confirm: withConfirm });
      toast.success('Permissions saved');
      const raw = JSON.stringify(draft);
      setBaseline(raw);
      setConfirm(null);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsConfirm) {
        setConfirm({ warnings: e.warnings ?? ['This change grants broad access.'] });
      } else if (e instanceof ApiClientError && e.isStale) {
        toast.error('Changed on disk — reloading');
        setDraft(null);
        void query.refetch();
      } else {
        toast.error(e instanceof Error ? e.message : 'Save failed');
      }
    }
  };

  const discard = () => {
    setDraft(JSON.parse(baseline || '{}'));
  };

  if (query.isLoading || !draft) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }

  return (
    <>
      <EditorFrame
        regKey={`${scopeId}:permissions`}
        title="Permissions"
        relPath={meta?.relPath}
        dirty={dirty}
        saving={write.isPending}
        onSave={() => doSave(false)}
        onDiscard={discard}
        headerExtra={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter rules"
              className="h-8 w-44 pl-8 text-sm"
            />
          </div>
        }
      >
        <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <RuleColumn
            col="allow"
            rules={draft.allow ?? []}
            search={search}
            onAdd={(r) => addRule('allow', r)}
            onRemove={(r) => removeRule('allow', r)}
          />
          <RuleColumn
            col="deny"
            rules={draft.deny ?? []}
            search={search}
            onAdd={(r) => addRule('deny', r)}
            onRemove={(r) => removeRule('deny', r)}
          />
        </div>
        <AdditionalDirs dirs={draft.additionalDirectories ?? []} onChange={setDirs} />
      </EditorFrame>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Grant broad access?"
        description="Review the warnings below before saving."
        confirmLabel="Save anyway"
        tone="danger"
        warnings={confirm?.warnings}
        onConfirm={() => void doSave(true)}
      />
    </>
  );
}

function RuleColumn({
  col,
  rules,
  search,
  onAdd,
  onRemove,
}: {
  col: Col;
  rules: string[];
  search: string;
  onAdd: (rule: string) => void;
  onRemove: (rule: string) => void;
}) {
  const isAllow = col === 'allow';
  const filtered = useMemo(
    () => rules.filter((r) => r.toLowerCase().includes(search.toLowerCase())),
    [rules, search],
  );
  const groups = useMemo(() => groupRulesByTool(filtered), [filtered]);

  return (
    <section className="flex min-w-0 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {isAllow ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldX className="h-4 w-4 text-danger" />}
          <h2 className={cn('font-display text-base font-semibold', isAllow ? 'text-success' : 'text-danger')}>
            {isAllow ? 'Allow' : 'Deny'}
          </h2>
          <Badge tone="neutral">{rules.length}</Badge>
        </div>
        <RuleBuilder onAdd={onAdd} col={col} />
      </header>

      <div className="flex-1 space-y-4 px-6 py-4">
        {Object.keys(groups).length === 0 && (
          <p className="py-8 text-center text-sm text-ink-subtle">
            {search ? 'No matching rules.' : `No ${col} rules yet.`}
          </p>
        )}
        {Object.entries(groups).map(([tool, parsed]) => (
          <div key={tool}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {tool}
              <span className="text-ink-subtle/70">{parsed.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parsed.map((p) => (
                <RuleChip key={p.raw} rule={p.raw} tone={col} onRemove={() => onRemove(p.raw)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RuleChip({ rule, tone, onRemove }: { rule: string; tone: Col; onRemove: () => void }) {
  return (
    <span
      className={cn(
        'group inline-flex min-h-[28px] max-w-full animate-chip-in items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[13px]',
        tone === 'allow'
          ? 'border-success/20 bg-success-soft text-success'
          : 'border-danger/20 bg-danger-soft text-danger',
        isBroadRule(rule) && 'ring-1 ring-warning/40',
      )}
    >
      <span className="break-all">{rule}</span>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-full p-0.5 opacity-50 transition-opacity hover:bg-black/5 group-hover:opacity-100"
        aria-label={`Remove ${rule}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function RuleBuilder({ col, onAdd }: { col: Col; onAdd: (rule: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState(KNOWN_PERMISSION_TOOLS[0]!.tool);
  const [pattern, setPattern] = useState('');
  const desc = KNOWN_PERMISSION_TOOLS.find((t) => t.tool === tool)!;
  const preview = formatPermissionRule({ tool, pattern: desc.patternKind === 'none' ? undefined : pattern });

  const add = () => {
    onAdd(preview);
    setPattern('');
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="h-3.5 w-3.5" /> Add rule
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="end"
          className="z-50 w-80 animate-fade-in rounded-lg border border-border bg-surface p-4 shadow-lg"
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">Tool</label>
              <div className="flex flex-wrap gap-1">
                {KNOWN_PERMISSION_TOOLS.map((t) => (
                  <button
                    key={t.tool}
                    onClick={() => setTool(t.tool)}
                    className={cn(
                      'rounded-sm px-2 py-1 font-mono text-[12px] transition-colors',
                      tool === t.tool ? 'bg-clay text-white' : 'bg-bg-subtle text-ink-muted hover:text-ink',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {desc.patternKind !== 'none' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Pattern</label>
                <Input
                  mono
                  autoFocus
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder={desc.patternHint}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 rounded-md bg-bg-subtle px-2.5 py-2">
              <code className="truncate font-mono text-[13px] text-clay">{preview}</code>
              <Button size="sm" variant="primary" onClick={add}>
                Add to {col}
              </Button>
            </div>
          </div>
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AdditionalDirs({ dirs, onChange }: { dirs: string[]; onChange: (dirs: string[]) => void }) {
  const [value, setValue] = useState('');
  if (dirs.length === 0 && value === '') {
    // Render a compact add affordance only.
  }
  const add = () => {
    if (value.trim() && !dirs.includes(value.trim())) onChange([...dirs, value.trim()]);
    setValue('');
  };
  return (
    <div className="border-t border-border bg-bg px-6 py-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        <FolderPlus className="h-3.5 w-3.5" /> Additional directories
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {dirs.map((d) => (
          <span key={d} className="group inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 font-mono text-[13px] text-ink">
            {d}
            <button onClick={() => onChange(dirs.filter((x) => x !== d))} className="opacity-50 hover:opacity-100" aria-label={`Remove ${d}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          mono
          placeholder="/path/to/dir"
          className="h-7 w-48"
        />
      </div>
    </div>
  );
}
