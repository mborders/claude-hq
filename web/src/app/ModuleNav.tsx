import { NavLink, useParams } from 'react-router-dom';
import {
  useArtifacts,
  useMcp,
  useScopes,
  useHooks,
  usePlugins,
  useMemoryList,
  usePermissions,
} from '../lib/queries';
import { MODULES } from './modules';
import { cn } from '../lib/cn';

function useCounts(scopeId: string) {
  const agents = useArtifacts(scopeId, 'agents');
  const commands = useArtifacts(scopeId, 'commands');
  const skills = useArtifacts(scopeId, 'skills');
  const mcp = useMcp(scopeId);
  const hooks = useHooks(scopeId);
  const plugins = usePlugins(scopeId);
  const memory = useMemoryList(scopeId);
  const permissions = usePermissions(scopeId);
  const perms = permissions.data?.structured;
  return {
    agents: agents.data?.items.length,
    commands: commands.data?.items.length,
    skills: skills.data?.items.length,
    mcp: mcp.data?.servers.length,
    hooks: hooks.data?.rows.length,
    // active (effective-enabled) plugins in this scope
    plugins: plugins.data?.plugins.filter((p) => p.enabled).length,
    memory: memory.data?.docs.length,
    permissions: perms
      ? (perms.allow?.length ?? 0) + (perms.deny?.length ?? 0) + (perms.ask?.length ?? 0)
      : undefined,
  } as Record<string, number | undefined>;
}

export function ModuleNav() {
  const { scopeId = 'global' } = useParams();
  const { data } = useScopes();
  const counts = useCounts(scopeId);

  const kind = scopeId === 'global' ? 'global' : 'project';
  const projectName =
    kind === 'project' ? data?.projects.find((p) => p.id === scopeId)?.name ?? 'Project' : 'Global';

  return (
    <nav className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-bg px-2.5 py-3">
      <div className="px-2.5 pb-2">
        <div className="truncate font-display text-sm font-semibold text-ink" title={projectName}>
          {projectName}
        </div>
        <div className="text-[11px] text-ink-subtle">{kind === 'global' ? 'User configuration' : 'Project configuration'}</div>
      </div>
      <div className="mt-1 space-y-0.5">
        {MODULES.filter((m) => m.scopes.includes(kind)).map((m) => {
          const Icon = m.icon;
          const count = counts[m.id];
          return (
            <NavLink
              key={m.id}
              to={`/scope/${scopeId}/${m.path}`}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                  isActive ? 'bg-clay-soft font-medium text-clay' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-clay" />}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{m.label}</span>
                  {typeof count === 'number' && count > 0 && (
                    <span className="tabular text-[11px] text-ink-subtle">{count}</span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
