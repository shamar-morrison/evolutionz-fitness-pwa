import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  renderMembershipExpiryEmailContent,
} from '@/lib/membership-expiry-email-reminders'
import { runMembershipExpiryEmailReminders } from '@/lib/membership-expiry-email-reminders-server'
import type {
  MembershipExpiryEmailLastRun,
  MembershipExpiryEmailSettings,
} from '@/types'

function buildDuplicateKey(memberId: string, memberEndTime: string, offsetDays: number) {
  return `${memberId}:${memberEndTime}:${offsetDays}`
}

function createReminderStore(options: {
  settings?: MembershipExpiryEmailSettings
  recipientsByOffset?: Record<number, Array<{
    memberId: string
    memberName: string
    email: string | null
    endTime: string
  }>>
  existingSendKeys?: string[]
} = {}) {
  const writtenLastRuns: MembershipExpiryEmailLastRun[] = []
  const reservedSendRecords: Array<{
    memberId: string
    recipientEmail: string
    memberEndTime: string
    offsetDays: number
  }> = []
  const markedSendRecords: Array<{
    memberId: string
    memberEndTime: string
    offsetDays: number
    providerMessageId: string | null
    sentAt: string
  }> = []
  const releasedSendRecords: Array<{
    memberId: string
    memberEndTime: string
    offsetDays: number
  }> = []
  const reservedKeys = new Set<string>()
  const completedKeys = new Set(options.existingSendKeys ?? [])

  return {
    writtenLastRuns,
    reservedSendRecords,
    markedSendRecords,
    releasedSendRecords,
    store: {
      readSettings: vi.fn().mockResolvedValue(
        options.settings ?? {
          enabled: false,
          dayOffsets: [],
          subjectTemplate: 'Reminder',
          bodyTemplate: 'Hello {{member_name}}',
          lastRun: null,
        },
      ),
      writeLastRun: vi.fn(async (lastRun: MembershipExpiryEmailLastRun) => {
        writtenLastRuns.push(lastRun)
      }),
      readRecipientsForOffset: vi.fn(
        async ({ offsetDays }: { offsetDays: number }) =>
          options.recipientsByOffset?.[offsetDays] ?? [],
      ),
      reserveSendRecord: vi.fn(
        async (record: {
          memberId: string
          recipientEmail: string
          memberEndTime: string
          offsetDays: number
        }) => {
          const key = buildDuplicateKey(record.memberId, record.memberEndTime, record.offsetDays)

          if (completedKeys.has(key) || reservedKeys.has(key)) {
            return false
          }

          reservedSendRecords.push(record)
          reservedKeys.add(key)

          return true
        },
      ),
      markSendRecordSent: vi.fn(
        async (record: {
          memberId: string
          memberEndTime: string
          offsetDays: number
          providerMessageId: string | null
          sentAt: string
        }) => {
          const key = buildDuplicateKey(record.memberId, record.memberEndTime, record.offsetDays)

          reservedKeys.delete(key)
          completedKeys.add(key)
          markedSendRecords.push(record)
        },
      ),
      releaseReservedSendRecord: vi.fn(
        async (record: {
          memberId: string
          memberEndTime: string
          offsetDays: number
        }) => {
          const key = buildDuplicateKey(record.memberId, record.memberEndTime, record.offsetDays)

          reservedKeys.delete(key)
          releasedSendRecords.push(record)
        },
      ),
    },
  }
}

describe('membership expiry email reminder helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders the supported reminder template tokens into subject, text, and html', () => {
    const content = renderMembershipExpiryEmailContent({
      subjectTemplate: 'Hi {{member_name}}, your membership expires on {{expiry_date}}',
      bodyTemplate:
        'Hello {{member_name}}\n\nYour membership expires on {{expiry_date}}.\n{{days_until_expiry}} day(s) left.',
      memberName: 'Jane Doe',
      endTime: '2026-04-17T23:59:59Z',
      now: new Date('2026-04-10T13:15:30.000Z'),
    })

    expect(content).toEqual({
      subject: 'Hi Jane Doe, your membership expires on 17 April 2026',
      text:
        'Hello Jane Doe\n\nYour membership expires on 17 April 2026.\n7 day(s) left.',
      html:
        'Hello Jane Doe<br /><br />Your membership expires on 17 April 2026.<br />7 day(s) left.',
    })
  })

  it('computes days_until_expiry from Jamaica-local calendar dates', () => {
    const content = renderMembershipExpiryEmailContent({
      subjectTemplate: 'Expires in {{days_until_expiry}} day(s)',
      bodyTemplate: 'Your membership expires in {{days_until_expiry}} day(s).',
      memberName: 'Jane Doe',
      endTime: '2026-04-14T23:59:59Z',
      now: new Date('2026-04-10T23:45:00.000Z'),
    })

    expect(content).toEqual({
      subject: 'Expires in 4 day(s)',
      text: 'Your membership expires in 4 day(s).',
      html: 'Your membership expires in 4 day(s).',
    })
  })

  it('strips leading synced card codes from member_name when rendering emails', () => {
    const content = renderMembershipExpiryEmailContent({
      subjectTemplate: 'Hi {{member_name}}, your membership expires on {{expiry_date}}',
      bodyTemplate: 'Hello {{member_name}}',
      memberName: 'N39 Matthews Street',
      endTime: '2026-04-17T23:59:59Z',
      now: new Date('2026-04-10T13:15:30.000Z'),
    })

    expect(content).toEqual({
      subject: 'Hi Matthews Street, your membership expires on 17 April 2026',
      text: 'Hello Matthews Street',
      html: 'Hello Matthews Street',
    })
  })

  it('returns a success summary when reminder emails are disabled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T11:00:00.000Z'))

    const { store, writtenLastRuns } = createReminderStore()
    const sendEmail = vi.fn()

    const summary = await runMembershipExpiryEmailReminders({
      store,
      sendEmail,
      now: new Date(),
    })

    expect(summary).toEqual({
      status: 'success',
      startedAt: '2026-04-10T11:00:00.000Z',
      completedAt: '2026-04-10T11:00:00.000Z',
      sentCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      message: 'Membership expiry email reminders are disabled.',
    })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(writtenLastRuns.map((entry) => entry.status)).toEqual(['running', 'success'])
  })

  it('sends due reminders, skips missing emails, and suppresses duplicate sends', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T11:00:00.000Z'))

    const { store, reservedSendRecords, markedSendRecords, releasedSendRecords } = createReminderStore({
      settings: {
        enabled: true,
        dayOffsets: [7, 1],
        subjectTemplate: 'Expires on {{expiry_date}}',
        bodyTemplate: 'Hi {{member_name}}',
        lastRun: null,
      },
      recipientsByOffset: {
        7: [
          {
            memberId: 'member-1',
            memberName: 'Jane Doe',
            email: 'jane@example.com',
            endTime: '2026-04-17T23:59:59Z',
          },
          {
            memberId: 'member-2',
            memberName: 'Duplicate Person',
            email: 'dupe@example.com',
            endTime: '2026-04-17T23:59:59Z',
          },
        ],
        1: [
          {
            memberId: 'member-3',
            memberName: 'Marcus Brown',
            email: null,
            endTime: '2026-04-11T23:59:59Z',
          },
        ],
      },
      existingSendKeys: [buildDuplicateKey('member-2', '2026-04-17T23:59:59Z', 7)],
    })
    const sendEmail = vi.fn().mockResolvedValue({
      id: 'resend-1',
    })

    const summary = await runMembershipExpiryEmailReminders({
      store,
      sendEmail,
      now: new Date(),
    })

    expect(store.readRecipientsForOffset).toHaveBeenNthCalledWith(1, {
      offsetDays: 7,
      startInclusive: '2026-04-17T00:00:00-05:00',
      endExclusive: '2026-04-18T00:00:00-05:00',
    })
    expect(store.readRecipientsForOffset).toHaveBeenNthCalledWith(2, {
      offsetDays: 1,
      startInclusive: '2026-04-11T00:00:00-05:00',
      endExclusive: '2026-04-12T00:00:00-05:00',
    })
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'jane@example.com',
      subject: 'Expires on 17 April 2026',
      text: 'Hi Jane Doe',
      html: 'Hi Jane Doe',
    })
    expect(reservedSendRecords).toEqual([
      expect.objectContaining({
        memberId: 'member-1',
        recipientEmail: 'jane@example.com',
        memberEndTime: '2026-04-17T23:59:59Z',
        offsetDays: 7,
      }),
    ])
    expect(markedSendRecords).toEqual([
      expect.objectContaining({
        memberId: 'member-1',
        memberEndTime: '2026-04-17T23:59:59Z',
        offsetDays: 7,
        providerMessageId: 'resend-1',
      }),
    ])
    expect(releasedSendRecords).toEqual([])
    expect(summary).toEqual({
      status: 'success',
      startedAt: '2026-04-10T11:00:00.000Z',
      completedAt: '2026-04-10T11:00:00.000Z',
      sentCount: 1,
      skippedCount: 1,
      duplicateCount: 1,
      errorCount: 0,
      message: '1 sent, 1 skipped, 1 duplicates, 0 errors',
    })
  })

  it('returns a partial summary when one or more reminder emails fail', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T11:00:00.000Z'))

    const { store, writtenLastRuns, markedSendRecords, releasedSendRecords } = createReminderStore({
      settings: {
        enabled: true,
        dayOffsets: [3],
        subjectTemplate: 'Expires soon',
        bodyTemplate: 'Hi {{member_name}}',
        lastRun: null,
      },
      recipientsByOffset: {
        3: [
          {
            memberId: 'member-1',
            memberName: 'Jane Doe',
            email: 'jane@example.com',
            endTime: '2026-04-13T23:59:59Z',
          },
          {
            memberId: 'member-2',
            memberName: 'Marcus Brown',
            email: 'marcus@example.com',
            endTime: '2026-04-13T23:59:59Z',
          },
        ],
      },
    })
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'resend-1',
      })
      .mockRejectedValueOnce(new Error('Resend unavailable'))

    const summary = await runMembershipExpiryEmailReminders({
      store,
      sendEmail,
      now: new Date(),
    })

    expect(markedSendRecords).toHaveLength(1)
    expect(releasedSendRecords).toEqual([
      {
        memberId: 'member-2',
        memberEndTime: '2026-04-13T23:59:59Z',
        offsetDays: 3,
      },
    ])
    expect(summary).toEqual({
      status: 'partial',
      startedAt: '2026-04-10T11:00:00.000Z',
      completedAt: '2026-04-10T11:00:00.000Z',
      sentCount: 1,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 1,
      message: 'Resend unavailable',
    })
    expect(writtenLastRuns.at(-1)).toEqual({
      status: 'partial',
      startedAt: '2026-04-10T11:00:00.000Z',
      completedAt: '2026-04-10T11:00:00.000Z',
      sentCount: 1,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 1,
      message: 'Resend unavailable',
    })
  })

  it('writes a failed final summary when the store throws during the run', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T11:00:00.000Z'))

    const { store, writtenLastRuns } = createReminderStore({
      settings: {
        enabled: true,
        dayOffsets: [7],
        subjectTemplate: 'Expires soon',
        bodyTemplate: 'Hi {{member_name}}',
        lastRun: null,
      },
    })

    store.readRecipientsForOffset.mockRejectedValueOnce(new Error('Database unavailable'))

    await expect(
      runMembershipExpiryEmailReminders({
        store,
        sendEmail: vi.fn(),
        now: new Date(),
      }),
    ).rejects.toThrow('Database unavailable')

    expect(writtenLastRuns).toEqual([
      {
        status: 'running',
        startedAt: '2026-04-10T11:00:00.000Z',
        completedAt: null,
        sentCount: 0,
        skippedCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        message: 'Membership expiry reminder run in progress.',
      },
      {
        status: 'failed',
        startedAt: '2026-04-10T11:00:00.000Z',
        completedAt: '2026-04-10T11:00:00.000Z',
        sentCount: 0,
        skippedCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        message: 'Database unavailable',
      },
    ])
  })
})
