// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  currentRoleState,
  invalidateQueriesMock,
  pushMock,
  replaceMock,
  useMemberMock,
  usePtSessionsMock,
} = vi.hoisted(() => ({
  currentRoleState: { role: 'admin' as 'admin' | 'staff' },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  useMemberMock: vi.fn(),
  usePtSessionsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'member-1' }),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}))

vi.mock('@/hooks/use-members', () => ({
  useMember: useMemberMock,
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  usePtSessions: usePtSessionsMock,
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({
    role,
    children,
    fallback = null,
  }: {
    role: 'admin' | 'staff'
    children: React.ReactNode
    fallback?: React.ReactNode
  }) => (role === 'admin' && currentRoleState.role !== 'admin' ? <>{fallback}</> : <>{children}</>),
}))

vi.mock('@/components/assign-card-modal', () => ({
  AssignCardModal: () => null,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/components/edit-member-modal', () => ({
  EditMemberModal: () => null,
}))

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: ({ name }: { name: string }) => <div>{name}</div>,
}))

vi.mock('@/components/member-pt-section', () => ({
  MemberPtSection: () => <div>PT Assignment Section</div>,
}))

vi.mock('@/components/check-in-history', () => ({
  CheckInHistory: () => <div>Check-in History Content</div>,
}))

vi.mock('@/components/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/lib/member-actions', () => ({
  deleteMember: vi.fn(),
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
import { MemberPtAttendance } from '@/components/member-pt-attendance'
import type { PtSession } from '@/lib/pt-scheduling'
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

function createSession(index: number, overrides: Partial<PtSession> = {}): PtSession {
  const day = String(index).padStart(2, '0')

  return {
    id: overrides.id ?? `session-${index}`,
    assignmentId: overrides.assignmentId ?? 'assignment-1',
    trainerId: overrides.trainerId ?? `trainer-${index}`,
    memberId: overrides.memberId ?? 'member-1',
    scheduledAt: overrides.scheduledAt ?? `2026-03-${day}T07:00:00-05:00`,
    status: overrides.status ?? 'completed',
    isRecurring: overrides.isRecurring ?? true,
    notes: overrides.notes ?? null,
    trainingTypeName:
      overrides.trainingTypeName === undefined ? `Training ${index}` : overrides.trainingTypeName,
    createdAt: overrides.createdAt ?? `2026-03-${day}T00:00:00.000Z`,
    updatedAt: overrides.updatedAt ?? `2026-03-${day}T00:00:00.000Z`,
    trainerName: overrides.trainerName ?? `Trainer ${String(index).padStart(2, '0')}`,
    memberName: overrides.memberName ?? 'Marcus Brown',
  }
}

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

async function clickButton(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButton(container, label).click()
  })
}

function getActiveTabPanel(container: HTMLDivElement) {
  const panel = container.querySelector('[data-slot="tabs-content"][data-state="active"]')

  if (!(panel instanceof HTMLDivElement)) {
    throw new Error('Active tab panel not found.')
  }

  return panel
}

function normalizeTextContent(container: HTMLElement) {
  return container.textContent?.replace(/\s+/gu, ' ').trim() ?? ''
}

describe('Member detail page tabs', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentRoleState.role = 'admin'
    useMemberMock.mockReturnValue({
      member: createMember(),
      isLoading: false,
      error: null,
    })
    usePtSessionsMock.mockReturnValue({
      sessions: [
        createSession(1, { status: 'completed' }),
        createSession(2, { status: 'missed', trainingTypeName: null }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
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

  it('shows only the Info panel by default and keeps the other tab panels out of the initial render', async () => {
    await act(async () => {
      root.render(<MemberDetailPage />)
    })

    expect(getActiveTabPanel(container).textContent).toContain('Member Information')
    expect(getButton(container, 'Check-in History')).toBeDefined()
    expect(container.textContent).toContain('PT Attendance')
    expect(container.textContent).not.toContain('Check-in History Content')
  })

  it('hides the PT Attendance tab and avoids PT attendance queries for non-admin users', async () => {
    currentRoleState.role = 'staff'

    await act(async () => {
      root.render(<MemberDetailPage />)
    })

    expect(container.textContent).not.toContain('PT Attendance')
    expect(usePtSessionsMock).not.toHaveBeenCalled()
  })
})

describe('MemberPtAttendance', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    usePtSessionsMock.mockReturnValue({
      sessions: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
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

  it('shows attendance summary totals, percentage, and the Not set fallback', async () => {
    usePtSessionsMock.mockReturnValue({
      sessions: [
        createSession(1, { status: 'completed' }),
        createSession(2, { status: 'completed' }),
        createSession(3, { status: 'missed', trainingTypeName: null }),
        createSession(4, { status: 'cancelled' }),
        createSession(5, { status: 'rescheduled' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<MemberPtAttendance memberId="member-1" />)
    })

    const content = normalizeTextContent(container)

    expect(content).toContain('Total sessions completed2')
    expect(content).toContain('Total sessions missed1')
    expect(content).toContain('Attendance rate67%')
    expect(content).toContain('Not set')
  })

  it('shows the empty state with zero-value summary cards when there are no past PT sessions', async () => {
    await act(async () => {
      root.render(<MemberPtAttendance memberId="member-1" />)
    })

    const content = normalizeTextContent(container)

    expect(content).toContain('Total sessions completed0')
    expect(content).toContain('Total sessions missed0')
    expect(content).toContain('Attendance rate0%')
    expect(content).toContain('No past PT sessions recorded.')
  })

  it('paginates PT attendance results 10 at a time', async () => {
    usePtSessionsMock.mockReturnValue({
      sessions: Array.from({ length: 12 }, (_, index) =>
        createSession(index + 1, {
          trainerName: `Trainer ${String(index + 1).padStart(2, '0')}`,
        }),
      ),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<MemberPtAttendance memberId="member-1" />)
    })

    expect(container.textContent).toContain('Showing 1-10 of 12')
    expect(container.textContent).toContain('Trainer 12')
    expect(container.textContent).not.toContain('Trainer 01')

    await act(async () => {
      const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

      if (!(nextPageButton instanceof HTMLButtonElement)) {
        throw new Error('Next page button not found.')
      }

      nextPageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Showing 11-12 of 12')
    expect(container.textContent).toContain('Trainer 02')
    expect(container.textContent).toContain('Trainer 01')
    expect(container.textContent).not.toContain('Trainer 12')
  })

  it('hides pagination controls when there are 10 or fewer PT attendance rows', async () => {
    usePtSessionsMock.mockReturnValue({
      sessions: Array.from({ length: 10 }, (_, index) =>
        createSession(index + 1, {
          trainerName: `Trainer ${String(index + 1).padStart(2, '0')}`,
        }),
      ),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<MemberPtAttendance memberId="member-1" />)
    })

    expect(container.querySelector('button[aria-label="Go to next page"]')).toBeNull()
    expect(container.textContent).not.toContain('Showing 1-10 of 10')
    expect(container.textContent).toContain('Trainer 10')
    expect(container.textContent).toContain('Trainer 01')
  })
})
