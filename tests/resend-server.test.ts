import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendResendEmail } from '@/lib/resend-server'

describe('sendResendEmail', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM
  })

  it('sends the email payload and clears the timeout after a successful response', async () => {
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.MEMBERSHIP_EXPIRY_EMAIL_FROM = 'Evolutionz Fitness <reminders@example.com>'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-1' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendResendEmail({
        to: 'member@example.com',
        subject: 'Membership expiring',
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      }),
    ).resolves.toEqual({ id: 'resend-1' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts the request after 10 seconds and clears the timeout', async () => {
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

    const sendPromise = sendResendEmail({
      to: 'member@example.com',
      subject: 'Membership expiring',
      text: 'Plain text body',
      html: '<p>HTML body</p>',
    })
    const rejection = expect(sendPromise).rejects.toThrow(
      'Timed out while sending the reminder email.',
    )

    await vi.advanceTimersByTimeAsync(10_000)

    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })
})
