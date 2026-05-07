import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

/**
 * Middleware to add X-Request-ID to all requests and responses
 * Used for request tracing and debugging
 */
export async function setupRequestIdMiddleware(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    (request as any).requestId = requestId;
    reply.header('X-Request-ID', requestId);
  });
}

/**
 * Add request ID to context for logging
 */
export function getRequestId(request: FastifyRequest): string {
  return (request as any).requestId || 'unknown';
}
