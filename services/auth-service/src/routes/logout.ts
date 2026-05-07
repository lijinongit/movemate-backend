import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { logger, verifyAuth } from '@movemate/shared';

const prisma = new PrismaClient();

export async function registerLogoutRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/logout',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();

      const userId = (request.user as any)?.userId;

      if (!userId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
          meta: { request_id: requestId, timestamp },
        });
      }

      // Get the refresh token from Authorization header and revoke it
      const authHeader = request.headers.authorization;
      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const crypto = require('crypto');
          const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

          // Fixed: Prisma updateMany expects single object with where and data
          await prisma.session.updateMany({
            where: {
              userId: userId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        } catch (err) {
          logger.warn({ userId }, 'Error revoking sessions');
        }
      }

      logger.info({ userId }, 'User logged out');

      return reply.send({
        data: { message: 'Logged out successfully' },
        meta: { request_id: requestId, timestamp },
      });
    },
  );
}
