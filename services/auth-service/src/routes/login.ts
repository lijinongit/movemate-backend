import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  userLoginSchema,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  logger,
  verifyPassword,
  UserLoginInput,
} from '@movemate/shared';
import { config } from '../config';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

interface LoginResponse {
  data: {
    userId: string;
    email: string;
    status: string;
    accessToken: string;
    refreshToken: string;
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export async function registerLoginRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: UserLoginInput }>(
    '/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();

      const input = userLoginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User');
      }

      // Check if user is locked
      if (user.status === 'locked') {
        throw new AuthenticationError('Account locked; please reset your password');
      }

      // Verify password
      const isPasswordValid = await verifyPassword(input.password, user.passwordHash || '');

      if (!isPasswordValid) {
        logger.warn({ userId: user.id }, 'Failed login attempt');
        throw new AuthenticationError('Invalid email or password');
      }

      // Issue JWT tokens
      const accessToken = fastify.jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        { expiresIn: config.jwtAccessTokenExpiresIn },
      );

      const refreshToken = fastify.jwt.sign(
        {
          userId: user.id,
        },
        { expiresIn: config.jwtRefreshTokenExpiresIn },
      );

      // Store refresh token
      const refreshTokenHash = createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: refreshTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: request.ip,
          deviceId: request.headers['user-agent'],
        },
      });

      logger.info({ userId: user.id }, 'User logged in');

      // Normalize response shape: tokens nested under data
      const response: LoginResponse = {
        data: {
          userId: user.id,
          email: user.email,
          status: user.status,
          accessToken,
          refreshToken,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      };

      return reply.send(response);
    },
  );
}
