// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { toastMock, usePtPaymentsReportMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  usePtPaymentsReportMock: vi.fn(),
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

import PtPaymentsPage from '@/app/(app)/reports/pt-payments/page'

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

    const startDateInput = container.querySelector('#pt-payments-start-date')
    const endDateInput = container.querySelector('#pt-payments-end-date')

    expect(startDateInput).toBeInstanceOf(HTMLInputElement)
    expect((startDateInput as HTMLInputElement).value).toBe('2026-04-01')
    expect(endDateInput).toBeInstanceOf(HTMLInputElement)
    expect((endDateInput as HTMLInputElement).value).toBe('2026-04-30')
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

    const startDateInput = container.querySelector('#pt-payments-start-date')
    const endDateInput = container.querySelector('#pt-payments-end-date')

    expect(startDateInput).toBeInstanceOf(HTMLInputElement)
    expect(endDateInput).toBeInstanceOf(HTMLInputElement)

    await setInputValue(startDateInput as HTMLInputElement, '2026-03-01')
    await setInputValue(endDateInput as HTMLInputElement, '2026-03-31')

    expect(usePtPaymentsReportMock).toHaveBeenLastCalledWith('', '')

    await clickButton(container, 'Generate Report')
    await flushAsyncWork()

    expect(usePtPaymentsReportMock).toHaveBeenLastCalledWith('2026-03-01', '2026-03-31')
    expect(container.textContent).toContain('No trainer assignments found for the selected period.')
    expect(container.textContent).toContain('Download PDF')
  })
})
