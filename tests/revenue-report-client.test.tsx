// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  toastMock,
  useMembershipRevenueReportMock,
  useOverallRevenueReportMock,
  usePtRevenueReportMock,
} = vi.hoisted(() => ({
  toastMock: vi.fn(),
  useMembershipRevenueReportMock: vi.fn(),
  useOverallRevenueReportMock: vi.fn(),
  usePtRevenueReportMock: vi.fn(),
}))

vi.mock('@/hooks/use-revenue-reports', () => ({
  useMembershipRevenueReport: useMembershipRevenueReportMock,
  usePtRevenueReport: usePtRevenueReportMock,
  useOverallRevenueReport: useOverallRevenueReportMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/revenue-reports', async () => {
  const actual = await vi.importActual<typeof import('@/lib/revenue-reports')>('@/lib/revenue-reports')

  return {
    ...actual,
    getRevenueDateRangeForPeriod: (period: string) => {
      switch (period) {
        case 'today':
          return { from: '2026-04-10', to: '2026-04-10' }
        case 'this-week':
          return { from: '2026-04-05', to: '2026-04-11' }
        case 'this-month':
          return { from: '2026-04-01', to: '2026-04-30' }
        case 'this-year':
          return { from: '2026-01-01', to: '2026-12-31' }
        case 'custom':
          return { from: '', to: '' }
        default:
          return { from: '2026-04-01', to: '2026-04-30' }
      }
    },
  }
})

import { RevenueReportClient } from '@/app/(app)/reports/revenue/revenue-report-client'

async function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Input value setter is unavailable.')
  }

  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RevenueReportClient', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    toastMock.mockReset()
    useMembershipRevenueReportMock.mockImplementation(() => ({
      report: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }))
    usePtRevenueReportMock.mockImplementation(() => ({
      report: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }))
    useOverallRevenueReportMock.mockImplementation(() => ({
      report: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }))
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    useMembershipRevenueReportMock.mockReset()
    usePtRevenueReportMock.mockReset()
    useOverallRevenueReportMock.mockReset()
  })

  it('keeps the report queries disabled until Apply is clicked', async () => {
    await act(async () => {
      root.render(<RevenueReportClient />)
    })

    expect(useMembershipRevenueReportMock).toHaveBeenCalledWith(
      '',
      '',
      expect.objectContaining({ enabled: false }),
    )
    expect(usePtRevenueReportMock).toHaveBeenCalledWith(
      '',
      '',
      expect.objectContaining({ enabled: false }),
    )
    expect(useOverallRevenueReportMock).toHaveBeenCalledWith(
      '',
      '',
      expect.objectContaining({ enabled: false }),
    )

    await clickButton(container, 'Apply')
    await flushAsyncWork()

    expect(useMembershipRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(usePtRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
    expect(useOverallRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
  })

  it('validates reversed custom ranges before applying the report filters', async () => {
    await act(async () => {
      root.render(<RevenueReportClient />)
    })

    await clickButton(container, 'Custom Range')

    const fromInput = container.querySelector('#revenue-report-from-date')
    const toInput = container.querySelector('#revenue-report-to-date')

    expect(fromInput).toBeInstanceOf(HTMLInputElement)
    expect(toInput).toBeInstanceOf(HTMLInputElement)

    await setInputValue(fromInput as HTMLInputElement, '2026-04-12')
    await setInputValue(toInput as HTMLInputElement, '2026-04-10')
    await clickButton(container, 'Apply')

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Invalid date range',
      }),
    )
    expect(useMembershipRevenueReportMock).toHaveBeenLastCalledWith(
      '',
      '',
      expect.objectContaining({ enabled: false }),
    )
  })

  it('switches tabs and enables only the active report query after Apply', async () => {
    useMembershipRevenueReportMock.mockImplementation(
      (from: string, to: string, options?: { enabled?: boolean }) => ({
        report:
          from && to && options?.enabled
            ? {
                summary: {
                  totalRevenue: 12000,
                  totalPayments: 1,
                },
                payments: [
                  {
                    id: 'payment-1',
                    memberName: 'Member One',
                    memberTypeName: 'General',
                    amount: 12000,
                    paymentMethod: 'cash',
                    paymentDate: '2026-04-10',
                    notes: 'April renewal',
                  },
                ],
                totalsByMemberType: [
                  {
                    memberTypeName: 'General',
                    totalRevenue: 12000,
                    paymentCount: 1,
                  },
                ],
                totalsByPaymentMethod: [
                  {
                    paymentMethod: 'cash',
                    totalRevenue: 12000,
                    paymentCount: 1,
                  },
                ],
              }
            : null,
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      }),
    )
    usePtRevenueReportMock.mockImplementation(
      (from: string, to: string, options?: { enabled?: boolean }) => ({
        report:
          from && to && options?.enabled
            ? {
                summary: {
                  totalRevenue: 30000,
                  totalSessionsCompleted: 2,
                },
                sessions: [
                  {
                    id: 'session-1',
                    memberName: 'Member Two',
                    trainerName: 'Jordan Trainer',
                    ptFee: 15000,
                    sessionDate: '2026-04-10T09:00:00-05:00',
                  },
                ],
                totalsByTrainer: [
                  {
                    trainerId: 'trainer-1',
                    trainerName: 'Jordan Trainer',
                    totalRevenue: 30000,
                    sessionCount: 2,
                  },
                ],
              }
            : null,
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      }),
    )
    useOverallRevenueReportMock.mockImplementation(
      (from: string, to: string, options?: { enabled?: boolean }) => ({
        report:
          from && to && options?.enabled
            ? {
                summary: {
                  grandTotal: 42000,
                  membershipRevenue: 12000,
                  ptRevenue: 30000,
                },
                breakdown: [
                  {
                    revenueStream: 'Membership',
                    amount: 12000,
                    percentageOfTotal: 28.57,
                  },
                  {
                    revenueStream: 'PT Revenue',
                    amount: 30000,
                    percentageOfTotal: 71.43,
                  },
                ],
              }
            : null,
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      }),
    )

    await act(async () => {
      root.render(<RevenueReportClient />)
    })

    await clickButton(container, 'Apply')
    await flushAsyncWork()

    expect(container.textContent).toContain('Member One')
    expect(useMembershipRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(usePtRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )

    await clickButton(container, 'PT Revenue')
    await flushAsyncWork()

    expect(useMembershipRevenueReportMock).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
    expect(usePtRevenueReportMock).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Total Sessions Completed')

    await clickButton(container, 'Overall')
    await flushAsyncWork()

    expect(useOverallRevenueReportMock).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(container.textContent).toContain('Grand Total Revenue')
    expect(container.textContent).toContain('PT Revenue')
  })
})
