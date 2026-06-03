import type { AppContext } from '../context';
import { ScopeService } from './scopeService';
import { SettingsService } from './settingsService';
import { ArtifactService } from './artifactService';
import { MemoryService } from './memoryService';
import { McpService } from './mcpService';
import { PluginsService } from './pluginsService';

export interface Services {
  scopes: ScopeService;
  settings: SettingsService;
  artifacts: ArtifactService;
  memory: MemoryService;
  mcp: McpService;
  plugins: PluginsService;
}

export function createServices(ctx: AppContext): Services {
  const settings = new SettingsService(ctx);
  return {
    scopes: new ScopeService(ctx),
    settings,
    artifacts: new ArtifactService(ctx),
    memory: new MemoryService(ctx),
    mcp: new McpService(ctx),
    plugins: new PluginsService(ctx, settings),
  };
}
