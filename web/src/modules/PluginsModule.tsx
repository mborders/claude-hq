import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Store, Blocks, Github, Sparkles, Search, Check, ArrowDownToLine } from 'lucide-react';
import type { Plugin, PluginRegistryEntry } from '@ccm/shared';
import {
  usePlugins,
  useTogglePlugin,
  useAddMarketplace,
  useRemoveMarketplace,
  usePluginRegistrySearch,
} from '../lib/queries';
import { Badge, Button, Card, Field, Input, Switch, Spinner, EmptyState } from '../components/ui';
import { PageHeader } from '../components/Editor';
import { Modal } from '../components/Dialog';
import { ApiClientError } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';

export function PluginsModule() {
  const { scopeId = 'global' } = useParams();
  const { data, isLoading } = usePlugins(scopeId);
  const toggle = useTogglePlugin(scopeId);
  const removeMkt = useRemoveMarketplace(scopeId);
  const [addOpen, setAddOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const byMarketplace = (data?.plugins ?? []).reduce<Record<string, Plugin[]>>((acc, p) => {
    (acc[p.marketplace || 'other'] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plugins & marketplaces"
        subtitle="Enable installed plugins and manage marketplace sources."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBrowseOpen(true)}>
              <Sparkles className="h-4 w-4" /> Browse marketplaces
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add marketplace
            </Button>
          </div>
        }
      />
      <div className="space-y-8 px-6 py-6">
        {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <Blocks className="h-4 w-4 text-ink-subtle" /> Plugins
          </h2>
          {!isLoading && (data?.plugins.length ?? 0) === 0 && (
            <EmptyState icon={<Blocks className="h-7 w-7" />} title="No plugins" description="Plugins installed via Claude Code appear here to enable/disable." />
          )}
          <div className="space-y-4">
            {Object.entries(byMarketplace).map(([mkt, plugins]) => (
              <div key={mkt}>
                <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-subtle">{mkt}</div>
                <Card className="divide-y divide-border">
                  {plugins.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm text-ink">{p.name}</div>
                        {p.installs[0]?.version && <div className="text-[11px] text-ink-subtle">v{p.installs[0].version}</div>}
                      </div>
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={async (enabled) => {
                          try {
                            await toggle.mutateAsync({ pluginId: p.id, enabled });
                          } catch (e) {
                            toast.error(e instanceof ApiClientError ? e.message : 'Toggle failed');
                          }
                        }}
                      />
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <Store className="h-4 w-4 text-ink-subtle" /> Marketplaces
          </h2>
          <Card className="divide-y divide-border">
            {(data?.marketplaces ?? []).map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                    {m.editable && <Badge tone="clay">custom</Badge>}
                  </div>
                  {(m.source as any)?.repo && (
                    <div className="flex items-center gap-1 font-mono text-[11px] text-ink-subtle">
                      <Github className="h-3 w-3" /> {(m.source as any).repo}
                    </div>
                  )}
                </div>
                {m.editable && (
                  <button
                    onClick={async () => {
                      try {
                        await removeMkt.mutateAsync(m.name);
                        toast.success('Marketplace removed');
                      } catch (e) {
                        toast.error(e instanceof ApiClientError ? e.message : 'Remove failed');
                      }
                    }}
                    className="rounded-sm p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {(data?.marketplaces.length ?? 0) === 0 && !isLoading && (
              <div className="px-4 py-6 text-center text-sm text-ink-subtle">No marketplaces.</div>
            )}
          </Card>
        </section>
      </div>

      <AddMarketplaceModal scopeId={scopeId} open={addOpen} onOpenChange={setAddOpen} />
      <PluginBrowseModal scopeId={scopeId} open={browseOpen} onOpenChange={setBrowseOpen} />
    </div>
  );
}

function AddMarketplaceModal({ scopeId, open, onOpenChange }: { scopeId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useAddMarketplace(scopeId);
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');

  const submit = async () => {
    try {
      await add.mutateAsync({ name: name.trim(), repo: repo.trim() });
      toast.success('Marketplace added');
      onOpenChange(false);
      setName('');
      setRepo('');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add marketplace"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={add.isPending} disabled={!name.trim() || !repo.trim()} onClick={submit}>Add</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" hint="A short id for the marketplace.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-marketplace" autoFocus />
        </Field>
        <Field label="GitHub repo" hint="owner/repo">
          <Input mono value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="anthropics/claude-plugins" />
        </Field>
      </div>
    </Modal>
  );
}

function PluginBrowseModal({ scopeId, open, onOpenChange }: { scopeId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const { data, isFetching } = usePluginRegistrySearch(debounced);
  const addMkt = useAddMarketplace(scopeId);
  const toggle = useTogglePlugin(scopeId);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const results = data?.results ?? [];

  const add = async (entry: PluginRegistryEntry) => {
    setBusy(entry.pluginId);
    try {
      if (!entry.alreadyKnown) await addMkt.mutateAsync({ name: entry.marketplace, repo: entry.repo });
      await toggle.mutateAsync({ pluginId: entry.pluginId, enabled: true });
      setAdded((s) => new Set(s).add(entry.pluginId));
      toast.success(`Enabled ${entry.name}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Browse plugin marketplaces"
      description="Search popular Claude Code marketplaces and enable a plugin in a click."
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins — e.g. commit, review, security, docker" className="h-10 pl-9" />
        </div>

        {data?.unavailable && data.unavailable.length > 0 && (
          <div className="text-[11px] text-ink-subtle">Some marketplaces couldn’t be reached: {data.unavailable.join(', ')}</div>
        )}

        <div className="min-h-[18rem] space-y-2">
          {isFetching && results.length === 0 && <div className="flex justify-center py-12"><Spinner /></div>}
          {!isFetching && results.length === 0 && (
            <p className="py-12 text-center text-sm text-ink-subtle">
              {debounced ? 'No matching plugins.' : 'Type to search across popular marketplaces.'}
            </p>
          )}
          {results.map((entry) => {
            const done = added.has(entry.pluginId);
            return (
              <div key={entry.pluginId} className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:border-border-strong">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-ink">{entry.name}</span>
                    <Badge tone="neutral">{entry.marketplace}</Badge>
                    {entry.alreadyKnown ? <Badge tone="success">known</Badge> : <Badge tone="clay">new</Badge>}
                    {entry.category && <span className="text-[11px] text-ink-subtle">{entry.category}</span>}
                  </div>
                  {entry.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{entry.description}</p>}
                  <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-ink-subtle">
                    <Github className="h-3 w-3" /> {entry.repo}
                  </div>
                </div>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> Added</span>
                ) : (
                  <Button size="sm" variant="secondary" loading={busy === entry.pluginId} onClick={() => add(entry)} className="shrink-0">
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
