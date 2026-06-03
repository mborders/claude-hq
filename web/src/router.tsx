import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { OverviewModule } from './modules/OverviewModule';
import { PermissionsModule } from './modules/PermissionsModule';
import { SettingsModule } from './modules/SettingsModule';
import { MemoryModule } from './modules/MemoryModule';
import { ArtifactModule } from './modules/ArtifactModule';
import { McpModule } from './modules/McpModule';
import { HooksModule } from './modules/HooksModule';
import { PluginsModule } from './modules/PluginsModule';

function ScopeIndexRedirect() {
  const { scopeId } = useParams();
  return <Navigate to={`/scope/${scopeId}/overview`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/scope/global/overview" replace /> },
      {
        path: 'scope/:scopeId',
        children: [
          { index: true, element: <ScopeIndexRedirect /> },
          { path: 'overview', element: <OverviewModule /> },
          { path: 'settings', element: <SettingsModule /> },
          { path: 'permissions', element: <PermissionsModule /> },
          { path: 'memory', element: <MemoryModule /> },
          { path: 'agents', element: <ArtifactModule type="agents" /> },
          { path: 'agents/new', element: <ArtifactModule type="agents" create /> },
          { path: 'agents/:name', element: <ArtifactModule type="agents" /> },
          { path: 'commands', element: <ArtifactModule type="commands" /> },
          { path: 'commands/new', element: <ArtifactModule type="commands" create /> },
          { path: 'commands/:name', element: <ArtifactModule type="commands" /> },
          { path: 'skills', element: <ArtifactModule type="skills" /> },
          { path: 'skills/new', element: <ArtifactModule type="skills" create /> },
          { path: 'skills/:name', element: <ArtifactModule type="skills" /> },
          { path: 'mcp', element: <McpModule /> },
          { path: 'hooks', element: <HooksModule /> },
          { path: 'plugins', element: <PluginsModule /> },
        ],
      },
    ],
  },
]);
