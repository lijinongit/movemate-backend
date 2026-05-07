import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthorizationError } from '../utils/errors';
import { JwtPayload } from '../types/jwt';

type UserRole = 'customer' | 'trainer' | 'studio_admin' | 'platform_admin';

/**
 * Role-based access control middleware factory
 * Returns a hook that checks if user has required role
 */
export function roleGuard(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AuthorizationError('User not authenticated');
    }

    const user = request.user as JwtPayload;

    if (!allowedRoles.includes(user.role as UserRole)) {
      throw new AuthorizationError(
        `This action requires one of these roles: ${allowedRoles.join(', ')}`,
      );
    }
  };
}

/**
 * Check if user owns the resource
 */
export function ownsResource(
  userId: string,
  request: FastifyRequest,
): boolean {
  if (!request.user) {
    return false;
  }

  const user = request.user as JwtPayload;
  return user.userId === userId;
}

/**
 * Check if user is admin
 */
export function isAdmin(request: FastifyRequest): boolean {
  if (!request.user) {
    return false;
  }

  const user = request.user as JwtPayload;
  return user.role === 'platform_admin';
}
