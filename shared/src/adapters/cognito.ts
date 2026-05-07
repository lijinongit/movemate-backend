import { logger } from '../utils/logger';

/**
 * Cognito adapter interface for user authentication
 * Phase 1: Stub implementation
 * Phase 2: Integrate with AWS SDK v3
 */

export interface CognitoAdapter {
  createUser(email: string, password: string): Promise<string>;
  setUserAttributes(userId: string, attributes: Record<string, string>): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  confirmEmail(userId: string): Promise<void>;
}

export class StubCognitoAdapter implements CognitoAdapter {
  async createUser(email: string, password: string): Promise<string> {
    logger.info({ email }, 'Cognito.createUser (STUB)');
    // TODO: Integrate with AWS Cognito SDK
    // For Phase 1, local password hashing is used instead
    return `cognito-${Date.now()}`;
  }

  async setUserAttributes(userId: string, attributes: Record<string, string>): Promise<void> {
    logger.info({ userId, attributes }, 'Cognito.setUserAttributes (STUB)');
    // TODO: Call Cognito AdminUpdateUserAttributes
  }

  async deleteUser(userId: string): Promise<void> {
    logger.info({ userId }, 'Cognito.deleteUser (STUB)');
    // TODO: Call Cognito AdminDeleteUser
  }

  async confirmEmail(userId: string): Promise<void> {
    logger.info({ userId }, 'Cognito.confirmEmail (STUB)');
    // TODO: Call Cognito AdminConfirmSignUp
  }
}

/**
 * Factory function to get appropriate adapter
 */
export function getCognitoAdapter(): CognitoAdapter {
  const isStub = process.env.STUB_COGNITO === 'true' || process.env.NODE_ENV === 'development';

  if (isStub) {
    logger.info('Using stub Cognito adapter');
    return new StubCognitoAdapter();
  }

  // TODO: Return real Cognito adapter when AWS SDK is integrated
  return new StubCognitoAdapter();
}
