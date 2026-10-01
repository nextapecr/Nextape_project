/**
 * @fileOverview Unit tests for token encryption module.
 * Tests AES-256-GCM encryption/decryption with various scenarios.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from './token-encryption';

describe('token-encryption', () => {
  beforeAll(() => {
    // Set test encryption key (32 bytes = 64 hex chars)
    process.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  describe('encryptToken', () => {
    it('encrypts a token successfully', () => {
      const plaintext = 'ghp_abc123def456ghi789jkl012mno345pqr678';
      const encrypted = encryptToken(plaintext);

      expect(encrypted).toHaveProperty('encryptedToken');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      
      // All outputs should be base64 strings
      expect(encrypted.encryptedToken).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(encrypted.authTag).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('produces different IVs for same plaintext', () => {
      const plaintext = 'same-token';
      const encrypted1 = encryptToken(plaintext);
      const encrypted2 = encryptToken(plaintext);

      // IVs must be unique (prevents replay attacks)
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Encrypted outputs will also differ
      expect(encrypted1.encryptedToken).not.toBe(encrypted2.encryptedToken);
    });

    it('throws error for empty token', () => {
      expect(() => encryptToken('')).toThrow('Cannot encrypt empty token');
    });

    it('throws error if TOKEN_ENCRYPTION_KEY is missing', () => {
      const original = process.env.TOKEN_ENCRYPTION_KEY;
      delete process.env.TOKEN_ENCRYPTION_KEY;

      expect(() => encryptToken('test')).toThrow('TOKEN_ENCRYPTION_KEY is not configured');

      process.env.TOKEN_ENCRYPTION_KEY = original;
    });

    it('throws error if TOKEN_ENCRYPTION_KEY is invalid', () => {
      const original = process.env.TOKEN_ENCRYPTION_KEY;
      process.env.TOKEN_ENCRYPTION_KEY = 'invalid'; // Not 64 hex chars

      expect(() => encryptToken('test')).toThrow('must be 64 hex characters');

      process.env.TOKEN_ENCRYPTION_KEY = original;
    });
  });

  describe('decryptToken', () => {
    it('decrypts a token successfully', () => {
      const plaintext = 'ghp_abc123def456ghi789jkl012mno345pqr678';
      const encrypted = encryptToken(plaintext);
      
      const decrypted = decryptToken(
        encrypted.encryptedToken,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe(plaintext);
    });

    it('round-trip encryption preserves token', () => {
      const tokens = [
        'ghp_short',
        'ghp_abc123def456ghi789jkl012mno345pqr678',
        'gho_veryLongTokenWithSpecialChars!@#$%^&*()_+-={}[]|:";\'<>?,./`~',
      ];

      tokens.forEach(original => {
        const encrypted = encryptToken(original);
        const decrypted = decryptToken(
          encrypted.encryptedToken,
          encrypted.iv,
          encrypted.authTag
        );
        expect(decrypted).toBe(original);
      });
    });

    it('throws error if auth tag is tampered', () => {
      const plaintext = 'test-token';
      const encrypted = encryptToken(plaintext);

      // Tamper with auth tag (flip one bit)
      const tamperedTag = Buffer.from(encrypted.authTag, 'base64');
      tamperedTag[0] ^= 0x01;
      const tamperedTagB64 = tamperedTag.toString('base64');

      expect(() =>
        decryptToken(encrypted.encryptedToken, encrypted.iv, tamperedTagB64)
      ).toThrow('Decryption failed');
    });

    it('throws error if encrypted data is tampered', () => {
      const plaintext = 'test-token';
      const encrypted = encryptToken(plaintext);

      // Tamper with encrypted data
      const tamperedData = Buffer.from(encrypted.encryptedToken, 'base64');
      tamperedData[0] ^= 0x01;
      const tamperedDataB64 = tamperedData.toString('base64');

      expect(() =>
        decryptToken(tamperedDataB64, encrypted.iv, encrypted.authTag)
      ).toThrow('Decryption failed');
    });

    it('throws error if IV is wrong', () => {
      const plaintext = 'test-token';
      const encrypted = encryptToken(plaintext);

      // Use different IV
      const wrongIV = Buffer.from(Array(16).fill(0)).toString('base64');

      expect(() =>
        decryptToken(encrypted.encryptedToken, wrongIV, encrypted.authTag)
      ).toThrow('Decryption failed');
    });

    it('throws error if any parameter is missing', () => {
      expect(() => decryptToken('', 'iv', 'tag')).toThrow('missing encrypted data');
      expect(() => decryptToken('data', '', 'tag')).toThrow('missing encrypted data');
      expect(() => decryptToken('data', 'iv', '')).toThrow('missing encrypted data');
    });
  });

  describe('security properties', () => {
    it('encrypted output is not readable plaintext', () => {
      const plaintext = 'secret-github-token-ghp_abc123';
      const encrypted = encryptToken(plaintext);

      // Encrypted data should not contain plaintext
      expect(encrypted.encryptedToken).not.toContain('secret');
      expect(encrypted.encryptedToken).not.toContain('github');
      expect(encrypted.encryptedToken).not.toContain('ghp_');
    });

    it('different keys produce different ciphertexts', () => {
      const plaintext = 'test-token';
      const key1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const key2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      process.env.TOKEN_ENCRYPTION_KEY = key1;
      const encrypted1 = encryptToken(plaintext);

      process.env.TOKEN_ENCRYPTION_KEY = key2;
      const encrypted2 = encryptToken(plaintext);

      // Different keys must produce different outputs (even with same IV, which is unlikely)
      expect(encrypted1.encryptedToken).not.toBe(encrypted2.encryptedToken);

      // Restore original key
      process.env.TOKEN_ENCRYPTION_KEY = key1;
    });
  });
});
