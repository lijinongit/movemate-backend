import bcrypt from 'bcryptjs';
import { logger } from './logger';

let argon2: any = null;

// Try to load argon2; fall back to bcrypt if not available
try {
  argon2 = require('argon2');
} catch (err) {
  logger.warn('argon2 not available; using bcrypt for password hashing');
}

const BCRYPT_ROUNDS = 12;
const ARGON2_OPTIONS = {
  type: 2, // Argon2id
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 2,
};

/**
 * Hash password using argon2 (preferred) or bcrypt fallback
 */
export async function hashPassword(password: string): Promise<string> {
  if (argon2) {
    try {
      return await argon2.hash(password, ARGON2_OPTIONS);
    } catch (err) {
      logger.error('Argon2 hash failed; falling back to bcrypt', { error: err });
    }
  }

  // Fallback to bcrypt
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against hash using argon2 or bcrypt
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Try argon2 first if available
  if (argon2) {
    try {
      return await argon2.verify(hash, password);
    } catch (err) {
      // Hash might be bcrypt; fall through
    }
  }

  // Try bcrypt
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 * - 8+ characters
 * - 1 uppercase letter
 * - 1 number
 * - 1 special character
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least 1 uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least 1 number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least 1 special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
