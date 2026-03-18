import { hubFetch } from '@/lib/hub'
import { ContactsTable } from './contacts-table'

async function getContacts() {
  try {
    return await hubFetch('/contacts?limit=25&sortBy=score&sortDir=desc')
  } catch {
    return { data: [], pagination: { total: 0 } }
  }
}

async function getTags() {
  try {
    return await hubFetch('/tags')
  } catch {
    return { data: [] }
  }
}

export default async function ContactsPage() {
  const [contactsRes, tagsRes] = await Promise.all([getContacts(), getTags()])

  return (
    <ContactsTable
      initialContacts={contactsRes.data || []}
      initialTotal={contactsRes.pagination?.total ?? 0}
      tags={tagsRes.data || []}
    />
  )
}
