/**
 * Password Hashing & Verification Tests
 * Tests argon2/bcrypt hashing, password strength validation
 */

import { hashPassword, verifyPassword, validatePasswordStrength } from '@movemate/shared';

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).not.toBe(password);
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'SecurePass123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle long passwords', async () => {
      const longPassword = 'A'.repeat(128) + '1@';
      const hash = await hashPassword(longPassword);

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('WrongPassword123!', hash);

      expect(isValid).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('securepass123!', hash);

      expect(isValid).toBe(false);
    });

    it('should handle special characters in password', async () => {
      const password = 'P@ssw0rd!#$%^&*()';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept a strong password', () => {
      const result = validatePasswordStrength('SecurePass123!');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password with less than 8 characters', () => {
      const result = validatePasswordStrength('Pass1!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePasswordStrength('securepass123!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least 1 uppercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePasswordStrength('SecurePass!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least 1 number');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordStrength('SecurePass123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least 1 special character');
    });

    it('should report multiple validation errors', () => {
      const result = validatePasswordStrength('short');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should accept various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '=', '[', ']'];

      specialChars.forEach((char) => {
        const password = `SecurePass123${char}`;
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });
  });
});
