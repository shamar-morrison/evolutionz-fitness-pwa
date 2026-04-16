// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

const {
  invalidateQueriesMock,
  refreshDoorHistoryMock,
  refetchMock,
  toastMock,
  useDoorHistoryMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  refreshDoorHistoryMock: vi.fn().mockResolvedValue(undefined),
  refetchMock: vi.fn(),
  toastMock: vi.fn(),
  useDoorHistoryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-door-history', () => ({
  useDoorHistory: (date: string) => useDoorHistoryMock(date),
}))

vi.mock('@/lib/door-history', () => ({
  getDoorHistoryTodayDateValue: () => '2026-04-15',
  formatDoorHistoryEventTime: (value: string) => `formatted:${value}`,
  formatDoorHistoryFetchedAt: (value: string | null) => (value ? `fetched:${value}` : 'Not recorded'),
  refreshDoorHistory: refreshDoorHistoryMock,
  sortDoorHistoryEvents: (events: Array<{ time: string }>) =>
    [...events].sort((leftEvent, rightEvent) => Date.parse(rightEvent.time) - Date.parse(leftEvent.time)),
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const SelectContext = React.createContext<
    | {
        value?: string
        onValueChange?: (value: string) => void
      }
    | undefined
  >(undefined)

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
      value?: string
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value: string
    }) => {
      const context = React.useContext(SelectContext)

      return (
        <button
          type="button"
          data-select-item-value={value}
          onClick={() => context?.onValueChange?.(value)}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, id, className }: React.ComponentProps<'button'>) => (
      <button id={id} type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const context = React.useContext(SelectContext)
      const labels: Record<string, string> = {
        all: 'All',
        denied: 'Denied',
        granted: 'Granted',
      }

      return <span>{labels[context?.value ?? ''] ?? placeholder}</span>
    },
  }
})

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date) => void }) => (
    <button
      type="button"
      data-testid="door-history-calendar-select"
      onClick={() => onSelect?.(new Date(2026, 3, 14, 12, 0, 0, 0))}
    >
      Select April 14
    </button>
  ),
}))

vi.mock('@/components/authenticated-home-redirect', () => ({
  AuthenticatedHomeRedirect: () => <div>redirecting</div>,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

import DoorHistoryPage from '@/app/(app)/door-history/page'

function buildEvent(index: number) {
  return {
    cardNo: `0102857${String(index).padStart(3, '0')}`,
    cardCode: null,
    memberName: `Member ${index}`,
    time: `2026-04-15T00:${String(index).padStart(2, '0')}:00-05:00`,
    accessGranted: index % 2 === 0,
    doorName: null,
    eventType: index % 2 === 0 ? 'Access granted' : 'Access denied',
  }
}

describe('DoorHistoryPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events: [],
        fetchedAt: null,
        totalMatches: 0,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
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
    vi.clearAllMocks()
  })

  it('shows the empty state when no cached data exists for the selected date', async () => {
    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    expect(container.textContent).toContain('No cached door history')
    expect(container.textContent).toContain(
      'Click Refresh to load door access events for Apr. 15, 2026.',
    )
  })

  it('reloads data for the newly selected date', async () => {
    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const dateTrigger = container.querySelector('#door-history-date')
    const calendarSelectButton = container.querySelector('[data-testid="door-history-calendar-select"]')

    if (!(dateTrigger instanceof HTMLButtonElement)) {
      throw new Error('Door history date trigger was not rendered.')
    }

    if (!(calendarSelectButton instanceof HTMLButtonElement)) {
      throw new Error('Door history calendar select button was not rendered.')
    }

    expect(dateTrigger.textContent).toContain('Apr. 15, 2026')

    await act(async () => {
      calendarSelectButton.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    })

    expect(useDoorHistoryMock).toHaveBeenLastCalledWith('2026-04-14')
  })

  it('shows the access filter with the same labeled select pattern used elsewhere in the app', async () => {
    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const accessLabel = container.querySelector('label[for="door-history-access-filter"]')
    const accessTrigger = container.querySelector('#door-history-access-filter')

    expect(accessLabel?.textContent).toBe('Access')
    expect(accessTrigger?.textContent).toContain('All')
  })

  it('refreshes the selected date and invalidates only that query key', async () => {
    const events = [buildEvent(1)]

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const refreshButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Refresh'),
    )

    if (!(refreshButton instanceof HTMLButtonElement)) {
      throw new Error('Refresh button not found.')
    }

    await act(async () => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(refreshDoorHistoryMock).toHaveBeenCalledWith('2026-04-15')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.doorHistory.byDate('2026-04-15'),
    })
  })

  it('shows pagination controls on a single page with disabled navigation buttons', async () => {
    const events = [buildEvent(0)]

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    expect(container.textContent).toContain('1 Row')
    expect(container.textContent).toContain('Page 1 of 1')
    expect(
      (container.querySelector('button[aria-label="Go to first page"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (container.querySelector('button[aria-label="Go to previous page"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (container.querySelector('button[aria-label="Go to next page"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (container.querySelector('button[aria-label="Go to last page"]') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('filters the table to granted events and updates the visible row count', async () => {
    const events = Array.from({ length: 6 }, (_, index) => buildEvent(index))

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const grantedOption = container.querySelector('button[data-select-item-value="granted"]')

    if (!(grantedOption instanceof HTMLButtonElement)) {
      throw new Error('Granted access option not found.')
    }

    await act(async () => {
      grantedOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    const rows = Array.from(container.querySelectorAll('tbody tr'))

    expect(container.querySelector('#door-history-access-filter')?.textContent).toContain('Granted')
    expect(container.textContent).toContain('3 Rows')
    expect(container.textContent).toContain('Page 1 of 1')
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.textContent?.includes('Granted'))).toBe(true)
  })

  it('filters the table to denied events', async () => {
    const events = Array.from({ length: 6 }, (_, index) => buildEvent(index))

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const deniedOption = container.querySelector('button[data-select-item-value="denied"]')

    if (!(deniedOption instanceof HTMLButtonElement)) {
      throw new Error('Denied access option not found.')
    }

    await act(async () => {
      deniedOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    const rows = Array.from(container.querySelectorAll('tbody tr'))

    expect(container.querySelector('#door-history-access-filter')?.textContent).toContain('Denied')
    expect(container.textContent).toContain('3 Rows')
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.textContent?.includes('Denied'))).toBe(true)
  })

  it('sorts newest-first before paginating and shows footer counts from the full dataset', async () => {
    const events = Array.from({ length: 51 }, (_, index) => buildEvent(index))

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const getBodyRows = () => Array.from(container.querySelectorAll('tbody tr'))

    expect(container.textContent).toContain('51 Rows')
    expect(container.textContent).toContain('Page 1 of 2')
    expect(getBodyRows()).toHaveLength(50)
    expect(getBodyRows()[0]?.textContent).toContain('formatted:2026-04-15T00:50:00-05:00')

    const nextButton = container.querySelector('button[aria-label="Go to next page"]')

    if (!(nextButton instanceof HTMLButtonElement)) {
      throw new Error('Next-page button not found.')
    }

    await act(async () => {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('51 Rows')
    expect(container.textContent).toContain('Page 2 of 2')
    expect(getBodyRows()).toHaveLength(1)
    expect(getBodyRows()[0]?.textContent).toContain('formatted:2026-04-15T00:00:00-05:00')
  })

  it('resets to the first page when the access filter changes', async () => {
    const events = Array.from({ length: 51 }, (_, index) => buildEvent(index))

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const nextButton = container.querySelector('button[aria-label="Go to next page"]')

    if (!(nextButton instanceof HTMLButtonElement)) {
      throw new Error('Next-page button not found.')
    }

    await act(async () => {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('Page 2 of 2')

    const deniedOption = container.querySelector('button[data-select-item-value="denied"]')

    if (!(deniedOption instanceof HTMLButtonElement)) {
      throw new Error('Denied access option not found.')
    }

    await act(async () => {
      deniedOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('25 Rows')
    expect(container.textContent).toContain('Page 1 of 1')
    expect(container.querySelector('tbody tr')?.textContent).toContain('formatted:2026-04-15T00:49:00-05:00')
  })

  it('shows filtered empty copy when cached data exists but no rows match the selected access filter', async () => {
    const events = [buildEvent(0), buildEvent(2), buildEvent(4)]

    useDoorHistoryMock.mockImplementation((date: string) => ({
      data: {
        ok: true,
        events,
        fetchedAt: '2026-04-15T12:34:56.000Z',
        totalMatches: events.length,
        cacheDate: date,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }))

    await act(async () => {
      root.render(<DoorHistoryPage />)
    })

    const deniedOption = container.querySelector('button[data-select-item-value="denied"]')

    if (!(deniedOption instanceof HTMLButtonElement)) {
      throw new Error('Denied access option not found.')
    }

    await act(async () => {
      deniedOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('No denied access events found for this date.')
    expect(container.textContent).not.toContain('No cached door history')
  })
})
