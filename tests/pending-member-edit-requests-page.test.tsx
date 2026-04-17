// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  invalidateQueriesMock,
  reviewMemberEditRequestMock,
  toastMock,
  useMemberEditRequestsMock,
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
  reviewMemberEditRequestMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  useMemberEditRequestsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-member-edit-requests', () => ({
  useMemberEditRequests: useMemberEditRequestsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-edit-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-edit-requests')>(
    '@/lib/member-edit-requests',
  )

  return {
    ...actual,
    reviewMemberEditRequest: reviewMemberEditRequestMock,
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

import { PendingMemberEditRequestsPage } from '@/components/pending-member-edit-requests-page'
import {
  buildEndTimeValue,
  calculateInclusiveEndDate,
  formatAccessDate,
} from '@/lib/member-access-time'
import type { MemberEditRequest } from '@/types'

function createRequest(overrides: Partial<MemberEditRequest> = {}): MemberEditRequest {
  return {
    id: overrides.id ?? 'request-1',
    memberId: overrides.memberId ?? 'member-1',
    memberName: overrides.memberName ?? 'Jane Doe',
    currentName: overrides.currentName ?? 'Jane Doe',
    currentGender: overrides.currentGender === undefined ? 'Female' : overrides.currentGender,
    currentPhone: overrides.currentPhone === undefined ? '555-0100' : overrides.currentPhone,
    currentEmail: overrides.currentEmail === undefined ? 'jane@example.com' : overrides.currentEmail,
    currentMemberTypeId:
      overrides.currentMemberTypeId === undefined ? 'type-1' : overrides.currentMemberTypeId,
    currentMemberTypeName:
      overrides.currentMemberTypeName === undefined ? 'General' : overrides.currentMemberTypeName,
    currentJoinDate:
      overrides.currentJoinDate === undefined ? null : overrides.currentJoinDate,
    currentBeginTime:
      overrides.currentBeginTime === undefined
        ? '2026-04-02T00:00:00.000Z'
        : overrides.currentBeginTime,
    currentEndTime:
      overrides.currentEndTime === undefined
        ? '2026-04-29T23:59:59.000Z'
        : overrides.currentEndTime,
    proposedName: overrides.proposedName === undefined ? 'Jane Updated' : overrides.proposedName,
    proposedGender: overrides.proposedGender === undefined ? null : overrides.proposedGender,
    proposedPhone: overrides.proposedPhone === undefined ? null : overrides.proposedPhone,
    proposedEmail: overrides.proposedEmail === undefined ? null : overrides.proposedEmail,
    proposedMemberTypeId:
      overrides.proposedMemberTypeId === undefined ? null : overrides.proposedMemberTypeId,
    proposedMemberTypeName:
      overrides.proposedMemberTypeName === undefined ? null : overrides.proposedMemberTypeName,
    proposedJoinDate:
      overrides.proposedJoinDate === undefined ? null : overrides.proposedJoinDate,
    proposedStartDate:
      overrides.proposedStartDate === undefined ? null : overrides.proposedStartDate,
    proposedStartTime:
      overrides.proposedStartTime === undefined ? null : overrides.proposedStartTime,
    proposedDuration:
      overrides.proposedDuration === undefined ? null : overrides.proposedDuration,
    requestedBy: overrides.requestedBy ?? 'staff-1',
    requestedByName:
      overrides.requestedByName === undefined ? 'Jordan Staff' : overrides.requestedByName,
    reviewedBy: overrides.reviewedBy === undefined ? null : overrides.reviewedBy,
    reviewedByName: overrides.reviewedByName === undefined ? null : overrides.reviewedByName,
    reviewedAt: overrides.reviewedAt === undefined ? null : overrides.reviewedAt,
    rejectionReason:
      overrides.rejectionReason === undefined ? null : overrides.rejectionReason,
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

describe('PendingMemberEditRequestsPage', () => {
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
    useMemberEditRequestsMock.mockReturnValue({
      requests: [],
      isLoading: true,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberEditRequestsPage />)
    })

    expect(container.querySelectorAll('[data-testid="skeleton"]')).toHaveLength(2)
  })

  it('shows an empty state when there are no pending requests', async () => {
    useMemberEditRequestsMock.mockReturnValue({
      requests: [],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberEditRequestsPage />)
    })

    expect(container.textContent).toContain('No pending edit requests.')
  })

  it('approves a request and invalidates the related queries', async () => {
    useMemberEditRequestsMock.mockReturnValue({
      requests: [createRequest()],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberEditRequestsPage />)
    })

    await clickButton(container, 'Approve')

    expect(reviewMemberEditRequestMock).toHaveBeenCalledWith('request-1', {
      action: 'approve',
      rejectionReason: null,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests', 'pending'],
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
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'unread-count'],
    })
  })

  it('denies a request with a rejection reason', async () => {
    useMemberEditRequestsMock.mockReturnValue({
      requests: [createRequest()],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberEditRequestsPage />)
    })

    await clickButton(container, 'Deny')

    const textarea = container.querySelector('textarea')

    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Rejection reason textarea not found.')
    }

    await act(async () => {
      setInputValue(textarea, 'Missing supporting details.')
    })

    await clickButton(container, 'Deny Request')

    expect(reviewMemberEditRequestMock).toHaveBeenCalledWith('request-1', {
      action: 'deny',
      rejectionReason: 'Missing supporting details.',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'unread-count'],
    })
  })

  it('shows access window diffs when they are part of a request', async () => {
    const nextEndDate = calculateInclusiveEndDate('2026-04-02', '3_months')
    const nextEndTime = nextEndDate ? buildEndTimeValue(nextEndDate) : null

    useMemberEditRequestsMock.mockReturnValue({
      requests: [
        createRequest({
          proposedName: null,
          proposedStartTime: '08:30:00',
          proposedDuration: '3 Months',
        }),
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberEditRequestsPage />)
    })

    expect(container.textContent).toContain('Start Date')
    expect(container.textContent).toContain('Start Time')
    expect(container.textContent).toContain('Duration')
    expect(container.textContent).toContain('End Date')
    expect(container.textContent).toContain('08:30:00')
    expect(container.textContent).toContain('3 Months')
    expect(container.textContent).toContain(formatAccessDate('2026-04-29T23:59:59.000Z', 'long'))
    expect(container.textContent).toContain(
      nextEndTime ? formatAccessDate(nextEndTime, 'long') : 'Unavailable',
    )
  })

  it('allows concurrent edit reviews without disabling other visible requests', async () => {
    const firstReview = createDeferred<void>()
    const secondReview = createDeferred<void>()

    reviewMemberEditRequestMock
      .mockReturnValueOnce(firstReview.promise)
      .mockReturnValueOnce(secondReview.promise)
    useMemberEditRequestsMock.mockReturnValue({
      requests: [
        createRequest({ id: 'request-1', memberName: 'Jane Doe' }),
        createRequest({ id: 'request-2', memberName: 'Mark Lee' }),
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberEditRequestsPage />)
    })

    await clickButton(container, 'Approve')

    const remainingApproveButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Approve',
    )

    if (!(remainingApproveButton instanceof HTMLButtonElement)) {
      throw new Error('Second approve button not found.')
    }

    expect(remainingApproveButton.disabled).toBe(false)

    await act(async () => {
      remainingApproveButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reviewMemberEditRequestMock).toHaveBeenNthCalledWith(1, 'request-1', {
      action: 'approve',
      rejectionReason: null,
    })
    expect(reviewMemberEditRequestMock).toHaveBeenNthCalledWith(2, 'request-2', {
      action: 'approve',
      rejectionReason: null,
    })

    firstReview.resolve()
    secondReview.resolve()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  })
})
