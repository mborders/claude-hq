import type { FastifyInstance } from 'fastify';
import type { ApiError } from '@claude-hq/shared';
import { isAppError } from './appError';

/** Map thrown errors to the uniform ApiError body + status code. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (isAppError(err)) {
      const body: ApiError = { error: err.message, code: err.code };
      if (err.issues) body.issues = err.issues;
      if (err.warnings) body.warnings = err.warnings;
      if (err.current !== undefined) body.current = err.current;
      void reply.code(err.status).send(body);
      return;
    }

    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413) {
      void reply.code(413).send({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' } satisfies ApiError);
      return;
    }
    if (status === 400) {
      void reply.code(400).send({ error: (err as Error).message, code: 'BAD_REQUEST' } satisfies ApiError);
      return;
    }

    req.log.error(err);
    void reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL' } satisfies ApiError);
  });
}
