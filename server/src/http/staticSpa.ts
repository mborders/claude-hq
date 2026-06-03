import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { ServerEnv } from '../env';

/**
 * Serve the built SPA (web/dist) with history-fallback so client-side routes
 * resolve to index.html. In dev the API runs API-only (Vite serves the UI),
 * so a missing web/dist is expected and non-fatal.
 */
export async function registerStaticSpa(app: FastifyInstance, env: ServerEnv): Promise<void> {
  const indexHtml = path.join(env.webDistDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    app.log.warn(
      { webDistDir: env.webDistDir },
      'web/dist not found — serving API only (expected in dev; Vite serves the UI)',
    );
    return;
  }

  await app.register(fastifyStatic, { root: env.webDistDir, wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    // Unknown /api routes are genuine 404s; everything else is an SPA route.
    if (req.url.startsWith('/api')) {
      void reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }
    void reply.sendFile('index.html');
  });
}
