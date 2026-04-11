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

function createDeliveryStore(records: DeliveryRecord[]) {
  return {
    async countSentDeliveriesForDate(input: { senderProfileId: string; sendDate: string }) {
      return records.filter(
        (record) =>
          record.senderProfileId === input.senderProfileId &&
          record.sendDate === input.sendDate &&
          record.status === 'sent',
      ).length
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
      const duplicate = records.some(
        (record) =>
          record.idempotencyKey === input.idempotencyKey &&
          record.recipientEmail === input.recipientEmail,
      )

      if (duplicate) {
        return false
      }

      records.push({
        senderProfileId: input.senderProfileId,
        sendDate: input.sendDate,
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.recipientEmail,
        status: 'pending',
        providerMessageId: null,
        sentAt: null,
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
      const record = records.find(
        (candidate) =>
          candidate.senderProfileId === input.senderProfileId &&
          candidate.idempotencyKey === input.idempotencyKey &&
          candidate.recipientEmail === input.recipientEmail &&
          candidate.status === 'pending',
      )

      if (!record) {
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

  function configureDeliveryStore() {
    deliveries = []
    getSupabaseAdminClientMock.mockReturnValue({})
    createSupabaseAdminEmailDeliveryStoreMock.mockImplementation(() =>
      createDeliveryStore(deliveries),
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

    expect(firstPayload).toMatchObject({
      from: 'Evolutionz Fitness <reminders@example.com>',
      to: ['alpha@example.com'],
      subject: 'Hello members',
      html: '<p>Hello team</p>',
      text: 'Hello team',
    })
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

  it('reuses the delivery log on retries and releases failed pending reservations', async () => {
    configureDeliveryStore()
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

  it('times out hung Resend requests and clears the pending reservation', async () => {
    configureDeliveryStore()
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
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

    vi.stubGlobal('fetch', fetchMock)

    const responsePromise = POST(
      createSendRequest({
        recipients: [{ name: 'Alpha', email: 'alpha@example.com' }],
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      }),
    )

    await vi.advanceTimersByTimeAsync(10_000)

    const response = await responsePromise

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Timed out while sending the email. 0 emails sent, 1 failed.',
      sentCount: 0,
      alreadySentCount: 0,
      skippedDueToQuotaCount: 0,
    })
    expect(deliveries).toEqual([])
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
