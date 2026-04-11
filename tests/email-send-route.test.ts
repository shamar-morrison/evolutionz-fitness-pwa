import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

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

function createErrorResponse(message: string, status = 500) {
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

  if (input.attachment) {
    formData.set('attachment', input.attachment)
  }

  return new Request('http://localhost/api/email/send', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/email/send', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetServerAuthMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM
    delete process.env.RESEND_DAILY_EMAIL_LIMIT
  })

  it('deduplicates recipients, respects the daily limit, and forwards attachments to Resend', async () => {
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
  })

  it('rejects rich text bodies that are visually empty', async () => {
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

  it('returns a 502 error when one or more Resend sends fail', async () => {
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createSuccessResponse('resend-1'))
      .mockResolvedValueOnce(createErrorResponse('Resend exploded'))

    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(createSendRequest({}))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Resend exploded 1 email sent, 1 failed.',
    })
  })

  it('returns 401 when the user is not authenticated as an admin', async () => {
    mockUnauthorized()

    const response = await POST(createSendRequest({}))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })
})
