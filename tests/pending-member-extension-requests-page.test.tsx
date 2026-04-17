// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  invalidateQueriesMock,
  reviewMemberExtensionRequestMock,
  toastMock,
  useMemberExtensionRequestsMock,
} = vi.hoisted(() => ({
  authState: {
    profile: {
      id: 'admin-1',
      name: 'Admin User',
      role: 'admin' as const,
      titles: ['Owner'],
    },
    loading: false,
  },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  reviewMemberExtensionRequestMock: vi.fn().mockResolvedValue({ success: true }),
  toastMock: vi.fn(),
  useMemberExtensionRequestsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-member-extension-requests', () => ({
  useMemberExtensionRequests: useMemberExtensionRequestsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-extension-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-extension-requests')>(
    '@/lib/member-extension-requests',
  )

  return {
    ...actual,
    reviewMemberExtensionRequest: reviewMemberExtensionRequestMock,
  }
})

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div data-testid="skeleton" {...props} />,
}))

import { PendingMemberExtensionRequestsPage } from '@/components/pending-member-extension-requests-page'
import type { MemberExtensionRequest } from '@/types'

const FIXED_NOW = new Date('2026-04-11T12:00:00.000Z')

function getRelativeIsoString(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString()
}

function createRequest(
  overrides: Partial<MemberExtensionRequest> = {},
): MemberExtensionRequest {
  return {
    id: overrides.id ?? 'request-1',
    memberId: overrides.memberId ?? 'member-1',
    memberName: overrides.memberName ?? 'Jane Doe',
    currentEndTime: overrides.currentEndTime ?? getRelativeIsoString(60),
    currentStatus: overrides.currentStatus ?? 'Active',
    durationDays: overrides.durationDays ?? 84,
    status: overrides.status ?? 'pending',
    requestedBy: overrides.requestedBy ?? 'staff-1',
    requestedByName: overrides.requestedByName ?? 'Jordan Staff',
    reviewedBy: overrides.reviewedBy ?? null,
    reviewedByName: overrides.reviewedByName ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    createdAt: overrides.createdAt ?? getRelativeIsoString(-1),
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
  })
}

describe('PendingMemberExtensionRequestsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    reviewMemberExtensionRequestMock.mockReset()
    reviewMemberExtensionRequestMock.mockResolvedValue({ success: true })
    invalidateQueriesMock.mockClear()
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
    vi.useRealTimers()
  })

  it('shows loading skeletons while requests are loading', async () => {
    useMemberExtensionRequestsMock.mockReturnValue({
      requests: [],
      isLoading: true,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberExtensionRequestsPage />)
    })

    expect(container.querySelectorAll('[data-testid="skeleton"]')).toHaveLength(2)
  })

  it('approves a request and invalidates the related queries', async () => {
    useMemberExtensionRequestsMock.mockReturnValue({
      requests: [createRequest()],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberExtensionRequestsPage />)
    })

    await clickButton(container, 'Approve')

    expect(reviewMemberExtensionRequestMock).toHaveBeenCalledWith('request-1', {
      action: 'approve',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberExtensionRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberExtensionRequests', 'pending'],
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
      queryKey: ['notifications', 'admin-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'admin-1', 'unread-count'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Extension request approved',
      description: undefined,
    })
  })

  it('disables approval and shows a warning when the member has no active membership', async () => {
    useMemberExtensionRequestsMock.mockReturnValue({
      requests: [createRequest({ currentEndTime: getRelativeIsoString(-30) })],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberExtensionRequestsPage />)
    })

    expect(container.textContent).toContain('Member has no active membership. Approval unavailable.')

    const approveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Approve',
    )

    if (!(approveButton instanceof HTMLButtonElement)) {
      throw new Error('Approve button not found.')
    }

    expect(approveButton.disabled).toBe(true)
  })

  it('disables approval when the member is suspended even with a future end date', async () => {
    useMemberExtensionRequestsMock.mockReturnValue({
      requests: [
        createRequest({
          currentStatus: 'Suspended',
          currentEndTime: getRelativeIsoString(30),
        }),
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<PendingMemberExtensionRequestsPage />)
    })

    const approveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Approve',
    )

    if (!(approveButton instanceof HTMLButtonElement)) {
      throw new Error('Approve button not found.')
    }

    expect(approveButton.disabled).toBe(true)
    expect(container.textContent).toContain('Member has no active membership. Approval unavailable.')
  })
})
