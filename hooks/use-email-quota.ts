'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchEmailQuota, type EmailQuota } from '@/lib/email-quota'
import { queryKeys } from '@/lib/query-keys'

const ONE_MINUTE_MS = 60_000

export function useEmailQuota(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery<EmailQuota, Error>({
    queryKey: queryKeys.email.quota,
    queryFn: fetchEmailQuota,
    enabled,
    staleTime: ONE_MINUTE_MS,
    refetchOnWindowFocus: true,
  })

  return {
    quota: (query.data ?? null) as EmailQuota | null,
    isLoading: enabled ? query.isLoading && !query.data : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
