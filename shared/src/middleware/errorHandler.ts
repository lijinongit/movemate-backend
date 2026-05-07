import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
}

/**
 * Global error handler for Fastify
 */
export async function setupErrorHandler(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(
    async (error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId || 'unknown';
      const timestamp = new Date().toISOString();

      // Handle AppError instances
      if (error instanceof AppError) {
        logger.warn(
          {
            requestId,
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
          },
          'Application error',
        );

        const response: ErrorResponse = {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details }),
          },
          meta: {
            request_id: requestId,
            timestamp,
          },
        };

        return reply.status(error.statusCode).send(response);
      }

      // Handle Zod validation errors
      if (error instanceof Error && error.message.includes('Zod validation')) {
        logger.warn(
          {
            requestId,
            message: error.message,
          },
          'Validation error',
        );

        const response: ErrorResponse = {
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: {
            request_id: requestId,
            timestamp,
          },
        };

        return reply.status(400).send(response);
      }

      // Handle Fastify errors
      if ('statusCode' in error) {
        logger.error(
          {
            requestId,
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
          },
          'Fastify error',
        );

        const response: ErrorResponse = {
          error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.message,
          },
          meta: {
            request_id: requestId,
            timestamp,
          },
        };

        return reply.status(error.statusCode || 500).send(response);
      }

      // Fallback for unexpected errors
      logger.error(
        {
          requestId,
          error: error.message,
          stack: error.stack,
        },
        'Unexpected error',
      );

      const response: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        meta: {
          request_id: requestId,
          timestamp,
        },
      };

      return reply.status(500).send(response);
    },
  );
}
