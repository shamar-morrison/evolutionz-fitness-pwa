// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  invalidateQueriesMock,
  reviewMemberApprovalRequestMock,
  toastMock,
  useAvailableCardsMock,
  useMemberApprovalRequestsMock,
} = vi.hoisted(() => ({
  authState: {
    profile: {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin' as const,
      titles: ['Owner'],
    },
    loading: false,
  },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  reviewMemberApprovalRequestMock: vi.fn().mockResolvedValue({}),
  toastMock: vi.fn(),
  useAvailableCardsMock: vi.fn(),
  useMemberApprovalRequestsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-available-cards', () => ({
  useAvailableCards: useAvailableCardsMock,
}))

vi.mock('@/hooks/use-member-approval-requests', () => ({
  useMemberApprovalRequests: useMemberApprovalRequestsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-approval-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-approval-requests')>(
    '@/lib/member-approval-requests',
  )

  return {
    ...actual,
    reviewMemberApprovalRequest: reviewMemberApprovalRequestMock,
  }
})

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    className,
    isLoading = false,
  }: React.ComponentProps<'div'> & { isLoading?: boolean }) => (
    <div className={className} data-is-loading={isLoading ? 'true' : 'false'}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/select', async () => {
  const React = await import('react')

  const SelectContext = React.createContext<{
    disabled?: boolean
    onValueChange?: (value: string) => void
    value?: string
  } | null>(null)

  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onValueChange?: (value: string) => void
      value?: string
    }) => (
      <SelectContext.Provider
        value={{
          disabled,
          onValueChange,
          value: value ?? '',
        }}
      >
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: React.ComponentProps<'button'> & { value: string }) => {
      const context = React.useContext(SelectContext)

      return (
        <button
          type="button"
          onClick={() => context?.onValueChange?.(value)}
          disabled={context?.disabled}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, id }: React.ComponentProps<'button'>) => {
      const context = React.useContext(SelectContext)

      return (
        <button id={id} type="button" disabled={context?.disabled}>
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const context = React.useContext(SelectContext)

      return <span>{context?.value || placeholder}</span>
    },
  }
})

import { PendingMemberRequestsPage } from '@/components/pending-member-requests-page'
import type { MemberApprovalRequest } from '@/types'

function createRequest(overrides: Partial<MemberApprovalRequest> = {}): MemberApprovalRequest {
  return {
    id: overrides.id ?? 'request-1',
    name: overrides.name ?? 'Jane Doe',
    gender: overrides.gender ?? 'Female',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? '876-555-1111',
    remark: overrides.remark ?? 'Wants mornings only',
    beginTime: overrides.beginTime ?? '2026-04-09T14:00:00.000Z',
    endTime: overrides.endTime ?? '2026-05-09T04:59:59.000Z',
    cardNo: overrides.cardNo ?? '0102857149',
    cardCode: overrides.cardCode ?? 'A18',
    memberTypeId: overrides.memberTypeId ?? 'type-1',
    memberTypeName: overrides.memberTypeName ?? 'General',
    photoUrl: overrides.photoUrl ?? null,
    status: overrides.status ?? 'pending',
    submittedBy: overrides.submittedBy ?? 'staff-1',
    submittedByName: overrides.submittedByName ?? 'Jordan Staff',
    reviewedBy: overrides.reviewedBy ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    reviewNote: overrides.reviewNote ?? null,
    memberId: overrides.memberId ?? null,
    createdAt: overrides.createdAt ?? '2026-04-09T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-09T10:00:00.000Z',
  }
}

async function clickButton(container: ParentNode, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('PendingMemberRequestsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    invalidateQueriesMock.mockClear()
    reviewMemberApprovalRequestMock.mockReset()
    reviewMemberApprovalRequestMock.mockResolvedValue({})
    toastMock.mockClear()
    useMemberApprovalRequestsMock.mockReturnValue({
      requests: [createRequest()],
      isLoading: false,
      error: null,
    })
    useAvailableCardsMock.mockReturnValue({
      cards: [
        { cardNo: '0102857149', cardCode: 'A18' },
        { cardNo: '0102857150', cardCode: 'A19' },
      ],
      isLoading: false,
      error: null,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    vi.useRealTimers()
    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.clearAllMocks()
  })

  it('removes the payment section from the review modal', async () => {
    await act(async () => {
      root.render(<PendingMemberRequestsPage />)
    })

    await clickButton(container, 'Review')

    expect(container.textContent).toContain('Review Member Request')
    expect(container.textContent).not.toContain('Payment')
    expect(container.querySelector('#member-request-payment-amount')).toBeNull()
  })

  it('approves the request with the selected card only and invalidates the related queries', async () => {
    await act(async () => {
      root.render(<PendingMemberRequestsPage />)
    })

    await clickButton(container, 'Review')
    await clickButton(container, 'Approve')

    expect(reviewMemberApprovalRequestMock).toHaveBeenCalledWith('request-1', {
      status: 'approved',
      selected_card_no: '0102857149',
      review_note: null,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberApprovalRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberApprovalRequests', 'pending'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'unread-count'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Member approved',
    })
  })

  it('shows an approval warning in the success toast when the review response includes one', async () => {
    reviewMemberApprovalRequestMock.mockResolvedValueOnce({
      warning:
        'Member was approved and provisioned successfully, but the request record could not be fully updated. Please verify the member details manually.',
    })

    await act(async () => {
      root.render(<PendingMemberRequestsPage />)
    })

    await clickButton(container, 'Review')
    await clickButton(container, 'Approve')

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Member approved',
      description:
        'Member was approved and provisioned successfully, but the request record could not be fully updated. Please verify the member details manually.',
    })
  })

  it('denies the request and invalidates the notification queries', async () => {
    await act(async () => {
      root.render(<PendingMemberRequestsPage />)
    })

    await clickButton(container, 'Review')
    await clickButton(container, 'Deny')

    expect(reviewMemberApprovalRequestMock).toHaveBeenCalledWith('request-1', {
      status: 'denied',
      review_note: null,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'unread-count'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Member request denied',
    })
  })
})
