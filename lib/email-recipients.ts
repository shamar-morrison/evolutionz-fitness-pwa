import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import { emailRecipientWithIdSchema, type EmailRecipientWithId } from '@/lib/admin-email'

const emailRecipientsResponseSchema = z.object({
  ok: z.literal(true).optional(),
  recipients: z.array(emailRecipientWithIdSchema).default([]),
})

export type EmailRecipientsLookupInput = {
  activeMembers: boolean
  expiringMembers: boolean
  expiredMembers: boolean
  activeMemberTypeIds: string[]
  expiringMemberTypeIds: string[]
  expiredMemberTypeIds: string[]
  individualIds: string[]
}

export function buildEmailRecipientsLookupUrl(input: EmailRecipientsLookupInput) {
  const searchParams = new URLSearchParams()

  if (input.activeMembers) {
    searchParams.set('activeMembers', 'true')
  }

  if (input.expiringMembers) {
    searchParams.set('expiringMembers', 'true')
  }

  if (input.expiredMembers) {
    searchParams.set('expiredMembers', 'true')
  }

  if (input.activeMemberTypeIds.length > 0) {
    searchParams.set('activeMemberTypeIds', input.activeMemberTypeIds.join(','))
  }

  if (input.expiringMemberTypeIds.length > 0) {
    searchParams.set('expiringMemberTypeIds', input.expiringMemberTypeIds.join(','))
  }

  if (input.expiredMemberTypeIds.length > 0) {
    searchParams.set('expiredMemberTypeIds', input.expiredMemberTypeIds.join(','))
  }

  if (input.individualIds.length > 0) {
    searchParams.set('individualIds', input.individualIds.join(','))
  }

  const queryString = searchParams.toString()
  return queryString ? `/api/email/recipients?${queryString}` : '/api/email/recipients'
}

export async function fetchEmailRecipients(
  input: EmailRecipientsLookupInput,
): Promise<EmailRecipientWithId[]> {
  const responseBody = await apiFetch(
    buildEmailRecipientsLookupUrl(input),
    {
      method: 'GET',
    },
    emailRecipientsResponseSchema,
    'Failed to resolve email recipients.',
  )

  return responseBody.recipients
}
