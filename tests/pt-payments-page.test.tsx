// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { calendarSelectionState, pathnameState, pushMock, replaceMock, toastMock, usePtPaymentsReportMock } =
  vi.hoisted(() => ({
    calendarSelectionState: { value: new Date(2026, 3, 1, 12, 0, 0, 0) },
    pathnameState: { value: '/reports/pt-payments' },
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    toastMock: vi.fn(),
    usePtPaymentsReportMock: vi.fn(),
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

vi.mock('@/hooks/use-pt-scheduling', () => ({
  usePtPaymentsReport: usePtPaymentsReportMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    getCurrentMonthDateRangeInJamaica: () => ({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }),
  }
})

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

import PtPaymentsPage from '@/app/(app)/reports/pt-payments/page'

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

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

async function clickButton(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButton(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('PtPaymentsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    pathnameState.value = '/reports/pt-payments'
    pushMock.mockReset()
    replaceMock.mockReset()
    toastMock.mockReset()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    usePtPaymentsReportMock.mockReset()
  })

  it('keeps the query disabled until Generate Report submits the date range', async () => {
    usePtPaymentsReportMock.mockImplementation(() => ({
      report: null,
      isLoading: false,
      isFetching: false,
      error: null,
    }))

    await act(async () => {
      root.render(<PtPaymentsPage />)
    })

    const startDateTrigger = container.querySelector('#pt-payments-start-date')
    const endDateTrigger = container.querySelector('#pt-payments-end-date')

    expect(startDateTrigger).toBeInstanceOf(HTMLButtonElement)
    expect(startDateTrigger?.textContent).toContain('Apr 1, 2026')
    expect(endDateTrigger).toBeInstanceOf(HTMLButtonElement)
    expect(endDateTrigger?.textContent).toContain('Apr 30, 2026')
    expect(container.textContent).not.toContain('Download PDF')
    expect(usePtPaymentsReportMock).toHaveBeenNthCalledWith(1, '', '')

    await clickButton(container, 'Generate Report')
    await flushAsyncWork()

    expect(usePtPaymentsReportMock).toHaveBeenLastCalledWith('2026-04-01', '2026-04-30')
  })

  it('renders the generated report and only shows Download PDF once data is loaded', async () => {
    usePtPaymentsReportMock.mockImplementation((startDate: string, endDate: string) => ({
      report:
        startDate && endDate
          ? {
              summary: {
                totalAssignments: 2,
                totalSessionsCompleted: 3,
                totalPayout: 21000,
              },
              trainers: [
                {
                  trainerId: 'trainer-1',
                  trainerName: 'Jordan Trainer',
                  trainerTitles: ['Trainer', 'Medical'],
                  activeClients: 2,
                  monthlyPayout: 21000,
                  clients: [
                    {
                      memberId: 'member-1',
                      memberName: 'Member One',
                      ptFee: 14000,
                      sessionsCompleted: 2,
                      sessionsMissed: 1,
                      attendanceRate: 67,
                    },
                    {
                      memberId: 'member-2',
                      memberName: 'Member Two',
                      ptFee: 16000,
                      sessionsCompleted: 1,
                      sessionsMissed: 0,
                      attendanceRate: 100,
                    },
                  ],
                },
              ],
            }
          : null,
      isLoading: false,
      isFetching: false,
      error: null,
    }))

    await act(async () => {
      root.render(<PtPaymentsPage />)
    })

    expect(container.textContent).not.toContain('Download PDF')

    await clickButton(container, 'Generate Report')
    await flushAsyncWork()

    expect(container.textContent).toContain('Download PDF')
    expect(container.textContent).toContain('Total active trainer-client assignments')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Member One')
    expect(container.textContent).toContain('67%')
    expect(container.textContent).toContain('Monthly Payout:')
  })

  it('renders the empty state after an empty report is generated', async () => {
    usePtPaymentsReportMock.mockImplementation((startDate: string, endDate: string) => ({
      report:
        startDate && endDate
          ? {
              summary: {
                totalAssignments: 0,
                totalSessionsCompleted: 0,
                totalPayout: 0,
              },
              trainers: [],
            }
          : null,
      isLoading: false,
      isFetching: false,
      error: null,
    }))

    await act(async () => {
      root.render(<PtPaymentsPage />)
    })

    await selectCalendarDate(container, 'pt-payments-start-date', new Date(2026, 2, 1, 12, 0, 0, 0))
    await selectCalendarDate(container, 'pt-payments-end-date', new Date(2026, 2, 31, 12, 0, 0, 0))

    expect(usePtPaymentsReportMock).toHaveBeenLastCalledWith('', '')

    await clickButton(container, 'Generate Report')
    await flushAsyncWork()

    expect(usePtPaymentsReportMock).toHaveBeenLastCalledWith('2026-03-01', '2026-03-31')
    expect(container.textContent).toContain('No trainer assignments found for the selected period.')
    expect(container.textContent).toContain('Download PDF')
  })
})
