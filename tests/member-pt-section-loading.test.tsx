// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  deletePtAssignmentMock,
  permissionState,
  useMemberPtAssignmentMock,
  usePtAssignmentsMock,
  useStaffMock,
} = vi.hoisted(() => ({
  authState: {
    profile: {
      id: 'admin-1',
      name: 'Admin User',
      role: 'admin' as 'admin' | 'staff',
      titles: ['Owner'],
    },
  },
  deletePtAssignmentMock: vi.fn(),
  permissionState: {
    canAssignTrainer: true,
  },
  useMemberPtAssignmentMock: vi.fn(),
  usePtAssignmentsMock: vi.fn(),
  useStaffMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useMemberPtAssignment: useMemberPtAssignmentMock,
  usePtAssignments: usePtAssignmentsMock,
}))

vi.mock('@/hooks/use-staff', () => ({
  useStaff: useStaffMock,
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: null,
    profile: authState.profile,
    role: authState.profile.role,
    loading: false,
  }),
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: (permission: string) => permission === 'pt.assign' && permissionState.canAssignTrainer,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    deletePtAssignment: deletePtAssignmentMock,
  }
})

vi.mock('@/components/pt-assignment-dialog', () => ({
  PtAssignmentDialog: () => null,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    loading = false,
    type = 'button',
    ...props
  }: React.ComponentProps<'button'> & { loading?: boolean }) => (
    <button data-loading={loading ? 'true' : 'false'} type={type} {...props}>
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
  DialogFooter: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

import { MemberPtSection } from '@/components/member-pt-section'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function getButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('MemberPtSection remove dialog loading wiring', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useMemberPtAssignmentMock.mockReturnValue({
      assignment: {
        id: 'assignment-1',
        trainerId: 'trainer-1',
        memberId: 'member-1',
        status: 'active',
        ptFee: 14000,
        sessionsPerWeek: 1,
        scheduledDays: ['Monday'],
        trainingPlan: [],
        sessionTime: '07:00',
        notes: null,
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        trainerName: 'Jordan Trainer',
        trainerTitles: ['Trainer'],
        memberName: 'Member One',
        memberPhotoUrl: null,
      },
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [],
      isLoading: false,
    })
    useStaffMock.mockReturnValue({
      staff: [],
      isLoading: false,
    })
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

  it('shows loading only on the clicked removal action', async () => {
    const deferred = createDeferred<{ ok: true; cancelledSessions: number }>()
    deletePtAssignmentMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    await act(async () => {
      getButton(container, 'Remove Assignment').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })

    const keepButton = getButton(container, 'Keep existing sessions')
    const removeAndCancelButton = getButton(
      container,
      'Remove assignment and cancel all future sessions',
    )
    const cancelButton = getButton(container, 'Cancel')

    await act(async () => {
      keepButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(keepButton.getAttribute('data-loading')).toBe('true')
    expect(removeAndCancelButton.getAttribute('data-loading')).toBe('false')
    expect(cancelButton.getAttribute('data-loading')).toBe('false')
    expect(keepButton.disabled).toBe(true)
    expect(removeAndCancelButton.disabled).toBe(true)
    expect(cancelButton.disabled).toBe(true)

    deferred.resolve({ ok: true, cancelledSessions: 0 })
    await flushAsyncWork()
  })
})
