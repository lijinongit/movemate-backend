import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { config } from './config';
import { logger, createHttpLogger } from '@movemate/shared/utils/logger';
import { setupErrorHandler, setupRequestIdMiddleware, setupAuthGuard } from '@movemate/shared';
import { registerAuthRoutes } from './routes';

export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: createHttpLogger(),
    trustProxy: true,
  });

  // Register middleware
  await setupRequestIdMiddleware(fastify);

  // Register CORS
  await fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGINS || '*',
    credentials: true,
  });

  // Register JWT
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Setup authentication guard (must be after JWT registration)
  await setupAuthGuard(fastify);

  // Register error handler
  await setupErrorHandler(fastify);

  // Register health check
  fastify.get('/healthz', async (request, reply) => {
    return reply.send({ status: 'ok', service: 'auth-service' });
  });

  // Register auth routes
  await registerAuthRoutes(fastify);

  return fastify;
}

export async function startServer(fastify: FastifyInstance): Promise<void> {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    logger.info(`Auth service listening on ${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received; gracefully shutting down');
    await fastify.close();
    process.exit(0);
  });
}
