import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Store, Blocks, Github } from 'lucide-react';
import type { Plugin } from '@ccm/shared';
import { usePlugins, useTogglePlugin, useAddMarketplace, useRemoveMarketplace } from '../lib/queries';
import { Badge, Button, Card, Field, Input, Switch, Spinner, EmptyState } from '../components/ui';
import { PageHeader } from '../components/Editor';
import { Modal } from '../components/Dialog';
import { ApiClientError } from '../lib/api';

export function PluginsModule() {
  const { scopeId = 'global' } = useParams();
  const { data, isLoading } = usePlugins(scopeId);
  const toggle = useTogglePlugin(scopeId);
  const removeMkt = useRemoveMarketplace(scopeId);
  const [addOpen, setAddOpen] = useState(false);

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
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add marketplace
          </Button>
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
