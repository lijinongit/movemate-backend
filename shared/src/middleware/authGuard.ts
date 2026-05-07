import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '../utils/errors';
import { JwtPayload } from '../types/jwt';

declare global {
  namespace FastifyInstance {
    interface FastifyInstance {
      authenticate: any;
    }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * JWT authentication guard setup
 * NOTE: JWT plugin must be registered in server.ts
 * This function sets up the authentication decorator and guard logic
 */
export async function setupAuthGuard(fastify: FastifyInstance): Promise<void> {
  // Decorate request with authenticate function
  // Uses the JWT plugin registered in server.ts
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      request.user = request.user as JwtPayload;
    } catch (err) {
      throw new AuthenticationError('Invalid or missing authentication token');
    }
  });
}

/**
 * Hook to verify JWT on protected routes
 */
export async function verifyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    throw new AuthenticationError('Invalid or missing authentication token');
  }
}
