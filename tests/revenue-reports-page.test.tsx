import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'

const { redirectMock, createClientMock, readStaffProfileMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  createClientMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
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

vi.mock('@/app/(app)/reports/revenue/revenue-report-client', () => ({
  RevenueReportClient: () => <div>Revenue Reports Client</div>,
}))

import RevenueReportsPage from '@/app/(app)/reports/revenue/page'

function createSupabaseClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  }
}

describe('RevenueReportsPage', () => {
  afterEach(() => {
    createClientMock.mockReset()
    readStaffProfileMock.mockReset()
    redirectMock.mockClear()
  })

  it('redirects unauthenticated users to /login', async () => {
    createClientMock.mockResolvedValue(createSupabaseClient(null))

    await expect(RevenueReportsPage()).rejects.toThrow('redirect:/login')
  })

  it('redirects non-admin users to /unauthorized', async () => {
    createClientMock.mockResolvedValue(createSupabaseClient({ id: 'staff-1' }))
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
      titles: ['Trainer'],
    })

    await expect(RevenueReportsPage()).rejects.toThrow('redirect:/unauthorized')
  })

  it('renders the revenue report client for admins', async () => {
    createClientMock.mockResolvedValue(createSupabaseClient({ id: 'admin-1' }))
    readStaffProfileMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      titles: ['Owner'],
    })

    const page = await RevenueReportsPage()

    expect(isValidElement(page)).toBe(true)
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
