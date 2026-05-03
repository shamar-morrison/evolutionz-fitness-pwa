'use client'

import { useQuery } from '@tanstack/react-query'
import {
  buildEmailRecipientsLookupUrl,
  fetchEmailRecipients,
  type EmailRecipientsLookupInput,
} from '@/lib/email-recipients'
import type { EmailRecipientWithId } from '@/lib/admin-email'

const ONE_MINUTE_MS = 60_000
const EMPTY_EMAIL_RECIPIENTS: EmailRecipientWithId[] = []

function hasRecipientSelection(input: EmailRecipientsLookupInput) {
  return (
    input.activeMembers ||
    input.expiringMembers ||
    input.expiredMembers ||
    input.individualIds.length > 0
  )
}

export function useEmailRecipients(input: EmailRecipientsLookupInput) {
  const enabled = hasRecipientSelection(input)
  const query = useQuery({
    queryKey: ['email', 'recipients', buildEmailRecipientsLookupUrl(input)] as const,
    queryFn: () => fetchEmailRecipients(input),
    enabled,
    staleTime: ONE_MINUTE_MS,
    refetchOnWindowFocus: false,
  })

  return {
    recipients: (query.data ?? EMPTY_EMAIL_RECIPIENTS) as EmailRecipientWithId[],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
