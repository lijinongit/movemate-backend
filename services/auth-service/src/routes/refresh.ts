import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  refreshTokenSchema,
  ValidationError,
  AuthenticationError,
  logger,
  RefreshTokenInput,
} from '@movemate/shared';
import { config } from '../config';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

export async function registerRefreshRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RefreshTokenInput }>(
    '/refresh-token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();

      const input = refreshTokenSchema.parse(request.body);

      // Verify refresh token
      let decoded: any;
      try {
        decoded = fastify.jwt.verify(input.refreshToken);
      } catch (err) {
        throw new AuthenticationError('Invalid refresh token');
      }

      const userId = decoded.userId;

      // Check if token exists and is valid
      const refreshTokenHash = createHash('sha256')
        .update(input.refreshToken)
        .digest('hex');

      const session = await prisma.session.findUnique({
        where: { refreshTokenHash: refreshTokenHash },
      });

      if (!session || session.revokedAt) {
        // Token hijacking detected
        logger.warn({ userId }, 'Token hijacking attempt detected');

        // Revoke all sessions for this user
        await prisma.session.updateMany({
          where: { userId },
          data: { revokedAt: new Date() },
        });

        throw new AuthenticationError('Token has been revoked; please log in again');
      }

      if (session.expiresAt < new Date()) {
        throw new AuthenticationError('Refresh token expired');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || user.deletedAt) {
        throw new AuthenticationError('User not found');
      }

      // Invalidate old refresh token
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      // Issue new tokens
      const newAccessToken = fastify.jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        { expiresIn: config.jwtAccessTokenExpiresIn },
      );

      const newRefreshToken = fastify.jwt.sign(
        {
          userId: user.id,
        },
        { expiresIn: config.jwtRefreshTokenExpiresIn },
      );

      // Store new refresh token
      const newRefreshTokenHash = createHash('sha256')
        .update(newRefreshToken)
        .digest('hex');

      await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: newRefreshTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: request.ip,
          deviceId: request.headers['user-agent'],
        },
      });

      logger.info({ userId }, 'Token refreshed');

      return reply.send({
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );
}
