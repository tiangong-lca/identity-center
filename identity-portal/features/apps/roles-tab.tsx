import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppRoles } from './queries'
import { AppStatusBadge } from './status-badges'

const COLUMN_COUNT = 4

export function RolesTab({ appId }: { appId: string }) {
  const t = useTranslations('apps.detail.roles')
  const tApps = useTranslations('apps')
  const { data, isPending, isError, refetch } = useAppRoles(appId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/apps/registry">{t('editInCatalog')}</Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('code')}</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('description')}</TableHead>
              <TableHead>{t('status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center">
                  <span className="text-muted-foreground">{t('loadFailed')}</span>
                  <Button variant="link" size="sm" className="ml-2" onClick={() => refetch()}>
                    {tApps('table.retry')}
                  </Button>
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-foreground">{role.code}</span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{role.name}</TableCell>
                  <TableCell>
                    <span
                      className="block max-w-64 truncate text-secondary-foreground"
                      title={role.description ?? undefined}
                    >
                      {role.description ?? tApps('detail.none')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AppStatusBadge status={role.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
