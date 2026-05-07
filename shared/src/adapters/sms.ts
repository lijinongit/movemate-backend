import { logger } from '../utils/logger';

/**
 * SMS adapter interface for OTP delivery
 * Phase 1: Stub with console logging
 * Phase 2: Integrate with Twilio or AWS SNS
 */

export interface SmsAdapter {
  sendOTP(phone: string, code: string, language: string): Promise<void>;
  sendMessage(phone: string, message: string): Promise<void>;
}

export class StubSmsAdapter implements SmsAdapter {
  async sendOTP(phone: string, code: string, language: string): Promise<void> {
    const message = language === 'ar' ? `رمز OTP الخاص بك: ${code}` : `Your OTP code is: ${code}`;

    logger.info(
      {
        phone: phone.slice(-4),
        code,
        language,
        message,
      },
      'SMS.sendOTP (STUB - log in development only)',
    );

    // TODO: Integrate with Twilio or AWS SNS
    // Real implementation would call:
    // - Twilio: client.messages.create({ to: phone, body: message })
    // - AWS SNS: sns.publish({ PhoneNumber: phone, Message: message })
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    logger.info(
      {
        phone: phone.slice(-4),
        messageLength: message.length,
      },
      'SMS.sendMessage (STUB)',
    );

    // TODO: Implement SMS sending via Twilio/SNS
  }
}

/**
 * Factory function to get appropriate adapter
 */
export function getSmsAdapter(): SmsAdapter {
  const isStub = process.env.STUB_SMS === 'true' || process.env.NODE_ENV === 'development';

  if (isStub) {
    logger.info('Using stub SMS adapter');
    return new StubSmsAdapter();
  }

  // TODO: Return real SMS adapter when Twilio/SNS is integrated
  return new StubSmsAdapter();
}
