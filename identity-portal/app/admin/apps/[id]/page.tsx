import { AppDetailView } from '@/features/apps/app-detail-view'

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AppDetailView id={id} />
}
