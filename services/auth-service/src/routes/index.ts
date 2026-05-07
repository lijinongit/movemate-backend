import { FastifyInstance } from 'fastify';
import { registerRegisterRoutes } from './register';
import { registerLoginRoutes } from './login';
import { registerOtpRoutes } from './otp';
import { registerRefreshRoutes } from './refresh';
import { registerLogoutRoutes } from './logout';

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(registerRegisterRoutes, { prefix: '/auth' });
  await fastify.register(registerLoginRoutes, { prefix: '/auth' });
  await fastify.register(registerOtpRoutes, { prefix: '/auth' });
  await fastify.register(registerRefreshRoutes, { prefix: '/auth' });
  await fastify.register(registerLogoutRoutes, { prefix: '/auth' });
}
