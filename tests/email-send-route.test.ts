import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

type DeliveryRecord = {
  senderProfileId: string
  sendDate: string
  idempotencyKey: string
  recipientEmail: string
  status: 'pending' | 'sent'
  providerMessageId: string | null
  sentAt: string | null
  createdAt: string
}

type DeliveryStoreOptions = {
  markFailuresByRecipient?: Record<string, number>
  onReleasePendingDelivery?: (input: {
    senderProfileId: string
    idempotencyKey: string
    recipientEmail: string
  }) => void
}

const {
  createSupabaseAdminEmailDeliveryStoreMock,
  getSupabaseAdminClientMock,
} = vi.hoisted(() => ({
  createSupabaseAdminEmailDeliveryStoreMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/admin-email-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-email-server')>(
    '@/lib/admin-email-server',
  )

  return {
    ...actual,
    createSupabaseAdminEmailDeliveryStore: createSupabaseAdminEmailDeliveryStoreMock,
  }
})

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { POST } from '@/app/api/email/send/route'
import {
  ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS,
  createAdminEmailProviderIdempotencyKey,
} from '@/lib/admin-email-server'

function createSuccessResponse(id = 'resend-1') {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function createProviderErrorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function createSendRequest(input: {
  subject?: string
  body?: string
  recipients?: Array<{ name: string; email: string }>
  attachment?: File
  idempotencyKey?: string
}) {
  const formData = new FormData()

  formData.set('subject', input.subject ?? 'Hello members')
  formData.set('body', input.body ?? '<p>Hello team</p>')
  formData.set(
    'recipients',
    JSON.stringify(
      input.recipients ?? [
        { name: 'Alpha', email: 'alpha@example.com' },
        { name: 'Beta', email: 'beta@example.com' },
      ],
    ),
  )
  formData.set(
    'idempotencyKey',
    input.idempotencyKey ?? '11111111-1111-4111-8111-111111111111',
  )

  if (input.attachment) {
    formData.set('attachment', input.attachment)
  }

  return new Request('http://localhost/api/email/send', {
    method: 'POST',
    body: formData,
  })
}

function isActivePendingDelivery(record: DeliveryRecord) {
  if (record.status !== 'pending') {
    return false
  }

  const createdAtMs = Date.parse(record.createdAt)

  return Number.isFinite(createdAtMs) && Date.now() - createdAtMs < ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS
}

function createDeliveryStore(records: DeliveryRecord[], options: DeliveryStoreOptions = {}) {
  const markFailuresByRecipient = new Map(Object.entries(options.markFailuresByRecipient ?? {}))

  return {
    async reserveDailyQuota(input: {
      senderProfileId: string
      sendDate: string
      requestedCount: number
    }) {
      const configuredLimit = parseInt(process.env.RESEND_DAILY_EMAIL_LIMIT ?? '100', 10)
      const dailyLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 100
      const usedCount = records.filter(
        (record) =>
          record.senderProfileId === input.senderProfileId &&
          record.sendDate === input.sendDate &&
          (record.status === 'sent' || isActivePendingDelivery(record)),
      ).length

      return Math.min(input.requestedCount, Math.max(0, dailyLimit - usedCount))
    },
    async readSentRecipientEmails(input: { senderProfileId: string; idempotencyKey: string }) {
      return records
        .filter(
          (record) =>
            record.senderProfileId === input.senderProfileId &&
            record.idempotencyKey === input.idempotencyKey &&
            record.status === 'sent',
        )
        .map((record) => record.recipientEmail)
    },
    async reserveDelivery(input: {
      senderProfileId: string
      sendDate: string
      idempotencyKey: string
      recipientEmail: string
    }) {
      const duplicateIndex = records.findIndex(
        (record) =>
          record.senderProfileId === input.senderProfileId &&
          record.idempotencyKey === input.idempotencyKey &&
          record.recipientEmail === input.recipientEmail,
      )

      if (duplicateIndex >= 0) {
        const duplicate = records[duplicateIndex]

        if (duplicate?.status === 'sent') {
          return false
        }

        const createdAtMs = Date.parse(duplicate?.createdAt ?? '')
        const isStale = !Number.isFinite(createdAtMs) || !isActivePendingDelivery(duplicate)

        if (!isStale) {
          return true
        }

        records.splice(duplicateIndex, 1)
      }

      records.push({
        senderProfileId: input.senderProfileId,
        sendDate: input.sendDate,
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.recipientEmail,
        status: 'pending',
        providerMessageId: null,
        sentAt: null,
        createdAt: new Date().toISOString(),
      })

      return true
    },
    async markDeliverySent(input: {
      senderProfileId: string
      idempotencyKey: string
      recipientEmail: string
      providerMessageId: string | null
      sentAt: string
    }) {
      const remainingFailures = markFailuresByRecipient.get(input.recipientEmail) ?? 0

      if (remainingFailures > 0) {
        markFailuresByRecipient.set(input.recipientEmail, remainingFailures - 1)
        throw new Error('Failed to mark admin email delivery as sent: write exploded.')
      }

      const record = records.find(
        (candidate) =>
          candidate.senderProfileId === input.senderProfileId &&
          candidate.idempotencyKey === input.idempotencyKey &&
          candidate.recipientEmail === input.recipientEmail &&
          candidate.status === 'pending',
      )

      if (!record) {
        const existingSentRecord = records.find(
          (candidate) =>
            candidate.senderProfileId === input.senderProfileId &&
            candidate.idempotencyKey === input.idempotencyKey &&
            candidate.recipientEmail === input.recipientEmail &&
            candidate.status === 'sent',
        )

        if (existingSentRecord) {
          return
        }

        throw new Error('Failed to mark admin email delivery as sent: reservation not found.')
      }

      record.status = 'sent'
      record.providerMessageId = input.providerMessageId
      record.sentAt = input.sentAt
    },
    async releasePendingDelivery(input: {
      senderProfileId: string
      idempotencyKey: string
      recipientEmail: string
    }) {
      options.onReleasePendingDelivery?.(input)

      const recordIndex = records.findIndex(
        (candidate) =>
          candidate.senderProfileId === input.senderProfileId &&
          candidate.idempotencyKey === input.idempotencyKey &&
          candidate.recipientEmail === input.recipientEmail &&
          candidate.status === 'pending',
      )

      if (recordIndex >= 0) {
        records.splice(recordIndex, 1)
      }
    },
  }
}

describe('POST /api/email/send', () => {
  let deliveries: DeliveryRecord[]

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetServerAuthMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM
    delete process.env.RESEND_DAILY_EMAIL_LIMIT
    deliveries = []
    createSupabaseAdminEmailDeliveryStoreMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
  })

  function configureDeliveryStore(
    initialRecords: DeliveryRecord[] = [],
    options: DeliveryStoreOptions = {},
  ) {
    deliveries = initialRecords.map((record) => ({ ...record }))
    getSupabaseAdminClientMock.mockReturnValue({})
    createSupabaseAdminEmailDeliveryStoreMock.mockImplementation(() =>
      createDeliveryStore(deliveries, options),
    )
  }

  it('deduplicates recipients, enforces the persisted daily limit, and forwards attachments to Resend', async () => {
    configureDeliveryStore()
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    process.env.RESEND_DAILY_EMAIL_LIMIT = '2'
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse())

    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      createSendRequest({
        recipients: [
          { name: 'Alpha', email: 'alpha@example.com' },
          { name: 'Alpha Duplicate', email: 'ALPHA@example.com' },
          { name: 'Beta', email: 'beta@example.com' },
          { name: 'Gamma', email: 'gamma@example.com' },
        ],
        attachment: new File(['Attachment contents'], 'note.txt', {
          type: 'text/plain',
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sentCount: 2,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>

    expect(firstPayload).toMatchObject({
      from: 'Evolutionz Fitness <reminders@example.com>',
      to: ['alpha@example.com'],
      subject: 'Hello members',
      html: '<p>Hello team</p>',
      text: 'Hello team',
    })
    expect(firstHeaders['Idempotency-Key']).toBe(
      createAdminEmailProviderIdempotencyKey({
        draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
      }),
    )
    expect(secondHeaders['Idempotency-Key']).toBe(
      createAdminEmailProviderIdempotencyKey({
        draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'beta@example.com',
      }),
    )
    expect(firstPayload.attachments).toHaveLength(1)
    expect(firstPayload.attachments[0]).toMatchObject({
      filename: 'note.txt',
      content_type: 'text/plain',
    })
    expect(firstPayload.attachments[0].content).toBe(
      Buffer.from('Attachment contents').toString('base64'),
    )
    expect(deliveries).toHaveLength(2)
    expect(deliveries.every((record) => record.status === 'sent')).toBe(true)
  })

  it('persists sent counts across requests and skips recipients once the daily quota is exhausted', async () => {
    configureDeliveryStore()
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    process.env.RESEND_DAILY_EMAIL_LIMIT = '2'
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse())

    vi.stubGlobal('fetch', fetchMock)

    const firstResponse = await POST(
      createSendRequest({
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
    )

    expect(firstResponse.status).toBe(200)

    const secondResponse = await POST(
      createSendRequest({
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        recipients: [{ name: 'Gamma', email: 'gamma@example.com' }],
      }),
    )

    expect(secondResponse.status).toBe(200)
    await expect(secondResponse.json()).resolves.toEqual({
      ok: true,
      sentCount: 0,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(deliveries).toHaveLength(2)
  })

  it('counts fresh pending deliveries toward the daily quota before sending', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T12:00:00.000Z'))

    configureDeliveryStore([
      {
        senderProfileId: 'user-1',
        sendDate: '2026-04-11',
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
        recipientEmail: 'held@example.com',
        status: 'pending',
        providerMessageId: null,
        sentAt: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ])
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    process.env.RESEND_DAILY_EMAIL_LIMIT = '2'
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse())

    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      createSendRequest({
        idempotencyKey: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sentCount: 1,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(deliveries).toEqual([
      expect.objectContaining({
        recipientEmail: 'held@example.com',
        status: 'pending',
      }),
      expect.objectContaining({
        recipientEmail: 'alpha@example.com',
        status: 'sent',
      }),
    ])
  })

  it('retries accepted sends when marking them sent fails before eventually persisting them', async () => {
    const releasePendingDeliverySpy = vi.fn()

    configureDeliveryStore([], {
      markFailuresByRecipient: {
        'alpha@example.com': 1,
      },
      onReleasePendingDelivery: releasePendingDeliverySpy,
    })
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse('resend-mark-retry'))

    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      createSendRequest({
        recipients: [{ name: 'Alpha', email: 'alpha@example.com' }],
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sentCount: 1,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })
    expect(releasePendingDeliverySpy).not.toHaveBeenCalled()
    expect(deliveries).toEqual([
      expect.objectContaining({
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recipientEmail: 'alpha@example.com',
        status: 'sent',
        providerMessageId: 'resend-mark-retry',
      }),
    ])
  })

  it('reuses the delivery log on retries and releases definite provider failures', async () => {
    const releasePendingDeliverySpy = vi.fn()

    configureDeliveryStore([], {
      onReleasePendingDelivery: releasePendingDeliverySpy,
    })
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createSuccessResponse('resend-1'))
      .mockResolvedValueOnce(createProviderErrorResponse('Resend exploded'))
      .mockResolvedValueOnce(createSuccessResponse('resend-2'))

    vi.stubGlobal('fetch', fetchMock)

    const firstResponse = await POST(
      createSendRequest({
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      }),
    )

    expect(firstResponse.status).toBe(502)
    await expect(firstResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Resend exploded 1 email sent, 1 failed.',
      sentCount: 1,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })
    expect(releasePendingDeliverySpy).toHaveBeenCalledTimes(1)
    expect(releasePendingDeliverySpy).toHaveBeenCalledWith({
      senderProfileId: 'user-1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      recipientEmail: 'beta@example.com',
    })
    expect(deliveries).toEqual([
      expect.objectContaining({
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        recipientEmail: 'alpha@example.com',
        status: 'sent',
      }),
    ])

    const retryResponse = await POST(
      createSendRequest({
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      }),
    )

    expect(retryResponse.status).toBe(200)
    await expect(retryResponse.json()).resolves.toEqual({
      ok: true,
      sentCount: 1,
      alreadySentCount: 1,
      skippedDueToQuotaCount: 0,
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(deliveries).toEqual([
      expect.objectContaining({
        recipientEmail: 'alpha@example.com',
        status: 'sent',
      }),
      expect.objectContaining({
        recipientEmail: 'beta@example.com',
        status: 'sent',
      }),
    ])
  })

  it('retries fresh pending reservations instead of counting them as already sent', async () => {
    const freshPendingCreatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    configureDeliveryStore([
      {
        senderProfileId: 'user-1',
        sendDate: '2026-04-11',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
        recipientEmail: 'alpha@example.com',
        status: 'pending',
        providerMessageId: null,
        sentAt: null,
        createdAt: freshPendingCreatedAt,
      },
    ])
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse('resend-fresh'))

    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      createSendRequest({
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sentCount: 2,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(deliveries).toEqual([
      expect.objectContaining({
        recipientEmail: 'alpha@example.com',
        status: 'sent',
      }),
      expect.objectContaining({
        recipientEmail: 'beta@example.com',
        status: 'sent',
      }),
    ])
  })

  it('recycles stale pending reservations before retrying the send', async () => {
    const stalePendingCreatedAt = new Date(
      Date.now() - ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS - 1_000,
    ).toISOString()

    configureDeliveryStore([
      {
        senderProfileId: 'user-1',
        sendDate: '2026-04-11',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
        recipientEmail: 'alpha@example.com',
        status: 'pending',
        providerMessageId: null,
        sentAt: null,
        createdAt: stalePendingCreatedAt,
      },
    ])
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse('resend-stale'))

    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      createSendRequest({
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sentCount: 2,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      deliveries.find((record) => record.recipientEmail === 'alpha@example.com')?.createdAt,
    ).not.toBe(stalePendingCreatedAt)
  })

  it('rejects rich text bodies that are visually empty', async () => {
    configureDeliveryStore()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      createSendRequest({
        body: '<p> </p>',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Body is required.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps ambiguous timeout reservations pending and retries with the same provider idempotency key', async () => {
    configureDeliveryStore()
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal

        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const abortError = new Error('Aborted')
              abortError.name = 'AbortError'
              reject(abortError)
            },
            { once: true },
          )
        })
      })
      .mockResolvedValueOnce(createSuccessResponse('resend-timeout-retry'))

    vi.stubGlobal('fetch', fetchMock)

    const firstResponsePromise = POST(
      createSendRequest({
        recipients: [{ name: 'Alpha', email: 'alpha@example.com' }],
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      }),
    )

    await vi.advanceTimersByTimeAsync(10_000)

    const firstResponse = await firstResponsePromise

    expect(firstResponse.status).toBe(502)
    await expect(firstResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Timed out while sending the email. 0 emails sent, 1 failed.',
      sentCount: 0,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })
    expect(deliveries).toEqual([
      expect.objectContaining({
        recipientEmail: 'alpha@example.com',
        status: 'pending',
      }),
    ])

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    const secondResponse = await POST(
      createSendRequest({
        recipients: [{ name: 'Alpha', email: 'alpha@example.com' }],
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      }),
    )

    expect(secondResponse.status).toBe(200)
    await expect(secondResponse.json()).resolves.toEqual({
      ok: true,
      sentCount: 1,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })

    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>
    const expectedProviderIdempotencyKey = createAdminEmailProviderIdempotencyKey({
      draftIdempotencyKey: '44444444-4444-4444-8444-444444444444',
      recipientEmail: 'alpha@example.com',
    })

    expect(firstHeaders['Idempotency-Key']).toBe(expectedProviderIdempotencyKey)
    expect(secondHeaders['Idempotency-Key']).toBe(expectedProviderIdempotencyKey)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(deliveries).toEqual([
      expect.objectContaining({
        recipientEmail: 'alpha@example.com',
        status: 'sent',
        providerMessageId: 'resend-timeout-retry',
      }),
    ])
  })

  it('returns 401 when the user is not authenticated as an admin', async () => {
    configureDeliveryStore()
    mockUnauthorized()

    const response = await POST(createSendRequest({}))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })
})
