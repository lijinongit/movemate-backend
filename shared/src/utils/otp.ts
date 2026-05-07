import crypto from 'crypto';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS_PER_HOUR = 5;

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return crypto
    .randomInt(0, 1000000)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

/**
 * Hash OTP code for storage (never store plaintext)
 */
export function hashOTP(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

/**
 * Verify OTP code against stored hash
 */
export function verifyOTP(code: string, hash: string): boolean {
  return hashOTP(code) === hash;
}

/**
 * Calculate OTP expiration time
 */
export function getOTPExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
  return expiry;
}

export const OTP_CONFIG = {
  LENGTH: OTP_LENGTH,
  EXPIRY_MINUTES: OTP_EXPIRY_MINUTES,
  MAX_ATTEMPTS_PER_HOUR,
};
