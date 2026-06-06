import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Store, Blocks, Github, Sparkles, Search, Check, ArrowDownToLine, Pencil, Lock } from 'lucide-react';
import type { Plugin, PluginRegistryEntry, Marketplace } from '@claude-hq/shared';
import {
  usePlugins,
  useTogglePlugin,
  useAddMarketplace,
  useRemoveMarketplace,
  usePluginRegistrySearch,
} from '../lib/queries';
import { Badge, Button, Card, Field, Input, Switch, Spinner, EmptyState, Tooltip } from '../components/ui';
import { PageHeader } from '../components/Editor';
import { Modal } from '../components/Dialog';
import { ApiClientError } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import { TransferButton } from '../components/TransferButton';

export function PluginsModule() {
  const { scopeId = 'global' } = useParams();
  const isGlobal = scopeId === 'global';
  const { data, isLoading } = usePlugins(scopeId);
  const toggle = useTogglePlugin(scopeId);
  const removeMkt = useRemoveMarketplace(scopeId);
  const [addOpen, setAddOpen] = useState(false);
  const [editMkt, setEditMkt] = useState<Marketplace | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const byMarketplace = (data?.plugins ?? []).reduce<Record<string, Plugin[]>>((acc, p) => {
    (acc[p.marketplace || 'other'] ??= []).push(p);
    return acc;
  }, {});

  const onToggle = async (p: Plugin, next: boolean) => {
    // `next` is the desired effective state. In a project, if it matches the global
    // state, clear the local override (track global again); otherwise set it explicitly.
    const clearsOverride = !isGlobal && next === p.enabledGlobally;
    try {
      await toggle.mutateAsync({ pluginId: p.id, enabled: clearsOverride ? null : next });
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Toggle failed');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plugins & Marketplaces"
        subtitle="Enable installed plugins and manage Marketplace sources."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBrowseOpen(true)}>
              <Sparkles className="h-4 w-4" /> Browse Marketplaces
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Marketplace
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
                  {plugins.map((p) => {
                    const inheritedGlobal = !isGlobal && !p.localOverride && p.enabledGlobally;
                    const overriddenOff = !isGlobal && p.localOverride && !p.enabled && p.enabledGlobally;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono text-sm text-ink">{p.name}</span>
                            {inheritedGlobal && (
                              <Tooltip content="Enabled in your global config — active in every project. Toggle off to disable it just here.">
                                <span><Badge tone="neutral">global</Badge></span>
                              </Tooltip>
                            )}
                            {overriddenOff && (
                              <Tooltip content="Enabled globally, but disabled for this project. Toggle on to follow the global setting again.">
                                <span><Badge tone="warning">off here</Badge></span>
                              </Tooltip>
                            )}
                          </div>
                          {p.installs[0]?.version && <div className="text-[11px] text-ink-subtle">v{p.installs[0].version}</div>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TransferButton type="plugins" label={p.name} identity={{ pluginId: p.id }} fromScopeId={scopeId} />
                          <Switch checked={p.enabled} onCheckedChange={(next) => onToggle(p, next)} />
                        </div>
                      </div>
                    );
                  })}
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
                    {m.editable ? <Badge tone="clay">custom</Badge> : <Badge tone="neutral">Claude Code</Badge>}
                  </div>
                  {(m.source as any)?.repo && (
                    <div className="flex items-center gap-1 font-mono text-[11px] text-ink-subtle">
                      <Github className="h-3 w-3" /> {(m.source as any).repo}
                    </div>
                  )}
                </div>
                {m.editable ? (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setEditMkt(m)}
                      className="rounded-sm p-1.5 text-ink-subtle hover:bg-clay-soft hover:text-clay"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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
                  </div>
                ) : (
                  <Tooltip content="Installed and managed by Claude Code. Add or remove it with the Claude Code CLI.">
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-subtle">
                      <Lock className="h-3 w-3" /> managed
                    </span>
                  </Tooltip>
                )}
              </div>
            ))}
            {(data?.marketplaces.length ?? 0) === 0 && !isLoading && (
              <div className="px-4 py-6 text-center text-sm text-ink-subtle">No Marketplaces.</div>
            )}
          </Card>
        </section>
      </div>

      <MarketplaceModal scopeId={scopeId} open={addOpen} onOpenChange={setAddOpen} />
      {editMkt && (
        <MarketplaceModal
          key={editMkt.name}
          scopeId={scopeId}
          edit={editMkt}
          open
          onOpenChange={(o) => !o && setEditMkt(null)}
        />
      )}
      <PluginBrowseModal scopeId={scopeId} open={browseOpen} onOpenChange={setBrowseOpen} />
    </div>
  );
}

function MarketplaceModal({
  scopeId,
  open,
  onOpenChange,
  edit,
}: {
  scopeId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  edit?: Marketplace;
}) {
  const add = useAddMarketplace(scopeId);
  const removeMkt = useRemoveMarketplace(scopeId);
  const [name, setName] = useState(edit?.name ?? '');
  const [repo, setRepo] = useState(((edit?.source as any)?.repo as string) ?? '');

  const submit = async () => {
    const newName = name.trim();
    try {
      // Renaming a custom marketplace: drop the old key, then write the new one.
      if (edit && edit.name !== newName) await removeMkt.mutateAsync(edit.name);
      await add.mutateAsync({ name: newName, repo: repo.trim() });
      toast.success(edit ? 'Marketplace updated' : 'Marketplace added');
      onOpenChange(false);
      if (!edit) {
        setName('');
        setRepo('');
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : edit ? 'Failed to update' : 'Failed to add');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit Marketplace' : 'Add Marketplace'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={add.isPending || removeMkt.isPending} disabled={!name.trim() || !repo.trim()} onClick={submit}>
            {edit ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" hint="A short id for the Marketplace.">
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
      title="Browse plugin Marketplaces"
      description="Search popular Claude Code Marketplaces and enable a plugin in a click."
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins — e.g. commit, review, security, docker" className="h-10 pl-9" />
        </div>

        {data?.unavailable && data.unavailable.length > 0 && (
          <div className="text-[11px] text-ink-subtle">Some Marketplaces couldn’t be reached: {data.unavailable.join(', ')}</div>
        )}

        <div className="min-h-[18rem] space-y-2">
          {isFetching && results.length === 0 && <div className="flex justify-center py-12"><Spinner /></div>}
          {!isFetching && results.length === 0 && (
            <p className="py-12 text-center text-sm text-ink-subtle">
              {debounced ? 'No matching plugins.' : 'Type to search across popular Marketplaces.'}
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
