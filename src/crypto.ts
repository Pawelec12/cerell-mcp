import * as crypto from 'crypto';

/**
 * Standard AES-256-GCM Encryption for credentials at rest.
 * Serialization format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

const PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
  const secret = process.env.CERELL_ENCRYPTION_KEY || 
                 process.env.MCP_SECRET_KEY || 
                 'cerell_default_secret_key_change_in_production_2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext secret using AES-256-GCM with a random 96-bit IV.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return plainText;
  
  // If already encrypted, return as is
  if (plainText.startsWith(PREFIX)) return plainText;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plainText, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted secret.
 * If the input does not start with `enc:v1:`, returns the input as legacy plaintext.
 */
export function decryptSecret(cipherOrPlain: string): string {
  if (!cipherOrPlain) return cipherOrPlain;

  // Legacy plaintext fallback
  if (!cipherOrPlain.startsWith(PREFIX)) {
    return cipherOrPlain;
  }

  const parts = cipherOrPlain.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret format.');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Checks if a string is encrypted in enc:v1 format.
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
