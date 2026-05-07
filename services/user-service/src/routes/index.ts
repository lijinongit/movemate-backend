import { FastifyInstance } from 'fastify';
import { registerProfileRoutes } from './profile';
import { registerDocumentRoutes } from './documents';
import { registerParentalConsentRoutes } from './parentalConsent';

export async function registerUserRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(registerProfileRoutes, { prefix: '/users' });
  await fastify.register(registerDocumentRoutes, { prefix: '/users' });
  await fastify.register(registerParentalConsentRoutes, { prefix: '/users' });
}
