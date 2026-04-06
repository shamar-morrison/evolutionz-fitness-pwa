import { redirect } from 'next/navigation'

type PendingApprovalsPageProps = {
  searchParams: Promise<{
    tab?: string | string[]
  }>
}

export default async function PendingApprovalsPage({
  searchParams,
}: PendingApprovalsPageProps) {
  const { tab } = await searchParams
  const nextTab = Array.isArray(tab) ? tab[0] : tab

  redirect(
    nextTab === 'session-updates'
      ? '/pending-approvals/session-updates'
      : '/pending-approvals/reschedule-requests',
  )
}
