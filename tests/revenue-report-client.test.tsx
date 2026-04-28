// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  calendarSelectionState,
  pathnameState,
  pushMock,
  replaceMock,
  useCardFeeRevenueReportMock,
  toastMock,
  useMembershipRevenueReportMock,
  useOverallRevenueReportMock,
  usePtRevenueReportMock,
} = vi.hoisted(() => ({
  calendarSelectionState: { value: new Date(2026, 3, 1, 12, 0, 0, 0) },
  pathnameState: { value: '/reports/revenue' },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  useCardFeeRevenueReportMock: vi.fn(),
  toastMock: vi.fn(),
  useMembershipRevenueReportMock: vi.fn(),
  useOverallRevenueReportMock: vi.fn(),
  usePtRevenueReportMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}))

vi.mock('@/hooks/use-revenue-reports', () => ({
  useCardFeeRevenueReport: useCardFeeRevenueReportMock,
  useMembershipRevenueReport: useMembershipRevenueReportMock,
  usePtRevenueReport: usePtRevenueReportMock,
  useOverallRevenueReport: useOverallRevenueReportMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    'data-testid': dataTestId,
  }: {
    onSelect?: (date: Date) => void
    'data-testid'?: string
  }) => (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={() => onSelect?.(calendarSelectionState.value)}
    >
      Mock calendar selection
    </button>
  ),
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

function getDateTrigger(container: HTMLDivElement, id: string) {
  const trigger = container.querySelector(`#${id}`)

  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`${id} trigger not found.`)
  }

  return trigger
}

async function selectCalendarDate(container: HTMLDivElement, id: string, value: Date) {
  const trigger = getDateTrigger(container, id)
  const calendarButton = container.querySelector(`[data-testid="${id}-calendar"]`)

  if (!(calendarButton instanceof HTMLButtonElement)) {
    throw new Error(`${id} calendar select button not found.`)
  }

  calendarSelectionState.value = value

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    calendarButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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

function getTableRowByText(container: HTMLDivElement, text: string) {
  const row = Array.from(container.querySelectorAll('tbody tr')).find((candidate) =>
    candidate.textContent?.includes(text),
  )

  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error(`Table row containing "${text}" not found.`)
  }

  return row
}

async function clickTableRow(container: HTMLDivElement, text: string) {
  const row = getTableRowByText(container, text)

  await act(async () => {
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  return row
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
    window.history.replaceState({}, '', '/reports/revenue')
    pathnameState.value = '/reports/revenue'
    pushMock.mockReset()
    replaceMock.mockReset()
    toastMock.mockReset()
    useMembershipRevenueReportMock.mockImplementation(() => ({
      report: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }))
    useCardFeeRevenueReportMock.mockImplementation(() => ({
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
    useCardFeeRevenueReportMock.mockReset()
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
    expect(useCardFeeRevenueReportMock).toHaveBeenCalledWith(
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
    expect(useCardFeeRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
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

    await selectCalendarDate(container, 'revenue-report-from-date', new Date(2026, 3, 12, 12, 0, 0, 0))
    await selectCalendarDate(container, 'revenue-report-to-date', new Date(2026, 3, 10, 12, 0, 0, 0))
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
    expect(useCardFeeRevenueReportMock).toHaveBeenLastCalledWith(
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
                    memberId: 'member-1',
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
                    memberId: 'member-2',
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
    useCardFeeRevenueReportMock.mockImplementation(
      (from: string, to: string, options?: { enabled?: boolean }) => ({
        report:
          from && to && options?.enabled
            ? {
                summary: {
                  totalRevenue: 5000,
                  totalPayments: 2,
                },
                payments: [
                  {
                    id: 'payment-card-fee-1',
                    memberId: 'member-3',
                    memberName: 'Member Three',
                    amount: 2500,
                    paymentMethod: 'cash',
                    paymentDate: '2026-04-08',
                    notes: 'Lost card replacement',
                  },
                ],
                monthlyBreakdown: [
                  {
                    month: '2026-04',
                    totalRevenue: 5000,
                    paymentCount: 2,
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
                  grandTotal: 47000,
                  membershipRevenue: 12000,
                  cardFeeRevenue: 5000,
                  ptRevenue: 30000,
                },
                breakdown: [
                  {
                    revenueStream: 'Membership',
                    amount: 12000,
                    percentageOfTotal: 25.53,
                  },
                  {
                    revenueStream: 'Card Fees',
                    amount: 5000,
                    percentageOfTotal: 10.64,
                  },
                  {
                    revenueStream: 'PT Revenue',
                    amount: 30000,
                    percentageOfTotal: 63.83,
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
    expect(useCardFeeRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
    expect(usePtRevenueReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )

    await clickButton(container, 'Card Fees')
    await flushAsyncWork()

    expect(useCardFeeRevenueReportMock).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(useMembershipRevenueReportMock).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
    expect(container.textContent).toContain('Monthly Breakdown')
    expect(container.textContent).toContain('Member Three')

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
    expect(useCardFeeRevenueReportMock).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
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
    expect(container.textContent).toContain('Card Fee Revenue')
    expect(container.textContent).toContain('PT Revenue')
  })

  it('opens the member detail page from clickable member rows in each revenue tab', async () => {
    window.history.replaceState({}, '', '/reports/revenue?from=2026-04-01&to=2026-04-30')
    pathnameState.value = '/reports/revenue'

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
                    memberId: 'member-1',
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
    useCardFeeRevenueReportMock.mockImplementation(
      (from: string, to: string, options?: { enabled?: boolean }) => ({
        report:
          from && to && options?.enabled
            ? {
                summary: {
                  totalRevenue: 2500,
                  totalPayments: 1,
                },
                payments: [
                  {
                    id: 'payment-card-fee-1',
                    memberId: 'member-3',
                    memberName: 'Member Three',
                    amount: 2500,
                    paymentMethod: 'cash',
                    paymentDate: '2026-04-08',
                    notes: 'Lost card replacement',
                  },
                ],
                monthlyBreakdown: [
                  {
                    month: '2026-04',
                    totalRevenue: 2500,
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
                  totalRevenue: 15000,
                  totalSessionsCompleted: 1,
                },
                sessions: [
                  {
                    id: 'session-1',
                    memberId: 'member-2',
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
                    totalRevenue: 15000,
                    sessionCount: 1,
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

    const membershipRow = await clickTableRow(container, 'Member One')
    expect(membershipRow.className).toContain('cursor-pointer')
    expect(pushMock).toHaveBeenLastCalledWith(
      '/members/member-1?returnTo=%2Freports%2Frevenue%3Ffrom%3D2026-04-01%26to%3D2026-04-30',
    )

    await clickButton(container, 'Card Fees')
    await flushAsyncWork()

    const cardFeeRow = await clickTableRow(container, 'Member Three')
    expect(cardFeeRow.className).toContain('cursor-pointer')
    expect(pushMock).toHaveBeenLastCalledWith(
      '/members/member-3?returnTo=%2Freports%2Frevenue%3Ffrom%3D2026-04-01%26to%3D2026-04-30',
    )

    await clickButton(container, 'PT Revenue')
    await flushAsyncWork()

    const ptRow = await clickTableRow(container, 'Member Two')
    expect(ptRow.className).toContain('cursor-pointer')
    expect(pushMock).toHaveBeenLastCalledWith(
      '/members/member-2?returnTo=%2Freports%2Frevenue%3Ffrom%3D2026-04-01%26to%3D2026-04-30',
    )
  })
})
