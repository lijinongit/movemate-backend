import { logger } from '../utils/logger';

/**
 * Email adapter interface for transactional emails
 * Phase 1: Stub with console logging
 * Phase 2: Integrate with AWS SES
 */

export interface EmailAdapter {
  sendOTP(email: string, code: string): Promise<void>;
  sendWelcome(email: string, firstName: string): Promise<void>;
  sendApprovalNotification(email: string, name: string): Promise<void>;
  sendRejectionNotification(email: string, name: string, reason: string): Promise<void>;
}

export class StubEmailAdapter implements EmailAdapter {
  async sendOTP(email: string, code: string): Promise<void> {
    logger.info(
      {
        email,
        code,
      },
      'Email.sendOTP (STUB - log in development)',
    );

    // TODO: Integrate with AWS SES
    // Real implementation would call:
    // ses.sendEmail({
    //   Source: 'noreply@movemate.ae',
    //   Destination: { ToAddresses: [email] },
    //   Message: { ... }
    // })
  }

  async sendWelcome(email: string, firstName: string): Promise<void> {
    logger.info({ email, firstName }, 'Email.sendWelcome (STUB)');

    // TODO: Implement welcome email via SES
  }

  async sendApprovalNotification(email: string, name: string): Promise<void> {
    logger.info({ email, name }, 'Email.sendApprovalNotification (STUB)');

    // TODO: Implement approval email via SES
  }

  async sendRejectionNotification(
    email: string,
    name: string,
    reason: string,
  ): Promise<void> {
    logger.info({ email, name, reason }, 'Email.sendRejectionNotification (STUB)');

    // TODO: Implement rejection email via SES
  }
}

/**
 * Factory function to get appropriate adapter
 */
export function getEmailAdapter(): EmailAdapter {
  const isStub = process.env.STUB_EMAIL === 'true' || process.env.NODE_ENV === 'development';

  if (isStub) {
    logger.info('Using stub email adapter');
    return new StubEmailAdapter();
  }

  // TODO: Return real email adapter when SES is integrated
  return new StubEmailAdapter();
}
