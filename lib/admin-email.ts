import { z } from 'zod'
import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import type { Member } from '@/types'

export const ADMIN_EMAIL_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

export const emailRecipientSchema = z.object({
  name: z.string().trim().min(1, 'Recipient name is required.'),
  email: z
    .string()
    .trim()
    .email('Recipient email must be valid.')
    .transform((value) => value.toLowerCase()),
})

export const emailRecipientWithIdSchema = emailRecipientSchema.extend({
  id: z.string().trim().min(1, 'Recipient id is required.'),
})

export type EmailRecipient = z.infer<typeof emailRecipientSchema>
export type EmailRecipientWithId = z.infer<typeof emailRecipientWithIdSchema>

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmailAddress(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue ? normalizedValue.toLowerCase() : null
}

export function stripHtmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<br\s*\/?>/giu, ' ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function hasMeaningfulHtmlContent(html: string) {
  return stripHtmlToText(html).length > 0
}

export function dedupeRecipientsByEmail<T extends { email: string }>(recipients: T[]) {
  const seenEmails = new Set<string>()

  return recipients.filter((recipient) => {
    const normalizedEmail = normalizeEmailAddress(recipient.email)

    if (!normalizedEmail || seenEmails.has(normalizedEmail)) {
      return false
    }

    seenEmails.add(normalizedEmail)
    return true
  })
}

export function dedupeRecipientsById<T extends { id: string }>(recipients: T[]) {
  const seenIds = new Set<string>()

  return recipients.filter((recipient) => {
    const normalizedId = normalizeText(recipient.id)

    if (!normalizedId || seenIds.has(normalizedId)) {
      return false
    }

    seenIds.add(normalizedId)
    return true
  })
}

export function toEmailRecipient(member: Pick<Member, 'id' | 'name' | 'email'>) {
  const id = normalizeText(member.id)
  const name = normalizeText(member.name)
  const email = normalizeEmailAddress(member.email)

  if (!id || !name || !email) {
    return null
  }

  return {
    id,
    name,
    email,
  } satisfies EmailRecipientWithId
}

function isMemberExpiringSoon(member: Pick<Member, 'status' | 'endTime'>, now: Date) {
  if (member.status !== 'Active' || !member.endTime) {
    return false
  }

  const endTimeMs = Date.parse(member.endTime)

  if (Number.isNaN(endTimeMs)) {
    return false
  }

  const { startInclusive, endExclusive } = getJamaicaExpiringWindow(now)
  const startMs = Date.parse(startInclusive)
  const endMs = Date.parse(endExclusive)

  return endTimeMs >= startMs && endTimeMs < endMs
}

export function resolveDraftEmailRecipients(
  members: Member[],
  options: {
    activeMembers: boolean
    expiringMembers: boolean
    includeMemberTypes: boolean
    memberTypeIds: string[]
    individualIds: string[]
    now?: Date
  },
) {
  const selectedMemberTypeIds = new Set(options.memberTypeIds.map((value) => normalizeText(value)))
  const selectedIndividualIds = new Set(options.individualIds.map((value) => normalizeText(value)))
  const now = options.now ?? new Date()
  const recipients = members.flatMap((member) => {
    const recipient = toEmailRecipient(member)

    if (!recipient) {
      return []
    }

    const matchesActiveMembers = options.activeMembers && member.status === 'Active'
    const matchesExpiringMembers = options.expiringMembers && isMemberExpiringSoon(member, now)
    const matchesMemberType =
      options.includeMemberTypes &&
      member.status === 'Active' &&
      Boolean(member.memberTypeId) &&
      selectedMemberTypeIds.has(normalizeText(member.memberTypeId))
    const matchesIndividual = selectedIndividualIds.has(recipient.id)

    if (
      !matchesActiveMembers &&
      !matchesExpiringMembers &&
      !matchesMemberType &&
      !matchesIndividual
    ) {
      return []
    }

    return [recipient]
  })

  return dedupeRecipientsById(recipients)
}
