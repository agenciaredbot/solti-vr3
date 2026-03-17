/**
 * Tenant Vault — AES-256-GCM encryption for API credentials.
 *
 * Each tenant gets a derived key from: VAULT_MASTER_KEY + tenant_id
 * This means compromising one tenant's data doesn't expose others.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

function getMasterKey(): Buffer {
  const hex = process.env.VAULT_MASTER_KEY
  if (!hex || hex.length < 32) {
    throw new Error('VAULT_MASTER_KEY must be set (min 32 hex chars). Generate with: openssl rand -hex 32')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Derive a per-tenant encryption key using scrypt.
 * Same tenant_id always produces the same derived key.
 */
function deriveKey(tenantId: string): Buffer {
  const master = getMasterKey()
  return scryptSync(master, tenantId, KEY_LENGTH)
}

/**
 * Encrypt a plaintext string for a specific tenant.
 * Returns: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string, tenantId: string): string {
  const key = deriveKey(tenantId)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':')
}

/**
 * Decrypt a stored credential for a specific tenant.
 * Input format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function decrypt(stored: string, tenantId: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format')
  }

  const [ivB64, tagB64, ciphertext] = parts
  const key = deriveKey(tenantId)
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
