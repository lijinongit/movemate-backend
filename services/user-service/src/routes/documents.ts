import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  logger,
  NotFoundError,
  AuthorizationError,
  ValidationError,
  documentTypeSchema,
} from '@movemate/shared';
import { getS3Adapter } from '@movemate/shared/adapters';
import { config } from '../config';

const prisma = new PrismaClient();

export async function registerDocumentRoutes(fastify: FastifyInstance): Promise<void> {
  // Get presigned upload URL (POST /users/:id/documents/presigned-url)
  fastify.post<{ Params: { id: string }; Body: { documentType: string } }>(
    '/:id/documents/presigned-url',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id } = request.params as { id: string };
      const userId = (request.user as any)?.userId;
      const { documentType } = request.body;

      if (userId !== id) {
        throw new AuthorizationError('Cannot upload documents for another user');
      }

      // Validate document type
      try {
        documentTypeSchema.parse(documentType);
      } catch (err) {
        throw new ValidationError('Invalid document type');
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User');
      }

      // Get presigned URL from S3 adapter
      const s3Adapter = getS3Adapter();
      const { url, fields } = await s3Adapter.getPresignedUploadUrl(
        id,
        documentType,
        'image/*',
      );

      logger.info({ userId: id, documentType }, 'Presigned URL generated');

      return reply.send({
        data: {
          url,
          fields,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Verify document upload (POST /users/:id/documents/verify)
  fastify.post<{ Params: { id: string }; Body: { documentType: string; s3Path: string } }>(
    '/:id/documents/verify',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id } = request.params as { id: string };
      const userId = (request.user as any)?.userId;
      const { documentType, s3Path } = request.body;

      if (userId !== id) {
        throw new AuthorizationError('Cannot verify documents for another user');
      }

      // Validate input
      try {
        documentTypeSchema.parse(documentType);
      } catch (err) {
        throw new ValidationError('Invalid document type');
      }

      if (!s3Path || !s3Path.startsWith('s3://')) {
        throw new ValidationError('Invalid S3 path');
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User');
      }

      // Create document record
      const document = await prisma.document.create({
        data: {
          userId: id,
          documentType,
          s3Path: s3Path,
          fileSizeBytes: 0, // TODO: Get actual file size from S3
          status: 'pending_verification',
        },
      });

      // Log to audit trail
      await prisma.auditLog.create({
        data: {
          action: 'emirates_id_upload',
          userId: id,
          resourceId: document.id,
          resourceType: 'document',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          details: JSON.stringify({
            documentType,
            s3Path,
          }),
        },
      });

      logger.info({ userId: id, documentId: document.id }, 'Document uploaded and verified');

      return reply.status(201).send({
        data: {
          documentId: document.id,
          status: document.status,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Get user documents (GET /users/:id/documents)
  fastify.get<{ Params: { id: string } }>(
    '/:id/documents',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id } = request.params as { id: string };
      const userId = (request.user as any)?.userId;

      if (userId !== id) {
        throw new AuthorizationError('Cannot view documents for another user');
      }

      const documents = await prisma.document.findMany({
        where: {
          userId: id,
          deletedAt: null,
        },
      });

      logger.info({ userId: id, count: documents.length }, 'Documents retrieved');

      return reply.send({
        data: documents.map((doc) => ({
          id: doc.id,
          documentType: doc.documentType,
          status: doc.status,
          createdAt: doc.createdAt,
          verifiedAt: doc.verifiedAt,
        })),
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Approve document (admin only) (POST /users/:id/documents/:docId/approve)
  fastify.post<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId/approve',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id, docId } = request.params as { id: string; docId: string };
      const adminId = (request.user as any)?.userId;
      const adminRole = (request.user as any)?.role;

      if (adminRole !== 'platform_admin') {
        throw new AuthorizationError('Only admins can approve documents');
      }

      const document = await prisma.document.findUnique({
        where: { id: docId },
      });

      if (!document || document.deletedAt) {
        throw new NotFoundError('Document');
      }

      const approved = await prisma.document.update({
        where: { id: docId },
        data: {
          status: 'verified',
          verifiedBy: adminId,
          verifiedAt: new Date(),
        },
      });

      logger.info(
        { adminId, documentId: docId, userId: id },
        'Document approved',
      );

      return reply.send({
        data: {
          id: approved.id,
          status: approved.status,
          verifiedAt: approved.verifiedAt,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );

  // Reject document (admin only) (POST /users/:id/documents/:docId/reject)
  fastify.post<{ Params: { id: string; docId: string }; Body: { reason: string } }>(
    '/:id/documents/:docId/reject',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();
      const { id, docId } = request.params as { id: string; docId: string };
      const adminId = (request.user as any)?.userId;
      const adminRole = (request.user as any)?.role;
      const { reason } = request.body;

      if (adminRole !== 'platform_admin') {
        throw new AuthorizationError('Only admins can reject documents');
      }

      if (!reason) {
        throw new ValidationError('Rejection reason required');
      }

      const document = await prisma.document.findUnique({
        where: { id: docId },
      });

      if (!document || document.deletedAt) {
        throw new NotFoundError('Document');
      }

      const rejected = await prisma.document.update({
        where: { id: docId },
        data: {
          status: 'rejected',
          rejectionReason: reason,
          verifiedBy: adminId,
          verifiedAt: new Date(),
        },
      });

      logger.info(
        { adminId, documentId: docId, userId: id, reason },
        'Document rejected',
      );

      return reply.send({
        data: {
          id: rejected.id,
          status: rejected.status,
          rejectionReason: rejected.rejectionReason,
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      });
    },
  );
}
