import { UserDetail } from '@/features/users/components/user-detail'

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <UserDetail id={id} />
}
