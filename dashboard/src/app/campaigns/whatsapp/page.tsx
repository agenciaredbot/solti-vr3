import { hubFetch } from '@/lib/hub'
import { WhatsAppCampaignManager } from './campaign-manager'

async function getCampaigns() {
  try {
    const res = await hubFetch('/campaigns')
    const all = res.data || []
    return all.filter((c: any) => c.type === 'whatsapp')
  } catch {
    return []
  }
}

async function getInstances() {
  try {
    const res = await hubFetch('/whatsapp/instances')
    return res.data || []
  } catch {
    return []
  }
}

async function getLists() {
  try {
    const res = await hubFetch('/lists')
    return res.data || []
  } catch {
    return []
  }
}

export default async function WhatsAppCampaignsPage() {
  const [campaigns, instances, lists] = await Promise.all([
    getCampaigns(),
    getInstances(),
    getLists(),
  ])

  return (
    <WhatsAppCampaignManager
      initialCampaigns={campaigns}
      instances={instances}
      lists={lists}
    />
  )
}
