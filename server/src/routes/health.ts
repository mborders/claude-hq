import type { FastifyPluginAsync } from 'fastify';
import { APP_VERSION } from '@claude-hq/shared';
import type { ServerEnv } from '../env';

/** GET /api/health — used by the Docker healthcheck and the UI ownership warning. */
export function healthRoutes(env: ServerEnv): FastifyPluginAsync {
  return async (app) => {
    app.get('/health', async () => ({
      ok: true,
      version: APP_VERSION,
      claudeHome: env.claudeHomeDir,
      projectsRoots: env.projectsRoots,
      appDataDir: env.appDataDir,
      readOnly: env.readOnly,
      uid: typeof process.getuid === 'function' ? process.getuid() : null,
      gid: typeof process.getgid === 'function' ? process.getgid() : null,
    }));
  };
}
