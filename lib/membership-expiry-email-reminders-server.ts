import { getJamaicaDayWindow } from '@/lib/member-access-time'
import { renderMembershipExpiryEmailContent } from '@/lib/membership-expiry-email-reminders'
import {
  createMembershipExpiryEmailLastRun,
  readMembershipExpiryEmailSettings,
  type MembershipExpiryEmailSettingsAdminClient,
  updateMembershipExpiryEmailLastRun,
} from '@/lib/membership-expiry-email-settings-server'
import type { MembershipExpiryEmailLastRun, MembershipExpiryEmailSettings } from '@/types'

const MEMBERSHIP_EXPIRY_EMAIL_SENDS_TABLE = 'membership_expiry_email_sends'

export type MembershipExpiryEmailReminderRecipient = {
  memberId: string
  memberName: string
  email: string | null
  endTime: string
}

export type MembershipExpiryEmailSenderInput = {
  to: string
  subject: string
  text: string
  html: string
}

export type MembershipExpiryEmailSenderResult = {
  id: string | null
}

export type MembershipExpiryEmailSender = (
  input: MembershipExpiryEmailSenderInput,
) => Promise<MembershipExpiryEmailSenderResult>

export type MembershipExpiryEmailReminderStore = {
  readSettings(): Promise<MembershipExpiryEmailSettings>
  writeLastRun(lastRun: MembershipExpiryEmailLastRun): Promise<void>
  readRecipientsForOffset(input: {
    offsetDays: number
    startInclusive: string
    endExclusive: string
  }): Promise<MembershipExpiryEmailReminderRecipient[]>
  hasSendRecord(input: {
    memberId: string
    memberEndTime: string
    offsetDays: number
  }): Promise<boolean>
  createSendRecord(input: {
    memberId: string
    recipientEmail: string
    memberEndTime: string
    offsetDays: number
    providerMessageId: string | null
    sentAt: string
  }): Promise<void>
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildRunMessage(summary: MembershipExpiryEmailLastRun) {
  if (summary.message) {
    return summary.message
  }

  return [
    `${summary.sentCount} sent`,
    `${summary.skippedCount} skipped`,
    `${summary.duplicateCount} duplicates`,
    `${summary.errorCount} errors`,
  ].join(', ')
}

export function createSupabaseMembershipExpiryEmailReminderStore(
  supabase: MembershipExpiryEmailSettingsAdminClient,
): MembershipExpiryEmailReminderStore {
  return {
    async readSettings() {
      return readMembershipExpiryEmailSettings(supabase)
    },
    async writeLastRun(lastRun) {
      await updateMembershipExpiryEmailLastRun(supabase, lastRun)
    },
    async readRecipientsForOffset({ startInclusive, endExclusive }) {
      const { data, error } = await supabase
        .from('members')
        .select('id, name, email, end_time')
        .eq('status', 'Active')
        .gte('end_time', startInclusive)
        .lt('end_time', endExclusive)
        .order('end_time', { ascending: true })

      if (error) {
        throw new Error(`Failed to read expiring members for reminders: ${error.message}`)
      }

      return ((data ?? []) as Array<{
        id: string
        name: string
        email: string | null
        end_time: string
      }>).map((row) => ({
        memberId: normalizeText(row.id),
        memberName: normalizeText(row.name),
        email: normalizeText(row.email) || null,
        endTime: normalizeText(row.end_time),
      }))
    },
    async hasSendRecord({ memberId, memberEndTime, offsetDays }) {
      const { data, error } = await supabase
        .from(MEMBERSHIP_EXPIRY_EMAIL_SENDS_TABLE)
        .select('id')
        .eq('member_id', memberId)
        .eq('member_end_time', memberEndTime)
        .eq('offset_days', offsetDays)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to read membership expiry email send records: ${error.message}`)
      }

      return Boolean(data)
    },
    async createSendRecord({
      memberId,
      recipientEmail,
      memberEndTime,
      offsetDays,
      providerMessageId,
      sentAt,
    }) {
      const { error } = await supabase.from(MEMBERSHIP_EXPIRY_EMAIL_SENDS_TABLE).insert({
        member_id: memberId,
        recipient_email: recipientEmail,
        member_end_time: memberEndTime,
        offset_days: offsetDays,
        provider_message_id: providerMessageId,
        sent_at: sentAt,
      })

      if (error) {
        throw new Error(`Failed to record membership expiry email send: ${error.message}`)
      }
    },
  }
}

export async function runMembershipExpiryEmailReminders(input: {
  store: MembershipExpiryEmailReminderStore
  sendEmail: MembershipExpiryEmailSender
  now?: Date
}) {
  const now = input.now ?? new Date()
  const startedAt = now.toISOString()
  const settings = await input.store.readSettings()

  const runningSummary = createMembershipExpiryEmailLastRun({
    status: 'running',
    startedAt,
    completedAt: null,
    message: 'Membership expiry reminder run in progress.',
  })

  await input.store.writeLastRun(runningSummary)

  if (!settings.enabled) {
    const completedSummary = createMembershipExpiryEmailLastRun({
      status: 'success',
      startedAt,
      completedAt: new Date().toISOString(),
      message: 'Membership expiry email reminders are disabled.',
    })

    await input.store.writeLastRun(completedSummary)

    return completedSummary
  }

  if (settings.dayOffsets.length === 0) {
    const completedSummary = createMembershipExpiryEmailLastRun({
      status: 'success',
      startedAt,
      completedAt: new Date().toISOString(),
      message: 'No membership expiry email day offsets are configured.',
    })

    await input.store.writeLastRun(completedSummary)

    return completedSummary
  }

  let sentCount = 0
  let skippedCount = 0
  let duplicateCount = 0
  let errorCount = 0
  let lastErrorMessage: string | null = null

  for (const offsetDays of settings.dayOffsets) {
    const { startInclusive, endExclusive } = getJamaicaDayWindow(now, offsetDays)
    const recipients = await input.store.readRecipientsForOffset({
      offsetDays,
      startInclusive,
      endExclusive,
    })

    for (const recipient of recipients) {
      if (!recipient.email) {
        skippedCount += 1
        continue
      }

      const alreadySent = await input.store.hasSendRecord({
        memberId: recipient.memberId,
        memberEndTime: recipient.endTime,
        offsetDays,
      })

      if (alreadySent) {
        duplicateCount += 1
        continue
      }

      try {
        const emailContent = renderMembershipExpiryEmailContent({
          subjectTemplate: settings.subjectTemplate,
          bodyTemplate: settings.bodyTemplate,
          memberName: recipient.memberName,
          endTime: recipient.endTime,
          now,
        })
        const sendResult = await input.sendEmail({
          to: recipient.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        })
        const sentAt = new Date().toISOString()

        await input.store.createSendRecord({
          memberId: recipient.memberId,
          recipientEmail: recipient.email,
          memberEndTime: recipient.endTime,
          offsetDays,
          providerMessageId: sendResult.id,
          sentAt,
        })

        sentCount += 1
      } catch (error) {
        errorCount += 1
        lastErrorMessage = error instanceof Error ? error.message : 'Unexpected reminder email error.'
      }
    }
  }

  const completedAt = new Date().toISOString()
  const status =
    errorCount > 0 ? (sentCount > 0 ? 'partial' : 'failed') : 'success'
  const finalSummary = createMembershipExpiryEmailLastRun({
    status,
    startedAt,
    completedAt,
    sentCount,
    skippedCount,
    duplicateCount,
    errorCount,
    message: lastErrorMessage,
  })

  await input.store.writeLastRun(finalSummary)

  return {
    ...finalSummary,
    message: buildRunMessage(finalSummary),
  }
}
