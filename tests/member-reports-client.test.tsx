// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  toastMock,
  useMemberExpiredReportMock,
  useMemberSignupsReportMock,
} = vi.hoisted(() => ({
  toastMock: vi.fn(),
  useMemberExpiredReportMock: vi.fn(),
  useMemberSignupsReportMock: vi.fn(),
}))

vi.mock('@/hooks/use-member-reports', () => ({
  useMemberExpiredReport: useMemberExpiredReportMock,
  useMemberSignupsReport: useMemberSignupsReportMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

import { MemberReportsClient } from '@/app/(app)/reports/members/member-reports-client'

function createRevenueBreakdown(overrides: Partial<{
  byType: Array<{ label: string; total: number; isEstimate: boolean }>
  total: number
  hasEstimates: boolean
}> = {}) {
  return {
    byType: [
      { label: 'General', total: 12000, isEstimate: false },
      { label: 'Card Fees', total: 3500, isEstimate: false },
      { label: 'Estimated (no payment recorded)', total: 7500, isEstimate: true },
    ],
    total: 23000,
    hasEstimates: true,
    ...overrides,
  }
}

function createSignupReport(count = 2) {
  return {
    members: Array.from({ length: count }, (_, index) => ({
      id: `signup-${index + 1}`,
      name: `Signup ${index + 1}`,
      type: 'General' as const,
      status: 'Active' as const,
      joinedAt: `2026-04-${String(index + 1).padStart(2, '0')}`,
    })),
    revenueBreakdown: createRevenueBreakdown(),
  }
}

function createExpiredReport(count = 1) {
  return {
    members: Array.from({ length: count }, (_, index) => ({
      id: `expired-${index + 1}`,
      name: `Expired ${index + 1}`,
      type: 'Civil Servant' as const,
      status: 'Expired' as const,
      expiryDate: `2026-04-${String(index + 10).padStart(2, '0')}`,
    })),
    revenueBreakdown: createRevenueBreakdown({
      byType: [
        { label: 'Civil Servant', total: 15000, isEstimate: false },
        { label: 'Estimated (no payment recorded)', total: 7500, isEstimate: true },
      ],
      total: 22500,
    }),
  }
}

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

describe('MemberReportsClient', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T15:00:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.history.replaceState({}, '', '/reports/members')
    toastMock.mockReset()
    useMemberSignupsReportMock.mockImplementation((_startDate, _endDate, options) => ({
      report: createSignupReport(),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      enabled: options?.enabled,
    }))
    useMemberExpiredReportMock.mockImplementation((_startDate, _endDate, options) => ({
      report: createExpiredReport(),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      enabled: options?.enabled,
    }))
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  async function renderClient() {
    await act(async () => {
      root.render(<MemberReportsClient />)
    })
  }

  it('loads the signup report for this month by default', async () => {
    await renderClient()

    expect(useMemberSignupsReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(useMemberExpiredReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
    expect(container.textContent).toContain('2 members signed up in This Month')
    expect(container.textContent).toContain('Download PDF')
    expect(container.textContent).toContain('Revenue Breakdown')
    expect(container.textContent).toContain('Estimated (no payment recorded)')
    expect(container.textContent).toContain('Total Revenue')
    expect(container.textContent).toContain('Est.')
  })

  it('opens the matching expired tab and filter from deep links', async () => {
    window.history.replaceState({}, '', '/reports/members?tab=expired&period=this-month')

    await renderClient()

    expect(useMemberSignupsReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: false }),
    )
    expect(useMemberExpiredReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
    expect(container.textContent).toContain('1 memberships expired in This Month')
    expect(container.textContent).toContain('Download PDF')
    expect(container.textContent).toContain('Revenue Breakdown')
    expect(container.textContent).toContain('Civil Servant')
  })

  it('validates reversed custom ranges before applying filters', async () => {
    await renderClient()

    await clickButton(container, 'Custom Range')

    const startInput = container.querySelector('#member-reports-start-date')
    const endInput = container.querySelector('#member-reports-end-date')

    if (!(startInput instanceof HTMLInputElement) || !(endInput instanceof HTMLInputElement)) {
      throw new Error('Expected custom range inputs to be rendered.')
    }

    await setInputValue(startInput, '2026-04-12')
    await setInputValue(endInput, '2026-04-10')
    await clickButton(container, 'Apply')

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Invalid date range',
      }),
    )
    expect(window.location.search).toBe('')
    expect(useMemberSignupsReportMock).toHaveBeenLastCalledWith(
      '2026-04-01',
      '2026-04-30',
      expect.objectContaining({ enabled: true }),
    )
  })

  it('hides the revenue breakdown when the filtered report has no members', async () => {
    useMemberSignupsReportMock.mockImplementation((_startDate, _endDate, options) => ({
      report: {
        members: [],
        revenueBreakdown: createRevenueBreakdown({
          byType: [],
          total: 0,
          hasEstimates: false,
        }),
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      enabled: options?.enabled,
    }))

    await renderClient()

    expect(container.textContent).toContain('No members signed up in the selected period.')
    expect(container.textContent).not.toContain('Revenue Breakdown')
    expect(container.textContent).not.toContain('Total Revenue')
  })

  it('renders the expired tab revenue breakdown after switching tabs', async () => {
    await renderClient()

    await clickButton(container, 'Expired')

    expect(container.textContent).toContain('1 memberships expired in This Month')
    expect(container.textContent).toContain('Revenue Breakdown')
    expect(container.textContent).toContain('Civil Servant')
    expect(container.textContent).toContain('Estimated (no payment recorded)')
    expect(container.textContent).toContain('Est.')
  })

  it('paginates 50 rows per page and syncs the page number into the URL', async () => {
    useMemberSignupsReportMock.mockImplementation((_startDate, _endDate, options) => ({
      report: createSignupReport(51),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      enabled: options?.enabled,
    }))

    await renderClient()

    expect(container.textContent).toContain('Showing 1-50 of 51')
    expect(container.textContent).toContain('Revenue Breakdown')
    expect(container.textContent).toContain('23,000')

    const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

    if (!(nextPageButton instanceof HTMLButtonElement)) {
      throw new Error('Next page button not found.')
    }

    await act(async () => {
      nextPageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('Showing 51-51 of 51')
    expect(window.location.search).toBe('?tab=signups&period=this-month&page=2')
    expect(container.textContent).toContain('Revenue Breakdown')
    expect(container.textContent).toContain('23,000')
  })
})
