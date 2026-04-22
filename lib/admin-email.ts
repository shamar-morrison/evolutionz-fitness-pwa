import { z } from 'zod'
import { isWithinJamaicaExpiringWindow } from '@/lib/member-access-time'
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

function parseDailyEmailLimit(value: string | undefined) {
  if (!value || !/^\d+$/u.test(value)) {
    return 100
  }

  const configuredLimit = Number.parseInt(value, 10)

  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return 100
  }

  return configuredLimit
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmailAddress(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue ? normalizedValue.toLowerCase() : null
}

export function getResendDailyEmailLimit() {
  return parseDailyEmailLimit(
    process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT ?? process.env.RESEND_DAILY_EMAIL_LIMIT,
  )
}

export function getServerResendDailyEmailLimit() {
  return parseDailyEmailLimit(process.env.RESEND_DAILY_EMAIL_LIMIT)
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

function getRecipientLastName(name: string) {
  const nameParts = normalizeText(name).split(/\s+/u).filter(Boolean)

  return nameParts[nameParts.length - 1] ?? ''
}

function compareNormalizedText(left: string, right: string) {
  return normalizeText(left).localeCompare(normalizeText(right), undefined, {
    sensitivity: 'base',
  })
}

export function compareEmailRecipientsByLastName<T extends { name: string; email: string }>(
  left: T,
  right: T,
) {
  const lastNameComparison = compareNormalizedText(
    getRecipientLastName(left.name),
    getRecipientLastName(right.name),
  )

  if (lastNameComparison !== 0) {
    return lastNameComparison
  }

  const fullNameComparison = compareNormalizedText(left.name, right.name)

  if (fullNameComparison !== 0) {
    return fullNameComparison
  }

  return compareNormalizedText(left.email, right.email)
}

export function sortEmailRecipientsByLastName<T extends { name: string; email: string }>(
  recipients: T[],
) {
  return [...recipients].sort(compareEmailRecipientsByLastName)
}

export function toEmailRecipient(member: Pick<Member, 'id' | 'name' | 'email'>) {
  const id = normalizeText(member.id)
  const name = normalizeText(member.name)
  const email = normalizeEmailAddress(member.email)

  if (!id || !name || !email) {
    return null
  }

  const parsedRecipient = emailRecipientWithIdSchema.safeParse({
    id,
    name,
    email,
  })

  return parsedRecipient.success ? parsedRecipient.data : null
}

function isMemberExpiringSoon(member: Pick<Member, 'status' | 'endTime'>, now: Date) {
  if (member.status !== 'Active' || !member.endTime) {
    return false
  }

  return isWithinJamaicaExpiringWindow(member.endTime, now)
}

export function resolveDraftEmailRecipients(
  members: Member[],
  options: {
    activeMembers: boolean
    expiringMembers: boolean
    expiredMembers: boolean
    activeMemberTypeIds: string[]
    expiringMemberTypeIds: string[]
    expiredMemberTypeIds: string[]
    individualIds: string[]
    now?: Date
  },
) {
  const selectedActiveMemberTypeIds = new Set(
    options.activeMemberTypeIds.map((value) => normalizeText(value)).filter(Boolean),
  )
  const selectedExpiringMemberTypeIds = new Set(
    options.expiringMemberTypeIds.map((value) => normalizeText(value)).filter(Boolean),
  )
  const selectedExpiredMemberTypeIds = new Set(
    options.expiredMemberTypeIds.map((value) => normalizeText(value)).filter(Boolean),
  )
  const selectedIndividualIds = new Set(
    options.individualIds.map((value) => normalizeText(value)).filter(Boolean),
  )
  const now = options.now ?? new Date()
  const recipients = members.flatMap((member) => {
    const recipient = toEmailRecipient(member)

    if (!recipient) {
      return []
    }

    const memberTypeId = normalizeText(member.memberTypeId)
    const matchesActiveMembers =
      options.activeMembers &&
      selectedActiveMemberTypeIds.size > 0 &&
      member.status === 'Active' &&
      selectedActiveMemberTypeIds.has(memberTypeId)
    const matchesExpiringMembers =
      options.expiringMembers &&
      selectedExpiringMemberTypeIds.size > 0 &&
      isMemberExpiringSoon(member, now) &&
      selectedExpiringMemberTypeIds.has(memberTypeId)
    const matchesExpiredMembers =
      options.expiredMembers &&
      selectedExpiredMemberTypeIds.size > 0 &&
      member.status === 'Expired' &&
      selectedExpiredMemberTypeIds.has(memberTypeId)
    const matchesIndividual = selectedIndividualIds.has(recipient.id)

    if (
      !matchesActiveMembers &&
      !matchesExpiringMembers &&
      !matchesExpiredMembers &&
      !matchesIndividual
    ) {
      return []
    }

    return [recipient]
  })

  return dedupeRecipientsById(recipients)
}
