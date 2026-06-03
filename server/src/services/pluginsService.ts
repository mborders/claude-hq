import path from 'node:path';
import type {
  PluginsResponse,
  Plugin,
  Marketplace,
  BlocklistEntry,
  PluginInstallEntry,
} from '@ccm/shared';
import { readText } from '../fs/safeFs';
import { type ResolvedScope } from '../domain/paths';
import type { AppContext } from '../context';
import type { SettingsService } from './settingsService';

function readJson(absPath: string): any | null {
  const r = readText(absPath);
  if (!r) return null;
  try {
    return JSON.parse(r.content);
  } catch {
    return null;
  }
}

export class PluginsService {
  constructor(
    private readonly ctx: AppContext,
    private readonly settings: SettingsService,
  ) {}

  getPlugins(scope: ResolvedScope): PluginsResponse {
    // enabled map + editable marketplaces come from this scope's settings file.
    const effective = this.settings.getSettings(scope).effective;
    const enabled = effective.enabledPlugins ?? {};
    const extra = effective.extraKnownMarketplaces ?? {};

    // installs + known marketplaces + blocklist live in the global plugins dir.
    const pluginsDir = path.join(this.ctx.env.claudeHomeDir, 'plugins');
    const installedRaw = readJson(path.join(pluginsDir, 'installed_plugins.json'));
    const knownRaw = readJson(path.join(pluginsDir, 'known_marketplaces.json'));
    const blocklistRaw = readJson(path.join(pluginsDir, 'blocklist.json'));

    const installsById: Record<string, PluginInstallEntry[]> =
      installedRaw && typeof installedRaw === 'object' ? installedRaw.plugins ?? {} : {};

    const ids = new Set<string>([...Object.keys(enabled), ...Object.keys(installsById)]);
    const plugins: Plugin[] = [...ids].map((id) => {
      const [name, marketplace] = splitPluginId(id);
      return {
        id,
        name,
        marketplace,
        enabled: enabled[id] ?? false,
        installs: installsById[id] ?? [],
      };
    });
    plugins.sort((a, b) => a.id.localeCompare(b.id));

    const marketplaces: Marketplace[] = [];
    if (knownRaw && typeof knownRaw === 'object') {
      for (const [name, m] of Object.entries<any>(knownRaw)) {
        marketplaces.push({
          name,
          source: m?.source ?? {},
          installLocation: m?.installLocation,
          lastUpdated: m?.lastUpdated,
          editable: false,
        });
      }
    }
    for (const [name, m] of Object.entries<any>(extra)) {
      if (marketplaces.some((x) => x.name === name)) continue;
      marketplaces.push({ name, source: (m as any)?.source ?? {}, editable: true });
    }
    marketplaces.sort((a, b) => a.name.localeCompare(b.name));

    const blocklist: BlocklistEntry[] = Array.isArray(blocklistRaw)
      ? blocklistRaw
      : Array.isArray(blocklistRaw?.plugins)
        ? blocklistRaw.plugins
        : [];

    return { plugins, marketplaces, blocklist };
  }
}

function splitPluginId(id: string): [string, string] {
  const at = id.lastIndexOf('@');
  return at === -1 ? [id, ''] : [id.slice(0, at), id.slice(at + 1)];
}
