import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockAdminUser, mockUnauthorized, requireAdminUserMock, resetServerAuthMocks } from '@/tests/support/server-auth'

const {
  createSupabaseMembershipExpiryEmailReminderStoreMock,
  getSupabaseAdminClientMock,
  runMembershipExpiryEmailRemindersMock,
} = vi.hoisted(() => ({
  createSupabaseMembershipExpiryEmailReminderStoreMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  runMembershipExpiryEmailRemindersMock: vi.fn(),
}))

vi.mock('@/lib/membership-expiry-email-reminders-server', () => ({
  createSupabaseMembershipExpiryEmailReminderStore:
    createSupabaseMembershipExpiryEmailReminderStoreMock,
  runMembershipExpiryEmailReminders: runMembershipExpiryEmailRemindersMock,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/resend-server', () => ({
  sendResendEmail: vi.fn(),
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/internal/membership-expiry-emails/run/route'

describe('GET /api/internal/membership-expiry-emails/run', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetServerAuthMocks()
    getSupabaseAdminClientMock.mockReset()
    createSupabaseMembershipExpiryEmailReminderStoreMock.mockReset()
    runMembershipExpiryEmailRemindersMock.mockReset()
    delete process.env.CRON_SECRET
  })

  it('runs the reminder job when the bearer token matches CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    const supabase = { tag: 'supabase-client' }
    const store = { tag: 'store' }
    getSupabaseAdminClientMock.mockReturnValue(supabase)
    createSupabaseMembershipExpiryEmailReminderStoreMock.mockReturnValue(store)
    runMembershipExpiryEmailRemindersMock.mockResolvedValue({
      status: 'success',
      startedAt: '2026-04-10T11:00:00.000Z',
      completedAt: '2026-04-10T11:00:30.000Z',
      sentCount: 4,
      skippedCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      message: '4 sent, 1 skipped, 0 duplicates, 0 errors',
    })

    const response = await GET(
      new Request('http://localhost/api/internal/membership-expiry-emails/run', {
        headers: {
          Authorization: 'Bearer cron-secret',
        },
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      summary: {
        status: 'success',
        startedAt: '2026-04-10T11:00:00.000Z',
        completedAt: '2026-04-10T11:00:30.000Z',
        sentCount: 4,
        skippedCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        message: '4 sent, 1 skipped, 0 duplicates, 0 errors',
      },
    })
    expect(requireAdminUserMock).not.toHaveBeenCalled()
    expect(createSupabaseMembershipExpiryEmailReminderStoreMock).toHaveBeenCalledWith(supabase)
    expect(runMembershipExpiryEmailRemindersMock).toHaveBeenCalledWith({
      store,
      sendEmail: expect.any(Function),
    })
  })

  it('allows an authenticated admin to run the job without the cron bearer header when CRON_SECRET is configured', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    mockAdminUser()
    const supabase = { tag: 'supabase-client' }
    const store = { tag: 'store' }
    getSupabaseAdminClientMock.mockReturnValue(supabase)
    createSupabaseMembershipExpiryEmailReminderStoreMock.mockReturnValue(store)
    runMembershipExpiryEmailRemindersMock.mockResolvedValue({
      status: 'success',
      startedAt: '2026-04-10T11:00:00.000Z',
      completedAt: '2026-04-10T11:00:30.000Z',
      sentCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      message: 'Membership expiry email reminders are disabled.',
    })

    const response = await GET(new Request('http://localhost/api/internal/membership-expiry-emails/run'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      summary: {
        status: 'success',
        startedAt: '2026-04-10T11:00:00.000Z',
        completedAt: '2026-04-10T11:00:30.000Z',
        sentCount: 0,
        skippedCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        message: 'Membership expiry email reminders are disabled.',
      },
    })
    expect(requireAdminUserMock).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when neither cron auth nor admin auth succeeds', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    mockUnauthorized()

    const response = await GET(new Request('http://localhost/api/internal/membership-expiry-emails/run'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(runMembershipExpiryEmailRemindersMock).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET is missing and admin auth fails', async () => {
    delete process.env.CRON_SECRET
    mockUnauthorized()

    const response = await GET(new Request('http://localhost/api/internal/membership-expiry-emails/run'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 500 when CRON_SECRET is missing after admin auth succeeds', async () => {
    delete process.env.CRON_SECRET
    mockAdminUser()

    const response = await GET(new Request('http://localhost/api/internal/membership-expiry-emails/run'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Missing required server environment variable: CRON_SECRET',
    })
  })
})
