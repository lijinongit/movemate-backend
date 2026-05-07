/**
 * OTP Verification Integration Tests
 * Tests POST /verify-otp endpoint:
 * - Verify OTP happy path
 * - Wrong OTP rejected
 * - Expired OTP rejected
 * - Rate-limit: 5+ attempts → 429
 */

import { PrismaClient } from '@prisma/client';
import fastify from 'fastify';
import { registerOtpRoutes } from '../../src/routes/otp';

jest.mock('@prisma/client');

describe('OTP Verification (Integration)', () => {
  let app: any;
  let mockPrisma: any;

  beforeEach(async () => {
    const { PrismaClient: MockedPrismaClient } = require('@prisma/client');
    mockPrisma = new MockedPrismaClient();

    app = fastify();

    // Mock JWT plugin
    app.jwt = {
      sign: jest.fn((payload, opts) => 'mock-jwt-token'),
    };

    await registerOtpRoutes(app);
  });

  describe('POST /verify-otp - Happy Path', () => {
    it('should verify correct OTP and issue tokens', async () => {
      const userId = 'user-123';
      const correctOTP = '123456';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
        underEighteen: false,
        parentGuardianId: null,
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-123',
        code: otpHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes in future
      });

      mockPrisma.otpRequest.delete.mockResolvedValueOnce({});
      mockPrisma.user.update.mockResolvedValueOnce({
        id: userId,
        status: 'verified',
        underEighteen: false,
      });

      mockPrisma.session.create.mockResolvedValueOnce({
        userId,
        refreshTokenHash: 'hash',
        expiresAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: {
          userId,
          code: correctOTP,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.userId).toBe(userId);
      expect(data.data.status).toBe('verified');
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();
    });

    it('should update status to verified for adult user', async () => {
      const userId = 'adult-user';
      const correctOTP = '111111';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'adult@example.com',
        underEighteen: false,
        parentGuardianId: null,
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-456',
        code: otpHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      mockPrisma.otpRequest.delete.mockResolvedValueOnce({});
      mockPrisma.user.update.mockResolvedValueOnce({
        id: userId,
        status: 'verified',
      });
      mockPrisma.session.create.mockResolvedValueOnce({});

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: correctOTP },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: expect.objectContaining({
            status: 'verified',
          }),
        }),
      );
    });

    it('should update status to pending_parent_consent for under-18 without parent', async () => {
      const userId = 'child-user';
      const correctOTP = '222222';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'child@example.com',
        underEighteen: true,
        parentGuardianId: null,
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-789',
        code: otpHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      mockPrisma.otpRequest.delete.mockResolvedValueOnce({});
      mockPrisma.user.update.mockResolvedValueOnce({
        id: userId,
        status: 'pending_parent_consent',
      });
      mockPrisma.session.create.mockResolvedValueOnce({});

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: correctOTP },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'pending_parent_consent',
          }),
        }),
      );
    });
  });

  describe('POST /verify-otp - Wrong OTP (400)', () => {
    it('should reject incorrect OTP code', async () => {
      const userId = 'user-123';
      const correctOTP = '123456';
      const wrongOTP = '654321';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-123',
        code: otpHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      mockPrisma.otpRequest.update.mockResolvedValueOnce({
        attempts: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: wrongOTP },
      });

      expect(response.statusCode).toBe(400);
      expect(mockPrisma.otpRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempts: 1,
          }),
        }),
      );
    });

    it('should increment attempts counter on wrong OTP', async () => {
      const userId = 'user-123';
      const correctOTP = '123456';
      const wrongOTP = '000000';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-123',
        code: otpHash,
        attempts: 3, // Already 3 failed attempts
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      mockPrisma.otpRequest.update.mockResolvedValueOnce({
        attempts: 4,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: wrongOTP },
      });

      expect(response.statusCode).toBe(400);
      expect(mockPrisma.otpRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { attempts: 4 },
        }),
      );
    });
  });

  describe('POST /verify-otp - Expired OTP (400)', () => {
    it('should reject expired OTP', async () => {
      const userId = 'user-123';
      const expiredOTP = '123456';

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
      });

      // Mock: no valid OTP found (expired)
      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: expiredOTP },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /verify-otp - Rate Limit (429)', () => {
    it('should lock account after 10 failed attempts', async () => {
      const userId = 'user-123';
      const correctOTP = '123456';
      const wrongOTP = '000000';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-123',
        code: otpHash,
        attempts: 10, // Already maxed out
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: userId,
        status: 'locked',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: wrongOTP },
      });

      expect(response.statusCode).toBe(429);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'locked' },
        }),
      );
    });

    it('should prevent verification after 10+ attempts', async () => {
      const userId = 'user-123';
      const correctOTP = '123456';
      const otpHash = require('crypto')
        .createHash('sha256')
        .update(correctOTP)
        .digest('hex');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
      });

      mockPrisma.otpRequest.findFirst.mockResolvedValueOnce({
        id: 'otp-123',
        code: otpHash,
        attempts: 12, // Over limit
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: userId,
        status: 'locked',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/verify-otp',
        payload: { userId, code: correctOTP },
      });

      expect(response.statusCode).toBe(429);
    });
  });
});
