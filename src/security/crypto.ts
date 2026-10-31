import crypto from 'node:crypto';
import { config } from '../config/index.js';

// Derive a 32-byte key from configured encryption key
function getDerivedKey(): Buffer {
  const masterKey = config.security.encryptionKey || 'code-context-mcp-default-secret-key-32-chars';
  return crypto.createHash('sha256').update(masterKey).digest();
}

/**
 * Encrypts a sensitive string (e.g. API key) using AES-256-GCM.
 * Returns both the encrypted payload (iv:authTag:ciphertext) and a masked preview.
 */
export function encryptApiKey(apiKey: string): { encrypted: string; masked: string } {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key cannot be empty');
  }

  const trimmed = apiKey.trim();
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(trimmed, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine iv:authTag:ciphertext
  const payload = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  const masked = maskApiKey(trimmed);

  return { encrypted: payload, masked };
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptApiKey(encryptedPayload: string): string {
  if (!encryptedPayload) {
    throw new Error('Encrypted payload is required');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

/**
 * Produces a safe masked representation of an API key.
 * Example: 'sk-proj-1234567890abcdef' -> 'sk-proj-••••••••cdef'
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return '••••' + trimmed.slice(-2);
  }

  // Keep first 4-7 chars prefix (like sk-, AIza) and last 4 chars
  const prefixLength = trimmed.startsWith('sk-') ? 7 : (trimmed.startsWith('AIza') ? 4 : 4);
  const prefix = trimmed.slice(0, prefixLength);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

/**
 * Hashes a password using PBKDF2 with SHA-512 and a random 16-byte salt.
 */
export function hashPassword(password: string, customSalt?: string): { hash: string; salt: string } {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Verifies a password against stored PBKDF2 hash and salt.
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

