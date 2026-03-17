import { PrismaClient } from '@prisma/client'
import { decrypt } from '../src/lib/crypto.js'

const prisma = new PrismaClient()

async function test() {
  const tenantId = 'ece67bfc-9fcd-45fb-b7cc-853c854626bf'

  const creds = await prisma.tenantCredential.findMany({
    where: { tenantId },
  })

  console.log('🔐 Decrypt test (round-trip):\n')
  for (const c of creds) {
    const decrypted = decrypt(c.encryptedValue, tenantId)
    const hint = decrypted.slice(0, 8) + '...' + decrypted.slice(-4)
    console.log(`  ✅ ${c.service}: ${hint} (valid: ${c.isValid})`)
  }

  await prisma.$disconnect()
}

test().catch(console.error)
