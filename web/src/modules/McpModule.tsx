import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Plug, Pencil, Eye, EyeOff, Sparkles, Search, ArrowDownToLine, CheckSquare } from 'lucide-react';
import type { McpServer, McpRegistryEntry, McpInstall } from '@ccm/shared';
import { useMcp, useUpsertMcp, useDeleteMcp, useMcpRegistrySearch } from '../lib/queries';
import { useDebounce } from '../hooks/useDebounce';
import { ApiClientError } from '../lib/api';
import { Badge, Button, Card, Field, Input, Switch, Spinner, EmptyState, SegmentedControl } from '../components/ui';
import { PageHeader } from '../components/Editor';
import { Modal, ConfirmDialog } from '../components/Dialog';
import { KeyValueEditor } from '../components/KeyValueEditor';
import { TransferButton, BulkTransferDialog } from '../components/TransferButton';
import { useMultiSelect, BulkActionBar, RowCheckbox } from '../components/MultiSelect';
import { cn } from '../lib/cn';

type Prefill = { id: string } & McpInstall;

export function McpModule() {
  const { scopeId = 'global' } = useParams();
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useMcp(scopeId, reveal);
  const del = useDeleteMcp(scopeId);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [adding, setAdding] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const servers = data?.servers ?? [];
  const sel = useMultiSelect();
  const [bulkOpen, setBulkOpen] = useState(false);

  const closeServerModal = () => {
    setAdding(false);
    setEditing(null);
    setPrefill(null);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="MCP servers"
        subtitle="Model Context Protocol servers available in this scope."
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              {reveal ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Reveal secrets
              <Switch checked={reveal} onCheckedChange={setReveal} />
            </label>
            {servers.length > 0 && !sel.selecting && (
              <Button variant="ghost" onClick={sel.start}>
                <CheckSquare className="h-4 w-4" /> Select
              </Button>
            )}
            <Button variant="secondary" onClick={() => setRegistryOpen(true)}>
              <Sparkles className="h-4 w-4" /> Browse registry
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add server
            </Button>
          </div>
        }
      />
      <div className="px-6 py-6">
        {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
        {!isLoading && (data?.servers.length ?? 0) === 0 && (
          <EmptyState
            icon={<Plug className="h-8 w-8" />}
            title="No MCP servers"
            description="Browse the registry to add one in a click, or add a stdio command / HTTP endpoint by hand."
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setRegistryOpen(true)}><Sparkles className="h-4 w-4" /> Browse registry</Button>
                <Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add server</Button>
              </div>
            }
          />
        )}
        {sel.selecting && (
          <div className="mb-3">
            <BulkActionBar
              count={sel.selected.size}
              allSelected={servers.length > 0 && sel.selected.size === servers.length}
              onToggleAll={() => sel.selectAll(servers.map((s) => s.id))}
              onAction={() => setBulkOpen(true)}
              onClear={sel.clear}
            />
          </div>
        )}
        <div className="space-y-2">
          {servers.map((s) => {
            const checked = sel.selected.has(s.id);
            const meta = (
              <>
                {sel.selecting && <RowCheckbox checked={checked} />}
                <Plug className="h-4 w-4 shrink-0 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm text-ink">{s.id}</span>
                    <Badge tone={s.transport === 'stdio' ? 'info' : 'clay'}>{s.transport}</Badge>
                  </div>
                  <div className="truncate font-mono text-[11px] text-ink-subtle">
                    {s.transport === 'stdio' ? `${s.command} ${(s.args ?? []).join(' ')}` : s.url}
                  </div>
                </div>
              </>
            );
            return sel.selecting ? (
              <button
                key={s.id}
                onClick={() => sel.toggle(s.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all',
                  checked ? 'border-clay bg-clay-soft/40' : 'border-border hover:border-border-strong',
                )}
              >
                {meta}
              </button>
            ) : (
              <Card key={s.id} className="flex items-center gap-3 px-4 py-3">
                {meta}
                <TransferButton type="mcp" label={s.id} identity={{ id: s.id }} fromScopeId={scopeId} />
                <button onClick={() => setEditing(s)} className="rounded-sm p-1.5 text-ink-subtle hover:bg-clay-soft hover:text-clay" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setConfirmDel(s.id)} className="rounded-sm p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </Card>
            );
          })}
        </div>
      </div>

      {bulkOpen && (
        <BulkTransferDialog
          type="mcp"
          label="server"
          fromScopeId={scopeId}
          items={[...sel.selected].map((id) => ({ id }))}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            sel.clear();
          }}
        />
      )}

      {(adding || editing || prefill) && (
        <McpServerModal
          key={editing?.id ?? prefill?.id ?? 'new'}
          scopeId={scopeId}
          server={editing}
          prefill={prefill}
          open
          onOpenChange={(o) => !o && closeServerModal()}
        />
      )}

      <McpRegistrySearchModal
        open={registryOpen}
        onOpenChange={setRegistryOpen}
        onPick={(entry) => {
          if (!entry.install) return;
          setRegistryOpen(false);
          setPrefill({ id: entry.id, ...entry.install });
        }}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="Delete MCP server?"
        description={`Remove "${confirmDel}" from .mcp.json. A backup is kept.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          try {
            await del.mutateAsync(confirmDel!);
            toast.success('Server removed');
          } catch (e) {
            toast.error(e instanceof ApiClientError ? e.message : 'Delete failed');
          }
        }}
      />
    </div>
  );
}

function McpServerModal({
  scopeId,
  server,
  prefill,
  open,
  onOpenChange,
}: {
  scopeId: string;
  server: McpServer | null;
  prefill?: Prefill | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const upsert = useUpsertMcp(scopeId);
  const isEdit = !!server;
  const init = (server ?? prefill ?? null) as (McpServer | Prefill) | null;
  const initAny = init as any;
  const [id, setId] = useState(init?.id ?? '');
  const [transport, setTransport] = useState<'stdio' | 'http'>(init?.transport === 'stdio' ? 'stdio' : 'http');
  const [command, setCommand] = useState(init?.transport === 'stdio' ? initAny.command ?? '' : '');
  const [argsText, setArgsText] = useState(init?.transport === 'stdio' ? (initAny.args ?? []).join(' ') : '');
  const [url, setUrl] = useState(init && init.transport !== 'stdio' ? initAny.url ?? '' : '');
  const [headers, setHeaders] = useState<Record<string, string>>(init && init.transport !== 'stdio' ? initAny.headers ?? {} : {});
  const [env, setEnv] = useState<Record<string, string>>(init?.transport === 'stdio' ? initAny.env ?? {} : {});

  const save = async () => {
    const body =
      transport === 'stdio'
        ? { command, ...(argsText.trim() ? { args: argsText.trim().split(/\s+/) } : {}), ...(Object.keys(env).length ? { env } : {}) }
        : { type: 'http', url, ...(Object.keys(headers).length ? { headers } : {}) };
    try {
      await upsert.mutateAsync({ id: id.trim(), server: body, create: !isEdit });
      toast.success('Server saved');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiClientError && e.isValidation) toast.error(e.issues?.map((i) => i.message).join('; ') ?? 'Invalid');
      else toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isEdit ? `Edit ${server.id}` : prefill ? `Add ${prefill.id}` : 'Add MCP server'}
      description={prefill ? 'Pre-filled from the registry — review, fill any secrets, then save.' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={upsert.isPending} disabled={!id.trim()} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Server id">
          <Input mono value={id} onChange={(e) => setId(e.target.value)} placeholder="my-server" disabled={isEdit} />
        </Field>
        <Field label="Transport">
          <SegmentedControl value={transport} onChange={setTransport} options={[{ value: 'stdio', label: 'stdio (command)' }, { value: 'http', label: 'HTTP / SSE' }]} />
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label="Command"><Input mono value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" /></Field>
            <Field label="Arguments" hint="space-separated"><Input mono value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder="-y @scope/server" /></Field>
            <Field label="Environment" hint="Fill in any required/secret values.">
              <KeyValueEditor value={env} onChange={setEnv} masked />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL"><Input mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" /></Field>
            <Field label="Headers" hint="e.g. Authorization: Bearer ${TOKEN}"><KeyValueEditor value={headers} onChange={setHeaders} masked /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function McpRegistrySearchModal({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (entry: McpRegistryEntry) => void;
}) {
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const { data, isFetching } = useMcpRegistrySearch(debounced);
  const results = data?.results ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Browse the MCP registry"
      description="Search the Model Context Protocol registry and add a server in a click."
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search servers — e.g. github, postgres, filesystem, linear" className="h-10 pl-9" />
        </div>

        {data?.error && (
          <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">{data.error}</div>
        )}

        <div className="min-h-[18rem] space-y-2">
          {isFetching && results.length === 0 && <div className="flex justify-center py-12"><Spinner /></div>}
          {!isFetching && results.length === 0 && (
            <p className="py-12 text-center text-sm text-ink-subtle">
              {debounced ? 'No matching servers.' : 'Type to search the registry.'}
            </p>
          )}
          {results.map((entry) => (
            <RegistryResult key={`${entry.name}@${entry.version}`} entry={entry} onPick={() => onPick(entry)} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function RegistryResult({ entry, onPick }: { entry: McpRegistryEntry; onPick: () => void }) {
  const inst = entry.install;
  const summary = inst
    ? inst.transport === 'stdio'
      ? `${inst.command} ${(inst.args ?? []).join(' ')}`.trim()
      : inst.url
    : '';
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:border-border-strong">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm text-ink">{entry.id}</span>
          {inst && <Badge tone={inst.transport === 'stdio' ? 'info' : 'clay'}>{inst.transport}</Badge>}
          {entry.version && <span className="tabular text-[11px] text-ink-subtle">v{entry.version}</span>}
        </div>
        {entry.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{entry.description}</p>}
        {summary && <div className="mt-1 truncate font-mono text-[11px] text-ink-subtle">{summary}</div>}
        {inst?.requiredKeys && inst.requiredKeys.length > 0 && (
          <div className="mt-1 text-[11px] text-ink-subtle">needs: {inst.requiredKeys.join(', ')}</div>
        )}
      </div>
      <Button size="sm" variant="secondary" onClick={onPick} className="shrink-0">
        <ArrowDownToLine className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
