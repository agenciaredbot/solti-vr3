/**
 * Vault Service — Manage encrypted tenant credentials.
 *
 * Simplified model: every tenant uses OWN_KEY.
 * No PLATFORM/credit system for now.
 */

import { prisma } from '../lib/prisma.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { CredentialError } from '../lib/errors.js'

export type ServiceName = 'apify' | 'brevo' | 'evolution' | 'getlate' | 'phantombuster'

interface StoredCredential {
  service: string
  credType: string
  isValid: boolean
  lastTestedAt: Date | null
  metadata: unknown
}

/**
 * Store or update a credential for a tenant.
 */
export async function setCredential(
  tenantId: string,
  service: ServiceName,
  apiKey: string,
  metadata: Record<string, string | number | boolean> = {}
): Promise<StoredCredential> {
  const encryptedValue = encrypt(apiKey, tenantId)

  const cred = await prisma.tenantCredential.upsert({
    where: { tenantId_service: { tenantId, service } },
    create: {
      tenantId,
      service,
      credType: 'OWN_KEY',
      encryptedValue,
      metadata,
      isValid: true,
    },
    update: {
      encryptedValue,
      metadata,
      isValid: true,
      updatedAt: new Date(),
    },
  })

  return {
    service: cred.service,
    credType: cred.credType,
    isValid: cred.isValid,
    lastTestedAt: cred.lastTestedAt,
    metadata: cred.metadata,
  }
}

/**
 * Get a decrypted API key for a tenant + service.
 * Throws CredentialError if not found.
 */
export async function getCredential(
  tenantId: string,
  service: ServiceName
): Promise<string> {
  const cred = await prisma.tenantCredential.findUnique({
    where: { tenantId_service: { tenantId, service } },
  })

  if (!cred) {
    throw new CredentialError(service)
  }

  return decrypt(cred.encryptedValue, tenantId)
}

/**
 * List all credentials for a tenant (without decrypting values).
 */
export async function listCredentials(
  tenantId: string
): Promise<StoredCredential[]> {
  const creds = await prisma.tenantCredential.findMany({
    where: { tenantId },
    select: {
      service: true,
      credType: true,
      isValid: true,
      lastTestedAt: true,
      metadata: true,
    },
  })

  return creds
}

/**
 * Mark a credential as valid/invalid after testing.
 */
export async function markCredentialValidity(
  tenantId: string,
  service: ServiceName,
  isValid: boolean
): Promise<void> {
  await prisma.tenantCredential.update({
    where: { tenantId_service: { tenantId, service } },
    data: { isValid, lastTestedAt: new Date() },
  })
}

/**
 * Delete a credential.
 */
export async function deleteCredential(
  tenantId: string,
  service: ServiceName
): Promise<void> {
  await prisma.tenantCredential.delete({
    where: { tenantId_service: { tenantId, service } },
  })
}
