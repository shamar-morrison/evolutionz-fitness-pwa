// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  reviewMemberPaymentRequestMock,
  toastMock,
  useMemberPaymentRequestsMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  reviewMemberPaymentRequestMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  useMemberPaymentRequestsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-member-payment-requests', () => ({
  useMemberPaymentRequests: useMemberPaymentRequestsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-payment-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-payment-requests')>(
    '@/lib/member-payment-requests',
  )

  return {
    ...actual,
    reviewMemberPaymentRequest: reviewMemberPaymentRequestMock,
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
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div data-testid="skeleton" {...props} />,
}))

import { PendingMemberPaymentRequestsPage } from '@/components/pending-member-payment-requests-page'
import type { MemberPaymentRequest } from '@/types'

function createRequest(overrides: Partial<MemberPaymentRequest> = {}): MemberPaymentRequest {
  return {
    id: overrides.id ?? 'payment-request-1',
    memberId: overrides.memberId ?? 'member-1',
    memberName: overrides.memberName ?? 'Jane Doe',
    amount: overrides.amount ?? 12000,
    paymentMethod: overrides.paymentMethod ?? 'cash',
    paymentDate: overrides.paymentDate ?? '2026-04-11',
    memberTypeId: overrides.memberTypeId ?? 'type-1',
    memberTypeName: overrides.memberTypeName ?? 'General',
    notes: overrides.notes ?? 'Paid in full',
    requestedBy: overrides.requestedBy ?? 'staff-1',
    requestedByName: overrides.requestedByName ?? 'Jordan Staff',
    reviewedBy: overrides.reviewedBy ?? null,
    reviewedByName: overrides.reviewedByName ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    rejectionReason: overrides.rejectionReason ?? null,
    status: overrides.status ?? 'pending',
    createdAt: overrides.createdAt ?? '2026-04-11T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-11T10:00:00.000Z',
  }
}

function setInputValue(input: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Textarea value setter is unavailable.')
  }

  setValue.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
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
  })
}

describe('PendingMemberPaymentRequestsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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

  it('shows loading skeletons while requests are loading', async () => {
    useMemberPaymentRequestsMock.mockReturnValue({
      requests: [],
      isLoading: true,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberPaymentRequestsPage />)
    })

    expect(container.querySelectorAll('[data-testid="skeleton"]')).toHaveLength(2)
  })

  it('shows an empty state when there are no pending requests', async () => {
    useMemberPaymentRequestsMock.mockReturnValue({
      requests: [],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberPaymentRequestsPage />)
    })

    expect(container.textContent).toContain('No pending payment requests.')
  })

  it('approves a request and invalidates the related queries', async () => {
    useMemberPaymentRequestsMock.mockReturnValue({
      requests: [createRequest()],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberPaymentRequestsPage />)
    })

    await clickButton(container, 'Approve')

    expect(reviewMemberPaymentRequestMock).toHaveBeenCalledWith('payment-request-1', {
      action: 'approve',
      rejectionReason: null,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests', 'pending'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPayments'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'detail', 'member-1'],
    })
  })

  it('denies a request with a rejection reason', async () => {
    useMemberPaymentRequestsMock.mockReturnValue({
      requests: [createRequest()],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberPaymentRequestsPage />)
    })

    await clickButton(container, 'Deny')

    const textarea = container.querySelector('textarea')

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Rejection reason textarea not found.')
    }

    await act(async () => {
      setInputValue(textarea, 'Member needs corrected amount.')
    })

    await clickButton(container, 'Deny Request')

    expect(reviewMemberPaymentRequestMock).toHaveBeenCalledWith('payment-request-1', {
      action: 'deny',
      rejectionReason: 'Member needs corrected amount.',
    })
  })
})
