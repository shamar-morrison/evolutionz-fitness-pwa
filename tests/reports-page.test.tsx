import { describe, expect, it, vi } from 'vitest'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

import ReportsPage from '@/app/(app)/reports/page'

describe('ReportsPage', () => {
  it('redirects to the PT trainer payments report', () => {
    ReportsPage()

    expect(redirectMock).toHaveBeenCalledWith('/reports/pt-payments')
  })
})
