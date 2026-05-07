/**
 * User Registration Integration Tests
 * Tests POST /auth/register endpoint with various scenarios:
 * - Customer registration (happy path)
 * - Trainer registration (happy path)
 * - Under-18 returns 202 with parental consent flag
 * - Invalid email returns 400
 * - Duplicate email returns 409
 */

import { PrismaClient } from '@prisma/client';
import fastify from 'fastify';
import { registerRegisterRoutes } from '../../src/routes/register';

jest.mock('@prisma/client');
jest.mock('@movemate/shared/adapters', () => ({
  getEmailAdapter: jest.fn(() => ({
    sendOTP: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('User Registration (Integration)', () => {
  let app: any;
  let mockPrisma: any;

  beforeEach(async () => {
    // Get mocked Prisma
    const { PrismaClient: MockedPrismaClient } = require('@prisma/client');
    mockPrisma = new MockedPrismaClient();

    // Setup Fastify app
    app = fastify();

    // Mock JWT plugin
    app.register = jest.fn(async (plugin, opts) => {
      if (plugin.name === 'fastify-jwt') {
        app.jwt = {
          sign: jest.fn((payload, opts) => 'mock-jwt-token'),
        };
      }
    });

    await registerRegisterRoutes(app);
  });

  describe('POST /register - Customer Happy Path', () => {
    it('should register a customer with valid email', async () => {
      const input = {
        email: 'customer@example.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(null); // No existing user
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'user-123',
        email: input.email,
        status: 'pending_email_verification',
        underEighteen: false,
      });
      mockPrisma.customer.create.mockResolvedValueOnce({ userId: 'user-123' });
      mockPrisma.otpRequest.create.mockResolvedValueOnce({
        id: 'otp-123',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.data.userId).toBe('user-123');
      expect(data.data.email).toBe(input.email);
      expect(data.data.status).toBe('pending_email_verification');
      expect(data.data.underEighteen).toBe(false);
    });

    it('should generate and send OTP on registration', async () => {
      const input = {
        email: 'customer@example.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'user-123',
        email: input.email,
        status: 'pending_email_verification',
        underEighteen: false,
      });
      mockPrisma.customer.create.mockResolvedValueOnce({ userId: 'user-123' });
      mockPrisma.otpRequest.create.mockResolvedValueOnce({ id: 'otp-123' });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(201);
      expect(mockPrisma.otpRequest.create).toHaveBeenCalled();
    });
  });

  describe('POST /register - Trainer Happy Path', () => {
    it('should register a trainer with valid credentials', async () => {
      const input = {
        email: 'trainer@example.com',
        phone: '971501234567',
        firstName: 'Ahmed',
        lastName: 'Al-Mansouri',
        dob: '1985-03-10',
        password: 'SecurePass123!',
        role: 'trainer',
        locale: 'en',
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'trainer-123',
        email: input.email,
        status: 'pending_email_verification',
        underEighteen: false,
      });
      mockPrisma.trainer.create.mockResolvedValueOnce({ userId: 'trainer-123' });
      mockPrisma.otpRequest.create.mockResolvedValueOnce({ id: 'otp-123' });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.data.userId).toBe('trainer-123');
    });
  });

  describe('POST /register - Under-18 User', () => {
    it('should register under-18 user with pending_parent_consent status', async () => {
      const input = {
        email: 'child@example.com',
        phone: '971509999999',
        firstName: 'Zainab',
        lastName: 'Ahmad',
        dob: '2010-06-15', // 14 years old
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'child-123',
        email: input.email,
        status: 'pending_parent_consent',
        underEighteen: true,
      });
      mockPrisma.customer.create.mockResolvedValueOnce({ userId: 'child-123' });
      mockPrisma.otpRequest.create.mockResolvedValueOnce({ id: 'otp-123' });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.data.underEighteen).toBe(true);
      expect(data.data.status).toBe('pending_parent_consent');
    });
  });

  describe('POST /register - Invalid Email (400)', () => {
    it('should reject invalid email format', async () => {
      const input = {
        email: 'notanemail',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject email without @ symbol', async () => {
      const input = {
        email: 'customerexample.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /register - Duplicate Email (409)', () => {
    it('should reject duplicate email registration', async () => {
      const input = {
        email: 'existing@example.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      // Mock: user already exists
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'existing-user',
        email: input.email,
        deletedAt: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(409);
      const data = JSON.parse(response.body);
      expect(data.error).toBeDefined();
    });

    it('should allow re-registration of soft-deleted user', async () => {
      const input = {
        email: 'deleted@example.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'SecurePass123!',
        role: 'customer',
        locale: 'en',
      };

      // Mock: user exists but is soft-deleted
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'deleted-user',
        email: input.email,
        deletedAt: new Date('2026-01-01'),
      });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'new-user-123',
        email: input.email,
        status: 'pending_email_verification',
        underEighteen: false,
      });
      mockPrisma.customer.create.mockResolvedValueOnce({ userId: 'new-user-123' });
      mockPrisma.otpRequest.create.mockResolvedValueOnce({ id: 'otp-123' });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('POST /register - Weak Password (400)', () => {
    it('should reject password that is too short', async () => {
      const input = {
        email: 'customer@example.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'Short1!',
        role: 'customer',
        locale: 'en',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject password without uppercase letter', async () => {
      const input = {
        email: 'customer@example.com',
        phone: '971501234567',
        firstName: 'Ali',
        lastName: 'Ahmad',
        dob: '1990-05-15',
        password: 'securepass123!',
        role: 'customer',
        locale: 'en',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: input,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
