// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MembersTable } from '@/components/members-table'
import type { Member } from '@/types'

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}))

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-value={value}>{children}</div>
    ),
    SelectTrigger: ({ children, className }: React.ComponentProps<'button'>) => (
      <button type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: () => null,
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

  it('preserves the incoming order until a sortable header is clicked', async () => {
    const members = [
      createMember({
        id: 'member-bravo',
        name: 'Bravo',
        beginTime: '2026-02-14T00:00:00.000Z',
        endTime: '2026-04-20T23:59:59.000Z',
      }),
      createMember({
        id: 'member-alpha',
        name: 'Alpha',
        beginTime: '2026-01-10T00:00:00.000Z',
        endTime: '2026-03-18T23:59:59.000Z',
      }),
      createMember({
        id: 'member-delta',
        name: 'Delta',
        beginTime: '2026-04-05T00:00:00.000Z',
        endTime: '2026-01-12T23:59:59.000Z',
      }),
      createMember({
        id: 'member-charlie',
        name: 'Charlie',
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-02-25T23:59:59.000Z',
      }),
    ]

    await act(async () => {
      root.render(<MembersTable members={members} />)
    })

    expect(getBodyRowNames(container)).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie'])
  })

  it('toggles Start Date sorting between ascending and descending and keeps row navigation working', async () => {
    const members = [
      createMember({
        id: 'member-bravo',
        name: 'Bravo',
        beginTime: '2026-02-14T00:00:00.000Z',
      }),
      createMember({
        id: 'member-alpha',
        name: 'Alpha',
        beginTime: '2026-01-10T00:00:00.000Z',
      }),
      createMember({
        id: 'member-delta',
        name: 'Delta',
        beginTime: '2026-04-05T00:00:00.000Z',
      }),
      createMember({
        id: 'member-charlie',
        name: 'Charlie',
        beginTime: '2026-03-01T00:00:00.000Z',
      }),
    ]

    await act(async () => {
      root.render(<MembersTable members={members} />)
    })

    const startDateButton = getHeaderButton(container, 'Start Date')

    if (!(startDateButton instanceof HTMLButtonElement)) {
      throw new Error('Start Date sort button not found.')
    }

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getBodyRowNames(container)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
    expect(getHeaderCell(container, 'Start Date')?.getAttribute('aria-sort')).toBe('ascending')
    expect(getHeaderButton(container, 'Start Date')?.querySelector('svg')).not.toBeNull()

    const firstDataRow = container.querySelector('tbody tr')

    if (!(firstDataRow instanceof HTMLTableRowElement)) {
      throw new Error('Expected a data row after sorting.')
    }

    await act(async () => {
      firstDataRow.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pushMock).toHaveBeenCalledWith('/members/member-alpha')

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getBodyRowNames(container)).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha'])
    expect(getHeaderCell(container, 'Start Date')?.getAttribute('aria-sort')).toBe('descending')
    expect(getHeaderButton(container, 'Start Date')?.querySelector('svg')).not.toBeNull()
  })

  it('toggles End Date sorting and moves the active indicator when switching columns', async () => {
    const members = [
      createMember({
        id: 'member-bravo',
        name: 'Bravo',
        beginTime: '2026-02-14T00:00:00.000Z',
        endTime: '2026-04-20T23:59:59.000Z',
      }),
      createMember({
        id: 'member-alpha',
        name: 'Alpha',
        beginTime: '2026-01-10T00:00:00.000Z',
        endTime: '2026-03-18T23:59:59.000Z',
      }),
      createMember({
        id: 'member-delta',
        name: 'Delta',
        beginTime: '2026-04-05T00:00:00.000Z',
        endTime: '2026-01-12T23:59:59.000Z',
      }),
      createMember({
        id: 'member-charlie',
        name: 'Charlie',
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-02-25T23:59:59.000Z',
      }),
    ]

    await act(async () => {
      root.render(<MembersTable members={members} />)
    })

    const startDateButton = getHeaderButton(container, 'Start Date')
    const endDateButton = getHeaderButton(container, 'End Date')

    if (!(startDateButton instanceof HTMLButtonElement) || !(endDateButton instanceof HTMLButtonElement)) {
      throw new Error('Expected both date sort buttons to render.')
    }

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getHeaderCell(container, 'Start Date')?.getAttribute('aria-sort')).toBe('ascending')
    expect(getHeaderButton(container, 'End Date')?.querySelector('svg')).toBeNull()

    await act(async () => {
      endDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getBodyRowNames(container)).toEqual(['Delta', 'Charlie', 'Alpha', 'Bravo'])
    expect(getHeaderCell(container, 'Start Date')?.getAttribute('aria-sort')).toBeNull()
    expect(getHeaderButton(container, 'Start Date')?.querySelector('svg')).toBeNull()
    expect(getHeaderCell(container, 'End Date')?.getAttribute('aria-sort')).toBe('ascending')
    expect(getHeaderButton(container, 'End Date')?.querySelector('svg')).not.toBeNull()

    await act(async () => {
      endDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getBodyRowNames(container)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta'])
    expect(getHeaderCell(container, 'End Date')?.getAttribute('aria-sort')).toBe('descending')
  })

  it('keeps rows with missing or invalid dates at the bottom for both sort directions', async () => {
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

    await act(async () => {
      root.render(<MembersTable members={members} />)
    })

    const startDateButton = getHeaderButton(container, 'Start Date')

    if (!(startDateButton instanceof HTMLButtonElement)) {
      throw new Error('Start Date sort button not found.')
    }

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getBodyRowNames(container)).toEqual(['Valid Early', 'Valid Late', 'Invalid', 'Missing'])

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getBodyRowNames(container)).toEqual(['Valid Late', 'Valid Early', 'Invalid', 'Missing'])
  })

  it('sorts before pagination and resets back to page 1 when the sort changes', async () => {
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

    await act(async () => {
      root.render(<MembersTable members={members} />)
    })

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

    const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

    if (!(nextPageButton instanceof HTMLButtonElement)) {
      throw new Error('Next page button not found.')
    }

    await act(async () => {
      nextPageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Page 2 of 2')
    expect(getBodyRowNames(container)).toEqual(['India'])

    const startDateButton = getHeaderButton(container, 'Start Date')

    if (!(startDateButton instanceof HTMLButtonElement)) {
      throw new Error('Start Date sort button not found.')
    }

    await act(async () => {
      startDateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Page 1 of 2')
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
  })
})
