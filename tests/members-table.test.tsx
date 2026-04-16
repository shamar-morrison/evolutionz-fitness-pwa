// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MembersTable } from '@/components/members-table'
import type { Member } from '@/types'

const { pushMock, replaceMock, searchParamsValue } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsValue: {
    value: '',
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/members',
  useSearchParams: () => new URLSearchParams(searchParamsValue.value),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    replace: (href: string) => {
      replaceMock(href)
      searchParamsValue.value = new URL(href, 'http://localhost').search.replace(/^\?/u, '')
    },
    back: vi.fn(),
    forward: vi.fn(),
  }),
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
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
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
    SelectTrigger: ({ children, className }: React.ComponentProps<'button'>) => (
      <button type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: () => {
      const context = React.useContext(SelectContext)

      return <span>{context?.value ?? ''}</span>
    },
  }
})

function createMember(overrides: Partial<Member> = {}): Member {
  const name = overrides.name ?? 'Member Name'
  const id = overrides.id ?? name.toLowerCase().replace(/\s+/gu, '-')
  const beginTime = Object.prototype.hasOwnProperty.call(overrides, 'beginTime')
    ? overrides.beginTime ?? null
    : '2026-01-01T00:00:00.000Z'
  const endTime = Object.prototype.hasOwnProperty.call(overrides, 'endTime')
    ? overrides.endTime ?? null
    : '2026-01-31T23:59:59.000Z'

  return {
    id,
    employeeNo: overrides.employeeNo ?? `emp-${id}`,
    name,
    cardNo: overrides.cardNo ?? null,
    cardCode: overrides.cardCode ?? null,
    cardStatus: overrides.cardStatus ?? null,
    cardLostAt: overrides.cardLostAt ?? null,
    slotPlaceholderName: overrides.slotPlaceholderName,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? null,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? null,
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    beginTime,
    endTime,
  }
}

function getBodyRowNames(container: HTMLDivElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((row) => {
    const firstCell = row.querySelector('td')

    return firstCell?.textContent?.trim() ?? ''
  })
}

function getHeaderButton(container: HTMLDivElement, label: string) {
  return Array.from(container.querySelectorAll('thead button')).find((button) =>
    button.textContent?.includes(label),
  )
}

function getHeaderCell(container: HTMLDivElement, label: string) {
  const button = getHeaderButton(container, label)

  return button?.closest('th') ?? null
}

describe('MembersTable', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    pushMock.mockReset()
    replaceMock.mockReset()
    searchParamsValue.value = ''
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

  async function renderTable(members: Member[]) {
    await act(async () => {
      root.render(<MembersTable members={members} />)
    })
  }

  it('initializes page size, page, and sort from URL params', async () => {
    const members = Array.from({ length: 26 }, (_, index) =>
      createMember({
        id: `member-${index + 1}`,
        name: `Member ${String(index + 1).padStart(2, '0')}`,
        beginTime: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    )
    searchParamsValue.value = 'page=2&pageSize=25&sort=beginTime&direction=asc'

    await renderTable(members)

    expect(container.textContent).toContain('Page 2 of 2')
    expect(container.textContent).toContain('25')
    expect(getBodyRowNames(container)).toEqual(['Member 26'])
  })

  it('writes updated page params to the URL and appends returnTo when opening a member', async () => {
    const members = [
      createMember({ id: 'member-juliet', name: 'Juliet', beginTime: '2026-10-01T00:00:00.000Z' }),
      createMember({ id: 'member-bravo', name: 'Bravo', beginTime: '2026-02-01T00:00:00.000Z' }),
      createMember({ id: 'member-hotel', name: 'Hotel', beginTime: '2026-08-01T00:00:00.000Z' }),
      createMember({ id: 'member-alpha', name: 'Alpha', beginTime: '2026-01-01T00:00:00.000Z' }),
      createMember({ id: 'member-echo', name: 'Echo', beginTime: '2026-05-01T00:00:00.000Z' }),
      createMember({ id: 'member-delta', name: 'Delta', beginTime: '2026-04-01T00:00:00.000Z' }),
      createMember({ id: 'member-golf', name: 'Golf', beginTime: '2026-07-01T00:00:00.000Z' }),
      createMember({ id: 'member-foxtrot', name: 'Foxtrot', beginTime: '2026-06-01T00:00:00.000Z' }),
      createMember({ id: 'member-charlie', name: 'Charlie', beginTime: '2026-03-01T00:00:00.000Z' }),
      createMember({ id: 'member-kilo', name: 'Kilo', beginTime: '2026-11-01T00:00:00.000Z' }),
      createMember({ id: 'member-india', name: 'India', beginTime: '2026-09-01T00:00:00.000Z' }),
    ]
    searchParamsValue.value = 'page=2'

    await renderTable(members)

    expect(container.textContent).toContain('Page 2 of 2')
    expect(getBodyRowNames(container)).toEqual(['India'])

    const nextPageFirstRow = container.querySelector('tbody tr')

    if (!(nextPageFirstRow instanceof HTMLTableRowElement)) {
      throw new Error('Expected a data row on page 2.')
    }

    await act(async () => {
      nextPageFirstRow.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pushMock).toHaveBeenCalledWith('/members/member-india?returnTo=%2Fmembers%3Fpage%3D2')

    const previousPageButton = container.querySelector('button[aria-label="Go to previous page"]')

    if (!(previousPageButton instanceof HTMLButtonElement)) {
      throw new Error('Previous page button not found.')
    }

    await act(async () => {
      previousPageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(replaceMock).toHaveBeenLastCalledWith('/members')

    await renderTable(members)

    expect(container.textContent).toContain('Page 1 of 2')
    expect(getBodyRowNames(container)).toEqual([
      'Juliet',
      'Bravo',
      'Hotel',
      'Alpha',
      'Echo',
      'Delta',
      'Golf',
      'Foxtrot',
      'Charlie',
      'Kilo',
    ])
  })

  it('writes sort params to the URL and resets back to page 1 when the sort changes', async () => {
    const members = [
      createMember({
        id: 'member-juliet',
        name: 'Juliet',
        beginTime: '2026-10-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-bravo',
        name: 'Bravo',
        beginTime: '2026-02-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-hotel',
        name: 'Hotel',
        beginTime: '2026-08-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-alpha',
        name: 'Alpha',
        beginTime: '2026-01-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-echo',
        name: 'Echo',
        beginTime: '2026-05-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-delta',
        name: 'Delta',
        beginTime: '2026-04-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-golf',
        name: 'Golf',
        beginTime: '2026-07-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-foxtrot',
        name: 'Foxtrot',
        beginTime: '2026-06-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-charlie',
        name: 'Charlie',
        beginTime: '2026-03-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-kilo',
        name: 'Kilo',
        beginTime: '2026-11-01T00:00:00.000Z',
      }),
      createMember({
        id: 'member-india',
        name: 'India',
        beginTime: '2026-09-01T00:00:00.000Z',
      }),
    ]
    searchParamsValue.value = 'page=2'

    await renderTable(members)

    expect(container.textContent).toContain('Page 2 of 2')

    const startDateButton = getHeaderButton(container, 'Start Date')

    if (!(startDateButton instanceof HTMLButtonElement)) {
      throw new Error('Start Date sort button not found.')
    }

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(replaceMock).toHaveBeenLastCalledWith('/members?sort=beginTime&direction=asc')

    await renderTable(members)

    expect(getBodyRowNames(container)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
      'Foxtrot',
      'Golf',
      'Hotel',
      'India',
      'Juliet',
    ])
    expect(getHeaderCell(container, 'Start Date')?.getAttribute('aria-sort')).toBe('ascending')
    expect(getHeaderButton(container, 'Start Date')?.querySelector('svg')).not.toBeNull()

    const firstDataRow = container.querySelector('tbody tr')

    if (!(firstDataRow instanceof HTMLTableRowElement)) {
      throw new Error('Expected a data row after sorting.')
    }

    await act(async () => {
      firstDataRow.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pushMock).toHaveBeenCalledWith(
      '/members/member-alpha?returnTo=%2Fmembers%3Fsort%3DbeginTime%26direction%3Dasc',
    )

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(replaceMock).toHaveBeenLastCalledWith('/members?sort=beginTime&direction=desc')

    await renderTable(members)

    expect(container.textContent).toContain('Page 1 of 2')
    expect(getBodyRowNames(container)).toEqual([
      'Kilo',
      'Juliet',
      'India',
      'Hotel',
      'Golf',
      'Foxtrot',
      'Echo',
      'Delta',
      'Charlie',
      'Bravo',
    ])
    expect(getHeaderCell(container, 'Start Date')?.getAttribute('aria-sort')).toBe('descending')
    expect(getHeaderButton(container, 'Start Date')?.querySelector('svg')).not.toBeNull()
  })

  it('keeps rows with missing or invalid dates at the bottom for both sort directions from URL state', async () => {
    const members = [
      createMember({
        id: 'member-valid-late',
        name: 'Valid Late',
        beginTime: '2026-12-05T00:00:00.000Z',
      }),
      createMember({
        id: 'member-invalid',
        name: 'Invalid',
        beginTime: 'not-a-date',
      }),
      createMember({
        id: 'member-valid-early',
        name: 'Valid Early',
        beginTime: '2026-01-02T00:00:00.000Z',
      }),
      createMember({
        id: 'member-missing',
        name: 'Missing',
        beginTime: null,
      }),
    ]
    searchParamsValue.value = 'sort=beginTime&direction=asc'

    await renderTable(members)

    expect(getBodyRowNames(container)).toEqual(['Valid Early', 'Valid Late', 'Invalid', 'Missing'])

    const startDateButton = getHeaderButton(container, 'Start Date')

    if (!(startDateButton instanceof HTMLButtonElement)) {
      throw new Error('Start Date sort button not found.')
    }

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await renderTable(members)

    expect(getBodyRowNames(container)).toEqual(['Valid Late', 'Valid Early', 'Invalid', 'Missing'])
  })

  it('writes pageSize to the URL and resets back to page 1 when rows per page changes', async () => {
    const members = [
      createMember({ id: 'member-juliet', name: 'Juliet', beginTime: '2026-10-01T00:00:00.000Z' }),
      createMember({ id: 'member-bravo', name: 'Bravo', beginTime: '2026-02-01T00:00:00.000Z' }),
      createMember({ id: 'member-hotel', name: 'Hotel', beginTime: '2026-08-01T00:00:00.000Z' }),
      createMember({ id: 'member-alpha', name: 'Alpha', beginTime: '2026-01-01T00:00:00.000Z' }),
      createMember({ id: 'member-echo', name: 'Echo', beginTime: '2026-05-01T00:00:00.000Z' }),
      createMember({ id: 'member-delta', name: 'Delta', beginTime: '2026-04-01T00:00:00.000Z' }),
      createMember({ id: 'member-golf', name: 'Golf', beginTime: '2026-07-01T00:00:00.000Z' }),
      createMember({ id: 'member-foxtrot', name: 'Foxtrot', beginTime: '2026-06-01T00:00:00.000Z' }),
      createMember({ id: 'member-charlie', name: 'Charlie', beginTime: '2026-03-01T00:00:00.000Z' }),
      createMember({ id: 'member-kilo', name: 'Kilo', beginTime: '2026-11-01T00:00:00.000Z' }),
      createMember({ id: 'member-india', name: 'India', beginTime: '2026-09-01T00:00:00.000Z' }),
    ]
    searchParamsValue.value = 'page=2'

    await renderTable(members)

    expect(container.textContent).toContain('Page 2 of 2')
    expect(getBodyRowNames(container)).toEqual(['India'])

    await act(async () => {
      const rowsPerPageOption = container.querySelector('button[data-select-item-value="25"]')

      if (!(rowsPerPageOption instanceof HTMLButtonElement)) {
        throw new Error('Rows-per-page option not found.')
      }

      rowsPerPageOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(replaceMock).toHaveBeenLastCalledWith('/members?pageSize=25')

    await renderTable(members)

    expect(container.textContent).toContain('Page 1 of 1')
    expect(container.textContent).toContain('25')
  })
})
