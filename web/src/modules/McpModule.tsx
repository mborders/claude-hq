import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Plug, Pencil, Eye, EyeOff } from 'lucide-react';
import type { McpServer } from '@ccm/shared';
import { useMcp, useUpsertMcp, useDeleteMcp } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Badge, Button, Card, Field, Input, Switch, Spinner, EmptyState, SegmentedControl } from '../components/ui';
import { PageHeader } from '../components/Editor';
import { Modal, ConfirmDialog } from '../components/Dialog';
import { KeyValueEditor } from '../components/KeyValueEditor';

export function McpModule() {
  const { scopeId = 'global' } = useParams();
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useMcp(scopeId, reveal);
  const del = useDeleteMcp(scopeId);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

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
            description="Add a stdio command or an HTTP endpoint to expose MCP tools."
            action={<Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add server</Button>}
          />
        )}
        <div className="space-y-2">
          {data?.servers.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 px-4 py-3">
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
              <button onClick={() => setEditing(s)} className="rounded-sm p-1.5 text-ink-subtle hover:bg-clay-soft hover:text-clay" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => setConfirmDel(s.id)} className="rounded-sm p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </Card>
          ))}
        </div>
      </div>

      {(adding || editing) && (
        <McpServerModal
          scopeId={scopeId}
          server={editing}
          open
          onOpenChange={(o) => {
            if (!o) {
              setAdding(false);
              setEditing(null);
            }
          }}
        />
      )}

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

function McpServerModal({ scopeId, server, open, onOpenChange }: { scopeId: string; server: McpServer | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const upsert = useUpsertMcp(scopeId);
  const isEdit = !!server;
  const [id, setId] = useState(server?.id ?? '');
  const [transport, setTransport] = useState<'stdio' | 'http'>(server?.transport === 'stdio' ? 'stdio' : 'http');
  const [command, setCommand] = useState(server && server.transport === 'stdio' ? server.command : '');
  const [argsText, setArgsText] = useState(server && server.transport === 'stdio' ? (server.args ?? []).join(' ') : '');
  const [url, setUrl] = useState(server && server.transport !== 'stdio' ? server.url : '');
  const [headers, setHeaders] = useState<Record<string, string>>(server && server.transport !== 'stdio' ? server.headers ?? {} : {});
  const [env, setEnv] = useState<Record<string, string>>(server && server.transport === 'stdio' ? server.env ?? {} : {});

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
      title={isEdit ? `Edit ${server.id}` : 'Add MCP server'}
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
            <Field label="Environment"><KeyValueEditor value={env} onChange={setEnv} masked /></Field>
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
