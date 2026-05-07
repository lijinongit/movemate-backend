import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { config } from './config';
import { logger, createHttpLogger } from '@movemate/shared/utils/logger';
import { setupErrorHandler, setupRequestIdMiddleware } from '@movemate/shared';
import { registerUserRoutes } from './routes';

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

  // Register error handler
  await setupErrorHandler(fastify);

  // Health check
  fastify.get('/healthz', async (request, reply) => {
    return reply.send({ status: 'ok', service: 'user-service' });
  });

  // Register user routes
  await registerUserRoutes(fastify);

  return fastify;
}

export async function startServer(fastify: FastifyInstance): Promise<void> {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    logger.info(`User service listening on ${config.host}:${config.port}`);
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
