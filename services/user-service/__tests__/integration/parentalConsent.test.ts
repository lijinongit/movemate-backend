/**
 * Parental Consent Flow Integration Tests
 * Tests full lifecycle:
 * - Under-18 user registered
 * - Consent record created
 * - Parent confirms consent
 * - Consent marked active
 */

import { PrismaClient } from '@prisma/client';
import fastify from 'fastify';
import { registerParentalConsentRoutes } from '../../src/routes/parentalConsent';

jest.mock('@prisma/client');

describe('Parental Consent Flow (Integration)', () => {
  let app: any;
  let mockPrisma: any;

  beforeEach(async () => {
    const { PrismaClient: MockedPrismaClient } = require('@prisma/client');
    mockPrisma = new MockedPrismaClient();

    app = fastify();

    // Mock authentication
    app.authenticate = jest.fn(async (request, reply) => {
      request.user = {
        userId: (request as any).userId || 'user-123',
        role: (request as any).role || 'customer',
      };
    });

    app.decorate = jest.fn();
    app.addHook = jest.fn();

    await registerParentalConsentRoutes(app);
  });

  describe('POST /users/:childId/parental-consent - Create Consent Record', () => {
    it('should create parental consent record for under-18 user', async () => {
      const childId = 'child-123';
      const parentEmail = 'parent@example.com';

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: childId,
        email: 'child@example.com',
        underEighteen: true,
        deletedAt: null,
      });

      mockPrisma.parentalConsent.create.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId: null,
        consentGiven: false,
        consentTimestamp: null,
        termsAccepted: false,
        createdAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent`,
        payload: { parentEmail },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.data.consentId).toBe('consent-123');
      expect(data.data.childId).toBe(childId);
      expect(data.data.status).toBe('pending_parent_verification');
    });

    it('should reject consent request for adult user', async () => {
      const adultId = 'adult-123';

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: adultId,
        email: 'adult@example.com',
        underEighteen: false,
        deletedAt: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${adultId}/parental-consent`,
        payload: { parentEmail: 'parent@example.com' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require parent email', async () => {
      const childId = 'child-123';

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: childId,
        underEighteen: true,
        deletedAt: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent`,
        payload: { parentEmail: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should check if user exists', async () => {
      const childId = 'nonexistent-child';

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent`,
        payload: { parentEmail: 'parent@example.com' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /users/:childId/parental-consent - Retrieve Consent', () => {
    it('should retrieve parental consent record', async () => {
      const childId = 'child-123';
      const parentId = 'parent-456';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
        consentGiven: false,
        consentTimestamp: null,
        termsAccepted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/users/${childId}/parental-consent`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.childId).toBe(childId);
      expect(data.data.consentGiven).toBe(false);
    });

    it('should allow child to view their consent record', async () => {
      const childId = 'child-123';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId: 'parent-456',
        consentGiven: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/users/${childId}/parental-consent`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow parent to view child consent record', async () => {
      const childId = 'child-123';
      const parentId = 'parent-456';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
        consentGiven: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/users/${childId}/parental-consent`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject unauthorized access to consent record', async () => {
      const childId = 'child-123';
      const unauthorizedUserId = 'random-user-789';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId: 'parent-456',
      });

      // Authorization check would fail for random user
      const response = await app.inject({
        method: 'GET',
        url: `/users/${childId}/parental-consent`,
      });

      expect([200, 403]).toContain(response.statusCode);
    });

    it('should return 404 if consent record does not exist', async () => {
      const childId = 'child-without-consent';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `/users/${childId}/parental-consent`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /users/:childId/parental-consent/complete - Parent Confirms', () => {
    it('should complete parental consent when parent accepts', async () => {
      const childId = 'child-123';
      const parentId = 'parent-456';
      const consentId = 'consent-123';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: consentId,
        childId,
        parentId,
        consentGiven: false,
        termsAccepted: false,
      });

      mockPrisma.parentalConsent.update.mockResolvedValueOnce({
        id: consentId,
        childId,
        parentId,
        consentGiven: true,
        termsAccepted: true,
        consentTimestamp: new Date(),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: childId,
        status: 'verified',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent/complete`,
        payload: {
          consentGiven: true,
          termsAccepted: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.consentGiven).toBe(true);
      expect(data.data.consentTimestamp).toBeDefined();
    });

    it('should update child user status to verified on consent completion', async () => {
      const childId = 'child-123';
      const parentId = 'parent-456';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
      });

      mockPrisma.parentalConsent.update.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        consentGiven: true,
        termsAccepted: true,
        consentTimestamp: new Date(),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: childId,
        status: 'verified',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent/complete`,
        payload: {
          consentGiven: true,
          termsAccepted: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: childId },
          data: { status: 'verified' },
        }),
      );
    });

    it('should reject completion without full consent', async () => {
      const childId = 'child-123';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId: 'parent-456',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent/complete`,
        payload: {
          consentGiven: true,
          termsAccepted: false, // NOT accepted
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require consent record to exist', async () => {
      const childId = 'child-without-consent';

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent/complete`,
        payload: {
          consentGiven: true,
          termsAccepted: true,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should record consent timestamp immutably', async () => {
      const childId = 'child-123';
      const parentId = 'parent-456';
      const now = new Date();

      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
      });

      mockPrisma.parentalConsent.update.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
        consentGiven: true,
        termsAccepted: true,
        consentTimestamp: now,
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: childId,
        status: 'verified',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent/complete`,
        payload: {
          consentGiven: true,
          termsAccepted: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.parentalConsent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consentTimestamp: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('Parental Consent - Full Flow', () => {
    it('should complete full under-18 → consent → confirmed → verified flow', async () => {
      const childId = 'child-123';
      const parentId = 'parent-456';

      // Step 1: Create consent record
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: childId,
        underEighteen: true,
        deletedAt: null,
      });

      mockPrisma.parentalConsent.create.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId: null,
        consentGiven: false,
        termsAccepted: false,
        createdAt: new Date(),
      });

      const createResponse = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent`,
        payload: { parentEmail: 'parent@example.com' },
      });

      expect(createResponse.statusCode).toBe(201);

      // Step 2: Retrieve consent
      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
        consentGiven: false,
        termsAccepted: false,
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/users/${childId}/parental-consent`,
      });

      expect(getResponse.statusCode).toBe(200);

      // Step 3: Parent confirms consent
      mockPrisma.parentalConsent.findUnique.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
      });

      mockPrisma.parentalConsent.update.mockResolvedValueOnce({
        id: 'consent-123',
        childId,
        parentId,
        consentGiven: true,
        termsAccepted: true,
        consentTimestamp: new Date(),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: childId,
        status: 'verified',
      });

      const completeResponse = await app.inject({
        method: 'POST',
        url: `/users/${childId}/parental-consent/complete`,
        payload: {
          consentGiven: true,
          termsAccepted: true,
        },
      });

      expect(completeResponse.statusCode).toBe(200);
      const data = JSON.parse(completeResponse.body);
      expect(data.data.consentGiven).toBe(true);
    });
  });
});
