import { hubFetch } from '@/lib/hub'
import { ListDetail } from './list-detail'

async function getList(id: string) {
  try { return await hubFetch(`/lists/${id}`) } catch { return null }
}

async function getTags() {
  try { return await hubFetch('/tags') } catch { return { data: [] } }
}

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [listRes, tagsRes] = await Promise.all([getList(id), getTags()])
  const list = listRes?.data || listRes

  if (!list) {
    return <p className="text-text-muted p-8">Lista no encontrada</p>
  }

  return <ListDetail initialList={list} allTags={tagsRes.data || []} />
}
