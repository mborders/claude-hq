import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FolderPlus, Activity, DollarSign, MessageSquare } from 'lucide-react';
import { useScopes, useArtifacts, useMcp, useRuntime, useInitScope } from '../lib/queries';
import { MODULES } from '../app/modules';
import { Button, Card, Badge, Spinner } from '../components/ui';
import { PageHeader, PathChip } from '../components/Editor';
import { cn } from '../lib/cn';

export function OverviewModule() {
  const { scopeId = 'global' } = useParams();
  const navigate = useNavigate();
  const scopes = useScopes();
  const isGlobal = scopeId === 'global';

  const project = !isGlobal ? scopes.data?.projects.find((p) => p.id === scopeId) : undefined;
  const rootPath = isGlobal ? scopes.data?.global.rootPath : project?.path;
  const hasClaude = isGlobal ? scopes.data?.global.exists : project?.hasClaudeDir;
  const label = isGlobal ? 'Global' : project?.name ?? 'Project';

  const agents = useArtifacts(scopeId, 'agents');
  const commands = useArtifacts(scopeId, 'commands');
  const skills = useArtifacts(scopeId, 'skills');
  const mcp = useMcp(scopeId);
  const runtime = useRuntime(scopeId);
  const init = useInitScope();

  const counts: Record<string, number | undefined> = {
    agents: agents.data?.items.length,
    commands: commands.data?.items.length,
    skills: skills.data?.items.length,
    mcp: mcp.data?.servers.length,
  };

  if (scopes.isLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={label}
        subtitle={isGlobal ? 'Your user-level Claude configuration.' : 'Project-level Claude configuration.'}
        actions={rootPath ? <PathChip path={rootPath} /> : undefined}
      />

      <div className="space-y-6 px-6 py-6">
        {!hasClaude && !isGlobal && (
          <Card className="flex items-center justify-between gap-4 border-clay/30 bg-clay-soft/50 p-5">
            <div>
              <h3 className="font-display text-lg text-ink">No <code className="font-mono text-sm">.claude/</code> yet</h3>
              <p className="mt-0.5 text-sm text-ink-muted">Initialize a config directory to start managing this project.</p>
            </div>
            <Button
              variant="primary"
              loading={init.isPending}
              onClick={async () => {
                try {
                  await init.mutateAsync(scopeId);
                  toast.success('Initialized .claude/');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed');
                }
              }}
            >
              <FolderPlus className="h-4 w-4" /> Initialize
            </Button>
          </Card>
        )}

        {isGlobal && runtime.data && (
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={<MessageSquare className="h-4 w-4" />} label="Sessions" value={runtime.data.sessionsCount ?? 0} />
            <Stat icon={<Activity className="h-4 w-4" />} label="Projects tracked" value={runtime.data.projectsTracked ?? 0} />
            <Stat
              icon={<DollarSign className="h-4 w-4" />}
              label="Total cost"
              value={runtime.data.totalCostUsd != null ? `$${runtime.data.totalCostUsd.toFixed(2)}` : '—'}
            />
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Configuration</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MODULES.filter((m) => m.id !== 'overview').map((m) => {
              const Icon = m.icon;
              const count = counts[m.id];
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/scope/${scopeId}/${m.path}`)}
                  className={cn(
                    'group flex flex-col items-start gap-2 rounded-md border border-border bg-surface p-4 text-left transition-all',
                    'hover:-translate-y-px hover:border-border-strong hover:shadow-sm',
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-clay-soft text-clay">
                      <Icon className="h-4 w-4" />
                    </span>
                    {typeof count === 'number' && <Badge tone="neutral">{count}</Badge>}
                  </div>
                  <span className="text-sm font-medium text-ink">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
        {icon} {label}
      </div>
      <div className="mt-1 font-display text-2xl text-ink tabular">{value}</div>
    </Card>
  );
}
