'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMembershipExpiryEmailSettings } from '@/lib/membership-expiry-email-settings'
import { queryKeys } from '@/lib/query-keys'
import type { MembershipExpiryEmailSettings } from '@/types'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export function useMembershipExpiryEmailSettings(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.membershipExpiryEmails.settings,
    queryFn: fetchMembershipExpiryEmailSettings,
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    settings: (query.data ?? null) as MembershipExpiryEmailSettings | null,
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
