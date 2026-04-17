// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createMemberExtensionRequestMock,
  extendMemberMembershipMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  toastMock,
} = vi.hoisted(() => ({
  createMemberExtensionRequestMock: vi.fn(),
  extendMemberMembershipMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/components/member-duration-select', () => ({
  MemberDurationSelect: ({
    id,
    value,
    onValueChange,
    disabled,
  }: {
    id?: string
    value: string
    onValueChange: (value: '1_month' | '3_months') => void
    disabled?: boolean
  }) => (
    <select
      id={id}
      data-testid="duration-select"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value as '1_month' | '3_months')}
    >
      <option value="">Select duration</option>
      <option value="1_month">1 Month</option>
      <option value="3_months">3 Months</option>
    </select>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    loading,
    ...props
  }: React.ComponentProps<'button'> & { loading?: boolean }) => (
    <button type="button" data-loading={loading ? 'true' : 'false'} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-extension-requests', () => ({
  createMemberExtensionRequest: createMemberExtensionRequestMock,
  extendMemberMembership: extendMemberMembershipMock,
}))

import { ExtendMembershipDialog } from '@/components/extend-membership-dialog'
import type { Member } from '@/types'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? '000611',
    name: overrides.name ?? 'Marcus Brown',
    cardNo: overrides.cardNo ?? null,
    cardCode: overrides.cardCode ?? 'C-001',
    cardStatus: overrides.cardStatus ?? null,
    cardLostAt: overrides.cardLostAt ?? null,
    slotPlaceholderName: overrides.slotPlaceholderName,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? null,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? 'Male',
    email: overrides.email ?? 'marcus@example.com',
    phone: overrides.phone ?? '876-555-0123',
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? '2026-04-01T00:00:00.000Z',
    endTime: overrides.endTime ?? '2026-04-30T23:59:59.000Z',
  }
}

async function changeDuration(value: '1_month' | '3_months') {
  const select = document.querySelector('[data-testid="duration-select"]')

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error('Duration select not found.')
  }

  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(select),
      'value',
    )
    const setValue = descriptor?.set

    if (!setValue) {
      throw new Error('Select value setter is unavailable.')
    }

    setValue.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

async function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ExtendMembershipDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    createMemberExtensionRequestMock.mockReset()
    extendMemberMembershipMock.mockReset()
    invalidateQueriesMock.mockClear()
    onOpenChangeMock.mockReset()
    toastMock.mockReset()
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

  it('shows the Jamaica-local projected end date and submits direct admin extensions', async () => {
    extendMemberMembershipMock.mockResolvedValue({
      newEndTime: '2026-05-28T23:59:59',
    })

    await act(async () => {
      root.render(
        <ExtendMembershipDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
          requiresApproval={false}
        />,
      )
    })

    await changeDuration('1_month')

    expect(container.textContent).toContain('28 May 2026')

    await clickButton('Extend Membership')

    expect(extendMemberMembershipMock).toHaveBeenCalledWith('member-1', {
      duration_days: 28,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'detail', 'member-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'expiring-members'],
    })
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Membership extended',
      description: 'New end date: 28 May 2026.',
    })
  })

  it('shows the approval action text for staff and submits a pending request', async () => {
    createMemberExtensionRequestMock.mockResolvedValue({
      id: 'request-1',
    })

    await act(async () => {
      root.render(
        <ExtendMembershipDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
          requiresApproval
        />,
      )
    })

    await changeDuration('3_months')

    expect(container.textContent).toContain('Submit for Approval')
    expect(container.textContent).toContain('23 July 2026')

    await clickButton('Submit for Approval')

    expect(createMemberExtensionRequestMock).toHaveBeenCalledWith('member-1', {
      duration_days: 84,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberExtensionRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberExtensionRequests', 'pending'],
    })
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Request submitted',
      description: 'Membership extension request submitted for admin approval.',
    })
  })
})
