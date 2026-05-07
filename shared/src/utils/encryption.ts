import crypto from 'crypto';
import { logger } from './logger';

/**
 * AES-256-GCM encryption for sensitive fields
 * Phase 1 simplification: encryption key from environment
 * Phase 2: integrate with AWS KMS
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    logger.warn('ENCRYPTION_KEY not set; using development default');
    // Development fallback (NEVER USE IN PRODUCTION)
    return Buffer.from('00000000000000000000000000000000');
  }

  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
  }

  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a string using AES-256-GCM
 */
export function encryptField(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    logger.error('Encryption failed', { error: err });
    throw err;
  }
}

/**
 * Decrypt a string using AES-256-GCM
 */
export function decryptField(encrypted: string): string {
  try {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');

    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    logger.error('Decryption failed', { error: err });
    throw err;
  }
}

/**
 * Hash a value using SHA-256 (for non-searchable PII)
 */
export function hashValue(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

/**
 * Create a hash for phone/email lookups (partial hash for performance)
 */
export function createIndexHash(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
    .substring(0, 32);
}
