// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  deletePtAssignmentMock,
  generatePtAssignmentSessionsMock,
  invalidateQueriesMock,
  permissionState,
  ptAssignmentDialogPropsMock,
  toastMock,
  useMemberPtAssignmentMock,
  usePtAssignmentsMock,
  useStaffMock,
  savedAssignmentFromDialog,
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
  generatePtAssignmentSessionsMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  permissionState: {
    canAssignTrainer: true,
  },
  ptAssignmentDialogPropsMock: vi.fn(),
  toastMock: vi.fn(),
  useMemberPtAssignmentMock: vi.fn(),
  usePtAssignmentsMock: vi.fn(),
  useStaffMock: vi.fn(),
  savedAssignmentFromDialog: {
    id: 'assignment-new',
    trainerId: 'trainer-2',
    memberId: 'member-1',
    status: 'active',
    ptFee: 12000,
    sessionsPerWeek: 1,
    scheduledSessions: [
      {
        day: 'Monday',
        sessionTime: '07:00',
        trainingTypeName: null,
        isCustom: false,
      },
    ],
    scheduledDays: ['Monday'],
    trainingPlan: [],
    sessionTime: '07:00',
    notes: null,
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
    trainerName: 'Jamie Trainer',
    trainerTitles: ['Trainer'],
    memberName: 'Member One',
    memberPhotoUrl: null,
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
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
  toast: toastMock,
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    deletePtAssignment: deletePtAssignmentMock,
    generatePtAssignmentSessions: generatePtAssignmentSessionsMock,
    getMonthValueInJamaica: () => '2026-04',
  }
})

vi.mock('@/components/pt-assignment-dialog', () => ({
  PtAssignmentDialog: (props: {
    open: boolean
    mode: 'create' | 'edit'
    trainers: Array<{ id: string }>
    inactiveAssignmentsByTrainerId?: Record<string, { id: string }>
    onSaved: (assignment: typeof savedAssignmentFromDialog, mode: 'create' | 'edit') => void
  }) => {
    ptAssignmentDialogPropsMock(props)

    return props.open ? (
      <button type="button" onClick={() => void props.onSaved(savedAssignmentFromDialog, props.mode)}>
        Save Assignment
      </button>
    ) : null
  },
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel?: () => void
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

import { MemberPtSection } from '@/components/member-pt-section'
import { queryKeys } from '@/lib/query-keys'
import type { TrainerClient } from '@/lib/pt-scheduling'
import type { Profile } from '@/types'

function createTrainer(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'trainer-1',
    name: overrides.name ?? 'Jordan Trainer',
    email: overrides.email ?? 'jordan@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Trainer'],
    isSuspended: overrides.isSuspended ?? false,
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  const scheduledDays = overrides.scheduledDays ?? ['Monday']
  const sessionTime = overrides.sessionTime ?? '07:00'
  const trainingPlan = overrides.trainingPlan ?? []

  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    status: overrides.status ?? 'active',
    ptFee: Object.prototype.hasOwnProperty.call(overrides, 'ptFee') ? (overrides.ptFee ?? null) : 14000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? 1,
    scheduledSessions:
      overrides.scheduledSessions ??
      scheduledDays.map((day) => {
        const trainingPlanEntry = trainingPlan.find((entry) => entry.day === day)

        return {
          day,
          sessionTime,
          trainingTypeName: trainingPlanEntry?.trainingTypeName ?? null,
          isCustom: trainingPlanEntry?.isCustom ?? false,
        }
      }),
    scheduledDays,
    trainingPlan,
    sessionTime,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2026-04-03T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-03T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    trainerTitles: overrides.trainerTitles ?? ['Trainer'],
    memberName: overrides.memberName ?? 'Member One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
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
    getButton(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function getLatestPtAssignmentDialogProps() {
  const lastCall = ptAssignmentDialogPropsMock.mock.lastCall

  if (!lastCall) {
    throw new Error('PT assignment dialog props were not captured.')
  }

  return lastCall[0] as {
    open: boolean
    mode: 'create' | 'edit'
    trainers: Array<{ id: string }>
    inactiveAssignmentsByTrainerId?: Record<string, { id: string }>
  }
}

describe('MemberPtSection', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    authState.profile = {
      id: 'admin-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    }
    permissionState.canAssignTrainer = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useStaffMock.mockReturnValue({
      staff: [createTrainer(), createTrainer({ id: 'trainer-2', name: 'Jamie Trainer' })],
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

  it('invalidates all PT session list queries after removing an assignment and cancelling sessions', async () => {
    const assignment = createAssignment()

    useMemberPtAssignmentMock.mockReturnValue({
      assignment,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [assignment],
      isLoading: false,
    })
    deletePtAssignmentMock.mockResolvedValue({
      ok: true,
      cancelledSessions: 2,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    await clickButton(container, 'Remove Assignment')
    await clickButton(container, 'Remove assignment and cancel all future sessions')
    await flushAsyncWork()

    expect(deletePtAssignmentMock).toHaveBeenCalledWith('assignment-1', {
      cancelFutureSessions: true,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.trainerAssignments('trainer-1'),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.staff.detail('trainer-1'),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.sessions({}),
      exact: false,
    })
  })

  it('invalidates all PT session list queries after generating sessions from the member PT flow', async () => {
    useMemberPtAssignmentMock.mockReturnValue({
      assignment: null,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [],
      isLoading: false,
    })
    generatePtAssignmentSessionsMock.mockResolvedValue({
      ok: true,
      generated: 2,
      skipped: 0,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    await clickButton(container, 'Assign Trainer')
    await clickButton(container, 'Save Assignment')
    await flushAsyncWork()

    invalidateQueriesMock.mockClear()

    await clickButton(container, 'Yes, Generate')
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledWith('assignment-new', {
      month: 4,
      year: 2026,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.sessions({}),
      exact: false,
    })
  })

  it('keeps trainers with only inactive history available for reassignment', async () => {
    useMemberPtAssignmentMock.mockReturnValue({
      assignment: null,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-inactive-older',
          trainerId: 'trainer-1',
          status: 'inactive',
          updatedAt: '2026-04-01T00:00:00.000Z',
        }),
        createAssignment({
          id: 'assignment-inactive-newer',
          trainerId: 'trainer-1',
          status: 'inactive',
          updatedAt: '2026-04-05T00:00:00.000Z',
        }),
      ],
      isLoading: false,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    await clickButton(container, 'Assign Trainer')

    const dialogProps = getLatestPtAssignmentDialogProps()

    expect(dialogProps.mode).toBe('create')
    expect(dialogProps.trainers.map((trainer) => trainer.id)).toEqual(['trainer-1', 'trainer-2'])
    expect(dialogProps.inactiveAssignmentsByTrainerId?.['trainer-1']?.id).toBe('assignment-inactive-newer')
  })

  it('excludes trainers with active assignments from the available trainer options', async () => {
    const activeAssignment = createAssignment({
      id: 'assignment-active',
      trainerId: 'trainer-2',
      trainerName: 'Jamie Trainer',
    })

    useMemberPtAssignmentMock.mockReturnValue({
      assignment: activeAssignment,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-inactive',
          trainerId: 'trainer-1',
          status: 'inactive',
        }),
        activeAssignment,
      ],
      isLoading: false,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    await clickButton(container, 'Edit Assignment')

    const dialogProps = getLatestPtAssignmentDialogProps()

    expect(dialogProps.mode).toBe('edit')
    expect(dialogProps.trainers.map((trainer) => trainer.id)).toEqual(['trainer-1'])
    expect(dialogProps.inactiveAssignmentsByTrainerId?.['trainer-1']?.id).toBe('assignment-inactive')
    expect(dialogProps.inactiveAssignmentsByTrainerId?.['trainer-2']).toBeUndefined()
  })

  it('renders the training plan summary and invalidates both old and new trainer detail caches after reassignment', async () => {
    const assignment = createAssignment({
      trainingPlan: [
        {
          day: 'Monday',
          trainingTypeName: 'Legs',
          isCustom: false,
        },
        {
          day: 'Wednesday',
          trainingTypeName: 'Chest',
          isCustom: false,
        },
      ],
    })

    useMemberPtAssignmentMock.mockReturnValue({
      assignment,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [assignment],
      isLoading: false,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    expect(container.textContent).toContain('Training Plan')
    expect(container.textContent).toContain('Monday → Legs')
    expect(container.textContent).toContain('Wednesday → Chest')

    await clickButton(container, 'Edit Assignment')
    await clickButton(container, 'Save Assignment')
    await flushAsyncWork()

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.assignment('assignment-new'),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.trainerAssignments('trainer-1'),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.trainerAssignments('trainer-2'),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.staff.detail('trainer-1'),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.staff.detail('trainer-2'),
    })
  })

  it('renders a read-only PT summary for front desk staff and hides financial and assignment actions', async () => {
    const assignment = createAssignment({
      ptFee: 14500,
      notes: 'Keep sessions in the morning.',
    })

    authState.profile = {
      id: 'assistant-1',
      name: 'Avery Assistant',
      role: 'staff',
      titles: ['Assistant'],
    }
    permissionState.canAssignTrainer = false
    useMemberPtAssignmentMock.mockReturnValue({
      assignment,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [assignment],
      isLoading: false,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    expect(container.textContent).toContain('Personal Trainer')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Keep sessions in the morning.')
    expect(container.textContent).not.toContain('PT Fee')
    expect(container.textContent).not.toContain('Edit Assignment')
    expect(container.textContent).not.toContain('Remove Assignment')
    expect(container.textContent).not.toContain('Assign Trainer')
    expect(useStaffMock).toHaveBeenCalledWith({ enabled: false })
  })

  it('renders Not set when an admin views an assignment with no PT fee', async () => {
    const assignment = createAssignment({
      ptFee: null,
      notes: 'Fee to be decided later.',
    })

    useMemberPtAssignmentMock.mockReturnValue({
      assignment,
      isLoading: false,
      error: null,
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [assignment],
      isLoading: false,
    })

    await act(async () => {
      root.render(<MemberPtSection memberId="member-1" />)
    })

    expect(container.textContent).toContain('PT Fee')
    expect(container.textContent).toContain('Not set')
  })
})
