// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  deleteMemberMock,
  invalidateQueriesMock,
  replaceMock,
  toastMock,
  useMemberMock,
} = vi.hoisted(() => ({
  deleteMemberMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  replaceMock: vi.fn(),
  toastMock: vi.fn(),
  useMemberMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'member-1' }),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
  }),
}))

vi.mock('@/hooks/use-back-link', () => ({
  useBackLink: () => '/members',
}))

vi.mock('@/hooks/use-members', () => ({
  useMember: useMemberMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
    onCancel,
    isLoading = false,
  }: {
    open: boolean
    title: string
    confirmLabel: string
    onConfirm: () => void
    onCancel?: () => void
    isLoading?: boolean
  }) =>
    open ? (
      <div data-confirm-title={title} data-is-loading={isLoading ? 'true' : 'false'}>
        <h2>{title}</h2>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/assign-card-modal', () => ({
  AssignCardModal: () => null,
}))

vi.mock('@/components/edit-member-modal', () => ({
  EditMemberModal: () => null,
}))

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: ({ name }: { name: string }) => <div>{name}</div>,
}))

vi.mock('@/components/member-pt-attendance', () => ({
  MemberPtAttendance: () => <div>PT attendance</div>,
}))

vi.mock('@/components/member-pt-section', () => ({
  MemberPtSection: () => <div>PT section</div>,
}))

vi.mock('@/components/check-in-history', () => ({
  CheckInHistory: () => <div>Check-in history</div>,
}))

vi.mock('@/components/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/lib/member-actions', () => ({
  deleteMember: deleteMemberMock,
  deleteMemberPhoto: vi.fn(),
  recoverMemberCard: vi.fn(),
  reactivateMember: vi.fn(),
  reportMemberCardLost: vi.fn(),
  releaseMemberSlot: vi.fn(),
  suspendMember: vi.fn(),
  unassignMemberCard: vi.fn(),
}))

vi.mock('@/lib/member-card', () => ({
  hasAssignedCard: () => false,
}))

vi.mock('@/lib/member-card-action-state', () => ({
  getMemberCardActionState: () => ({
    showUnassignCard: false,
    disableUnassignCard: true,
    showReportCardLost: false,
    disableReportCardLost: true,
    showRecoverCard: false,
    showDisabledCardLabel: false,
  }),
}))

vi.mock('@/lib/member-name', () => ({
  buildMemberDisplayName: (name: string) => name,
  getCleanMemberName: (name: string) => name,
}))

import MemberDetailPage from '@/app/(app)/members/[id]/page'
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
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? 'Male',
    email: overrides.email ?? 'marcus@example.com',
    phone: overrides.phone ?? '876-555-0123',
    remark: overrides.remark ?? 'Prefers morning sessions.',
    photoUrl: overrides.photoUrl ?? null,
    beginTime: overrides.beginTime ?? '2026-01-01',
    endTime: overrides.endTime ?? '2026-12-31',
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('MemberDetailPage async confirm loading', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useMemberMock.mockReturnValue({
      member: createMember(),
      isLoading: false,
      error: null,
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

  it('keeps the delete-member dialog open and loading until the async delete resolves', async () => {
    const deferred = createDeferred<{ warning?: string | null }>()
    deleteMemberMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<MemberDetailPage />)
    })

    const deleteTrigger = container.querySelector('button[aria-label="Delete member"]')

    if (!(deleteTrigger instanceof HTMLButtonElement)) {
      throw new Error('Delete member trigger not found.')
    }

    await act(async () => {
      deleteTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Delete Member',
    )

    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error('Delete member confirm button not found.')
    }

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dialogWhilePending = container.querySelector('[data-confirm-title="Delete member?"]')

    expect(deleteMemberMock).toHaveBeenCalledWith('member-1')
    expect(dialogWhilePending).not.toBeNull()
    expect(dialogWhilePending?.getAttribute('data-is-loading')).toBe('true')

    deferred.resolve({})
    await flushAsyncWork()

    expect(container.querySelector('[data-confirm-title="Delete member?"]')).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith('/members')
  })
})
