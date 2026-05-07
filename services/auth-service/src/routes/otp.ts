import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  otpVerifySchema,
  ValidationError,
  NotFoundError,
  RateLimitError,
  logger,
  verifyOTP,
  generateOTP,
  hashOTP,
  getOTPExpiry,
  OtpVerifyInput,
} from '@movemate/shared';
import { config } from '../config';

const prisma = new PrismaClient();

interface OtpVerifyResponse {
  data: {
    userId: string;
    status: string;
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export async function registerOtpRoutes(fastify: FastifyInstance): Promise<void> {
  // Send OTP
  fastify.post<{ Body: { email: string } }>(
    '/send-otp',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();

      const { email } = request.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Check rate limit: max 5 OTP requests per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentOtps = await prisma.otpRequest.count({
        where: {
          userId: user.id,
          createdAt: { gte: oneHourAgo },
        },
      });

      if (recentOtps >= config.otpMaxAttemptsPerHour) {
        throw new RateLimitError('Too many OTP requests; please try again later');
      }

      // Check if recent OTP exists (idempotent)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentOtp = await prisma.otpRequest.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: fiveMinutesAgo },
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentOtp) {
        // Return same OTP (idempotent)
        logger.info({ userId: user.id }, 'OTP re-requested (idempotent)');
        return reply.status(200).send({
          data: { message: 'OTP sent' },
          meta: { request_id: requestId, timestamp },
        });
      }

      // Generate new OTP
      const otpCode = generateOTP();
      const otpHash = hashOTP(otpCode);

      await prisma.otpRequest.create({
        data: {
          userId: user.id,
          email: email,
          code: otpHash,
          expiresAt: getOTPExpiry(),
        },
      });

      logger.info({ userId: user.id }, 'OTP sent');

      return reply.status(200).send({
        data: { message: 'OTP sent to your email' },
        meta: { request_id: requestId, timestamp },
      });
    },
  );

  // Verify OTP
  fastify.post<{ Body: OtpVerifyInput }>(
    '/verify-otp',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();

      const input = otpVerifySchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Find valid OTP
      const otp = await prisma.otpRequest.findFirst({
        where: {
          userId: input.userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otp) {
        throw new ValidationError('OTP expired or not found');
      }

      // Check attempts
      if (otp.attempts >= 10) {
        // Lock account
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'locked' },
        });

        throw new RateLimitError(
          'Too many failed OTP attempts; please reset your password via email',
        );
      }

      // Verify OTP
      const isValid = verifyOTP(input.code, otp.code);

      if (!isValid) {
        await prisma.otpRequest.update({
          where: { id: otp.id },
          data: { attempts: otp.attempts + 1 },
        });

        throw new ValidationError('Invalid OTP code');
      }

      // Mark OTP as used
      await prisma.otpRequest.delete({
        where: { id: otp.id },
      });

      // Update user status
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          status:
            user.underEighteen && !user.parentGuardianId
              ? 'pending_parent_consent'
              : 'verified',
        },
      });

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

      // Store refresh token hash
      const refreshTokenHash = require('crypto')
        .createHash('sha256')
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

      logger.info({ userId: user.id }, 'OTP verified; user authenticated');

      const response: OtpVerifyResponse = {
        data: {
          userId: user.id,
          status: updatedUser.status,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      };

      return reply.send({
        ...response,
        accessToken,
        refreshToken,
      });
    },
  );
}
