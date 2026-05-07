import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  profileUpdateSchema,
  logger,
  NotFoundError,
  AuthorizationError,
  ProfileUpdateInput,
} from '@movemate/shared';

const prisma = new PrismaClient();

export async function registerProfileRoutes(fastify: FastifyInstance): Promise<void> {
  // Get current user profile (GET /users/me)
  fastify.get(
    '/me',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const userId = (request.user as any)?.userId;

      if (!userId) {
        throw new AuthorizationError('Not authenticated');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          customer: true,
          trainer: true,
        },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User');
      }

      logger.info({ userId }, 'Profile fetched');

      return reply.send({
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          locale: user.locale,
          underEighteen: user.underEighteen,
          customer: user.customer,
          trainer: user.trainer,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Get user by ID (GET /users/:id)
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id } = request.params as { id: string };

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          customer: true,
          trainer: true,
        },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User');
      }

      logger.info({ userId: id }, 'User profile fetched');

      return reply.send({
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          locale: user.locale,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Update profile (PATCH /users/:id)
  fastify.patch<{ Params: { id: string }; Body: ProfileUpdateInput }>(
    '/:id',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id } = request.params as { id: string };
      const userId = (request.user as any)?.userId;

      if (userId !== id) {
        throw new AuthorizationError('Cannot update another user profile');
      }

      const input = profileUpdateSchema.parse(request.body);

      const user = await prisma.user.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          locale: input.locale,
        },
        include: {
          customer: true,
          trainer: true,
        },
      });

      logger.info({ userId: id }, 'Profile updated');

      return reply.send({
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          locale: user.locale,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );
}
