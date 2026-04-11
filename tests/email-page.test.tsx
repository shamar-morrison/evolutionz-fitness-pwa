import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'

const { createClientMock, readStaffProfileMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/staff', () => ({
  readStaffProfile: readStaffProfileMock,
}))

vi.mock('@/app/(app)/email/email-client', () => ({
  EmailClient: ({ resendDailyLimit }: { resendDailyLimit: number }) => (
    <div data-limit={resendDailyLimit}>Email Client</div>
  ),
}))

import EmailPage from '@/app/(app)/email/page'

function createSupabaseClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  }
}

describe('EmailPage', () => {
  afterEach(() => {
    createClientMock.mockReset()
    readStaffProfileMock.mockReset()
    redirectMock.mockClear()
    delete process.env.RESEND_DAILY_EMAIL_LIMIT
  })

  it('redirects unauthenticated users to /login', async () => {
    createClientMock.mockResolvedValue(createSupabaseClient(null))

    await expect(EmailPage()).rejects.toThrow('redirect:/login')
  })

  it('redirects non-admin users to /unauthorized', async () => {
    createClientMock.mockResolvedValue(createSupabaseClient({ id: 'staff-1' }))
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
      titles: ['Trainer'],
    })

    await expect(EmailPage()).rejects.toThrow('redirect:/unauthorized')
  })

  it('renders the email client for admins and passes the configured daily limit', async () => {
    process.env.RESEND_DAILY_EMAIL_LIMIT = '125'
    createClientMock.mockResolvedValue(createSupabaseClient({ id: 'admin-1' }))
    readStaffProfileMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      titles: ['Owner'],
    })

    const page = await EmailPage()

    expect(isValidElement(page)).toBe(true)
    expect(page.props.resendDailyLimit).toBe(125)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('falls back to the default daily limit when the configured value is invalid', async () => {
    process.env.RESEND_DAILY_EMAIL_LIMIT = 'invalid'
    createClientMock.mockResolvedValue(createSupabaseClient({ id: 'admin-1' }))
    readStaffProfileMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      titles: ['Owner'],
    })

    const page = await EmailPage()

    expect(isValidElement(page)).toBe(true)
    expect(page.props.resendDailyLimit).toBe(100)
  })
})
