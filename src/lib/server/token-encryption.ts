/**
 * @fileOverview AES-256-GCM encryption for GitHub OAuth tokens.
 * Security layer for per-user token storage.
 * 
 * Key management:
 * - TOKEN_ENCRYPTION_KEY must be 32-byte hex string (64 hex chars)
 * - Stored in environment variable (never in Firestore)
 * - Rotate key annually (keep old keys for decryption during rotation)
 * 
 * Algorithm: AES-256-GCM (authenticated encryption)
 * - Provides confidentiality (encryption) + integrity (auth tag)
 * - Each token gets unique IV (initialization vector)
 * - Auth tag prevents tampering
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // bytes
const AUTH_TAG_LENGTH = 16; // bytes

/**
 * Get encryption key from environment.
 * @throws Error if TOKEN_ENCRYPTION_KEY is not configured or invalid
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      '[token-encryption] TOKEN_ENCRYPTION_KEY is not configured. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  
  // Validate key format (64 hex chars = 32 bytes)
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      '[token-encryption] TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
      'Current length: ' + key.length
    );
  }
  
  return Buffer.from(key, 'hex');
}

/**
 * Encrypted token data structure.
 */
export interface EncryptedToken {
  /** Base64-encoded encrypted token */
  encryptedToken: string;
  /** Base64-encoded initialization vector (unique per encryption) */
  iv: string;
  /** Base64-encoded authentication tag (GCM integrity check) */
  authTag: string;
}

/**
 * Encrypt a GitHub OAuth token with AES-256-GCM.
 * 
 * @param plaintext - OAuth token to encrypt
 * @returns Encrypted token, IV, and auth tag (all base64-encoded)
 * @throws Error if encryption fails or TOKEN_ENCRYPTION_KEY is invalid
 * 
 * @example
 * const encrypted = encryptToken('ghp_abc123...');
 * // Store encrypted.encryptedToken, encrypted.iv, encrypted.authTag in Firestore
 */
export function encryptToken(plaintext: string): EncryptedToken {
  if (!plaintext) {
    throw new Error('[token-encryption] Cannot encrypt empty token');
  }
  
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encryptedToken: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt a GitHub OAuth token encrypted with AES-256-GCM.
 * 
 * @param encryptedToken - Base64-encoded encrypted token
 * @param iv - Base64-encoded initialization vector
 * @param authTag - Base64-encoded authentication tag
 * @returns Decrypted plaintext token
 * @throws Error if decryption fails (wrong key, tampered data, or invalid format)
 * 
 * @example
 * const token = decryptToken(stored.encryptedToken, stored.iv, stored.authTag);
 * // Use token for GitHub API requests
 */
export function decryptToken(encryptedToken: string, iv: string, authTag: string): string {
  if (!encryptedToken || !iv || !authTag) {
    throw new Error('[token-encryption] Cannot decrypt: missing encrypted data, IV, or auth tag');
  }
  
  const key = getEncryptionKey();
  
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  
  let decrypted: string;
  try {
    decrypted = decipher.update(encryptedToken, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
  } catch (err) {
    // Auth tag verification failed or data was tampered
    throw new Error(
      '[token-encryption] Decryption failed. Token may be corrupted or tampered. ' +
      (err instanceof Error ? err.message : String(err))
    );
  }
  
  return decrypted;
}
