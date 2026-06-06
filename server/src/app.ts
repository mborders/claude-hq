import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerEnv } from './env';
import { createContext } from './context';
import { healthRoutes } from './routes/health';
import { apiRoutes } from './routes/api';
import { registryRoutes } from './routes/registry';
import { registerStaticSpa } from './http/staticSpa';
import { registerErrorHandler } from './http/errorHandler';

export interface AppDeps {
  env: ServerEnv;
}

/**
 * Build the Fastify app. Pure of process side effects (no listen) so tests can
 * drive it with `app.inject(...)`. Routes are registered as factories that
 * close over `env`.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;

  const app = Fastify({
    logger: env.nodeEnv === 'test' || env.logLevel === 'silent' ? false : { level: env.logLevel },
    bodyLimit: 12 * 1024 * 1024, // 12 MB — CLAUDE.md can be large; .skill imports arrive base64-inlined
    trustProxy: true,
    // Project scope ids are `project:<base64url(absolute path)>` and embed in the
    // URL as the :scopeId route param. find-my-way's default maxParamLength of 100
    // makes the router silently 404 any real project path (base64url of a deep or
    // /private/var temp path easily exceeds it). Allow enough for PATH_MAX (4096
    // bytes -> ~5460 base64url chars) plus the prefix.
    maxParamLength: 8192,
  });

  if (env.nodeEnv === 'development') {
    const cors = (await import('@fastify/cors')).default;
    await app.register(cors, { origin: true });
  }

  registerErrorHandler(app);

  const ctx = createContext(env);

  // API routes under /api.
  await app.register(healthRoutes(env), { prefix: '/api' });
  await app.register(registryRoutes(ctx), { prefix: '/api' });
  await app.register(apiRoutes(ctx), { prefix: '/api' });

  // Static SPA last so its catch-all not-found handler doesn't shadow /api.
  await registerStaticSpa(app, env);

  return app;
}
