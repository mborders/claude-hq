import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Globe, Plus, Search, FolderGit2 } from 'lucide-react';
import type { ProjectRef } from '@ccm/shared';
import { useScopes, useAddProject } from '../lib/queries';
import { useUi } from '../lib/stores';
import { cn } from '../lib/cn';
import { Button, Field, Input, Spinner, Tooltip } from '../components/ui';
import { Modal } from '../components/Dialog';
import { ApiClientError } from '../lib/api';

export function ScopeSidebar() {
  const { data, isLoading } = useScopes();
  const { scopeId } = useParams();
  const navigate = useNavigate();
  const { scopeFilter, setScopeFilter } = useUi();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const projects = useMemo(() => {
    let list = data?.projects ?? [];
    if (scopeFilter === 'configured') list = list.filter((p) => p.hasClaudeDir);
    if (scopeFilter === 'unconfigured') list = list.filter((p) => !p.hasClaudeDir);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
    }
    return list;
  }, [data, scopeFilter, search]);

  const go = (id: string) => navigate(`/scope/${id}/overview`);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-clay text-white shadow-sm">
          <span className="font-display text-sm font-semibold">C</span>
        </div>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold text-ink">Claude Control</div>
          <div className="text-[11px] text-ink-subtle">manager</div>
        </div>
      </div>

      <div className="px-3 py-2">
        <button
          onClick={() => go('global')}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
            scopeId === 'global' ? 'bg-clay-soft text-clay' : 'text-ink hover:bg-surface-2',
          )}
        >
          <Globe className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Global</div>
            <div className="truncate font-mono text-[11px] text-ink-subtle">~/.claude</div>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Projects</span>
        <Tooltip content="Add a directory">
          <button
            onClick={() => setAddOpen(true)}
            className="rounded p-0.5 text-ink-subtle hover:bg-surface-2 hover:text-clay focus-ring"
            aria-label="Add directory"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter projects"
            className="h-8 w-full rounded-sm border border-border bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay-ring/40"
          />
        </div>
        <div className="mt-2 flex gap-1">
          {(['all', 'configured', 'unconfigured'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setScopeFilter(f)}
              className={cn(
                'flex-1 rounded-sm px-1.5 py-1 text-[11px] font-medium capitalize transition-colors',
                scopeFilter === f ? 'bg-surface text-clay shadow-sm' : 'text-ink-subtle hover:text-ink',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {projects.map((p) => (
          <ScopeItem key={p.id} project={p} active={p.id === scopeId} onClick={() => go(p.id)} />
        ))}
        {!isLoading && projects.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-ink-subtle">No projects match.</p>
        )}
      </div>

      <AddDirectoryModal open={addOpen} onOpenChange={setAddOpen} />
    </aside>
  );
}

function ScopeItem({ project, active, onClick }: { project: ProjectRef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors',
        active ? 'bg-clay-soft' : 'hover:bg-surface-2',
      )}
      title={project.path}
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          project.hasClaudeDir ? 'bg-clay' : 'border border-border-strong',
        )}
      />
      <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'text-clay' : project.hasClaudeDir ? 'text-ink' : 'text-ink-subtle')}>
        {project.name}
      </span>
      {project.configuredModules ? (
        <span className="tabular text-[11px] text-ink-subtle">{project.configuredModules}</span>
      ) : null}
    </button>
  );
}

function AddDirectoryModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddProject();
  const navigate = useNavigate();

  const submit = async () => {
    setError(null);
    try {
      const ref = await add.mutateAsync(path.trim());
      onOpenChange(false);
      setPath('');
      navigate(`/scope/${ref.id}/overview`);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Failed to add directory');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add a directory"
      description="Point at any project folder inside the mounted roots."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} onClick={submit} disabled={!path.trim()}>
            <FolderGit2 className="h-4 w-4" /> Add project
          </Button>
        </>
      }
    >
      <Field label="Absolute path" hint="e.g. /Users/you/Documents/GitHub/my-app" error={error ?? undefined}>
        <Input mono value={path} onChange={(e) => setPath(e.target.value)} placeholder="/path/to/project" autoFocus />
      </Field>
    </Modal>
  );
}
