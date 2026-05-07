import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  logger,
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from '@movemate/shared';

const prisma = new PrismaClient();

export async function registerParentalConsentRoutes(fastify: FastifyInstance): Promise<void> {
  // Create/request parental consent (POST /users/:childId/parental-consent)
  fastify.post<{ Params: { id: string }; Body: { parentEmail: string } }>(
    '/:id/parental-consent',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id: childId } = request.params as { id: string };
      const userId = (request.user as any)?.userId;
      const { parentEmail } = request.body;

      if (!parentEmail) {
        throw new ValidationError('Parent email required');
      }

      // Only child (if under 18) or admin can request consent
      const user = await prisma.user.findUnique({
        where: { id: childId },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User');
      }

      if (userId !== childId && (request.user as any)?.role !== 'platform_admin') {
        throw new AuthorizationError('Unauthorized');
      }

      if (!user.underEighteen) {
        throw new ValidationError('User is not under 18; parental consent not needed');
      }

      // Create consent record
      const consent = await prisma.parentalConsent.create({
        data: {
          childId,
          // Parent ID will be set once parent verifies
        },
      });

      // TODO: Send consent request email to parent
      logger.info({ childId, parentEmail }, 'Parental consent requested');

      return reply.status(201).send({
        data: {
          consentId: consent.id,
          childId: consent.childId,
          status: 'pending_parent_verification',
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Get parental consent (GET /users/:childId/parental-consent)
  fastify.get<{ Params: { id: string } }>(
    '/:id/parental-consent',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id: childId } = request.params as { id: string };
      const userId = (request.user as any)?.userId;
      const role = (request.user as any)?.role;

      const consent = await prisma.parentalConsent.findUnique({
        where: { childId },
      });

      if (!consent) {
        throw new NotFoundError('Parental consent record');
      }

      // Only child, parent, or admin can view
      if (
        userId !== childId &&
        userId !== consent.parentId &&
        role !== 'platform_admin'
      ) {
        throw new AuthorizationError('Unauthorized');
      }

      logger.info({ childId }, 'Parental consent retrieved');

      return reply.send({
        data: {
          id: consent.id,
          childId: consent.childId,
          parentId: consent.parentId,
          consentGiven: consent.consentGiven,
          consentTimestamp: consent.consentTimestamp,
          termsAccepted: consent.termsAccepted,
          createdAt: consent.createdAt,
          updatedAt: consent.updatedAt,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Complete parental consent (POST /users/:childId/parental-consent/complete)
  fastify.post<{
    Params: { id: string };
    Body: { consentGiven: boolean; termsAccepted: boolean };
  }>(
    '/:id/parental-consent/complete',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id: childId } = request.params as { id: string };
      const parentId = (request.user as any)?.userId;
      const { consentGiven, termsAccepted } = request.body;

      const consent = await prisma.parentalConsent.findUnique({
        where: { childId },
      });

      if (!consent) {
        throw new NotFoundError('Parental consent record');
      }

      // Only parent can complete consent
      if (parentId !== consent.parentId && (request.user as any)?.role !== 'platform_admin') {
        throw new AuthorizationError('Unauthorized');
      }

      if (!consentGiven || !termsAccepted) {
        throw new ValidationError('Parental consent and terms acceptance required');
      }

      // Update consent and child user status
      const updated = await prisma.parentalConsent.update({
        where: { id: consent.id },
        data: {
          consentGiven: true,
          termsAccepted: true,
          consentTimestamp: new Date(),
        },
      });

      // Update child status to verified
      await prisma.user.update({
        where: { id: childId },
        data: {
          status: 'verified',
        },
      });

      logger.info({ childId, parentId }, 'Parental consent completed');

      return reply.send({
        data: {
          id: updated.id,
          childId: updated.childId,
          parentId: updated.parentId,
          consentGiven: updated.consentGiven,
          consentTimestamp: updated.consentTimestamp,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );
}
