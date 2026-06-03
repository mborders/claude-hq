import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../context';
import { RegistryService } from '../services/registryService';

/** Scope-independent discovery: search MCP registries + plugin marketplaces. */
export function registryRoutes(ctx: AppContext): FastifyPluginAsync {
  const svc = new RegistryService(ctx);
  return async (app) => {
    app.get('/registry/mcp', async (req) => {
      const q = (req.query as Record<string, unknown>).q;
      return svc.searchMcp(typeof q === 'string' ? q : '');
    });
    app.get('/registry/plugins', async (req) => {
      const q = (req.query as Record<string, unknown>).q;
      return svc.searchPlugins(typeof q === 'string' ? q : '');
    });
  };
}
