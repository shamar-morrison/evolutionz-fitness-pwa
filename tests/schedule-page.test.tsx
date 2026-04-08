// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  generatePtAssignmentSessionsMock,
  invalidateQueriesMock,
  toastMock,
  usePtAssignmentsMock,
  usePtSessionsMock,
  useStaffMock,
} = vi.hoisted(() => ({
  generatePtAssignmentSessionsMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  usePtAssignmentsMock: vi.fn(),
  usePtSessionsMock: vi.fn(),
  useStaffMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  usePtAssignments: usePtAssignmentsMock,
  usePtSessions: usePtSessionsMock,
}))

vi.mock('@/hooks/use-staff', () => ({
  useStaff: useStaffMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    generatePtAssignmentSessions: generatePtAssignmentSessionsMock,
    getMonthValueInJamaica: () => '2026-04',
  }
})

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/pt-session-dialog', () => ({
  PtSessionDialog: () => null,
}))

vi.mock('@/components/searchable-select', () => ({
  SearchableSelect: ({
    value,
    onValueChange,
    options,
    placeholder,
    disabled,
  }: {
    value: string | null
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder: string
    disabled?: boolean
  }) => (
    <select
      aria-label="Assignment"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }: {
    open: boolean
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel?: () => void
  }) =>
    open ? (
      <div>
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

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  SelectItem: ({ children }: React.ComponentProps<'div'> & { value: string }) => <div>{children}</div>,
  SelectTrigger: ({ children, id }: React.ComponentProps<'button'>) => (
    <button id={id} type="button">
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

import SchedulePage from '@/app/(app)/schedule/page'
import { queryKeys } from '@/lib/query-keys'
import type { TrainerClient } from '@/lib/pt-scheduling'

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 14000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? 1,
    scheduledDays: overrides.scheduledDays ?? ['Monday'],
    trainingPlan: overrides.trainingPlan ?? [],
    sessionTime: overrides.sessionTime ?? '07:00',
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2026-04-03T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-03T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    trainerTitles: overrides.trainerTitles ?? ['Trainer'],
    memberName: overrides.memberName ?? 'Member One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
}

function setInputValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Input value setter is unavailable.')
  }

  setValue.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

function getBadge(container: HTMLDivElement, label: string) {
  const badges = Array.from(container.querySelectorAll('[data-slot="badge"]'))
  const badge = badges.find((candidate) => candidate.textContent?.trim() === label)

  if (!(badge instanceof HTMLElement)) {
    throw new Error(`${label} badge not found.`)
  }

  return badge
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

describe('SchedulePage', () => {
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
    })
    usePtAssignmentsMock.mockReturnValue({
      data: [createAssignment()],
      isLoading: false,
    })
    useStaffMock.mockReturnValue({
      staff: [],
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

  it('loads the schedule with the non-cancelled PT status preset by default', async () => {
    await act(async () => {
      root.render(<SchedulePage />)
    })

    expect(usePtSessionsMock).toHaveBeenCalledWith({
      month: '2026-04',
      trainerId: undefined,
      status: 'active',
    })
  })

  it('invalidates all PT session list queries after generating sessions from the schedule page', async () => {
    generatePtAssignmentSessionsMock.mockResolvedValue({
      ok: true,
      generated: 3,
      skipped: 0,
    })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')

    const assignmentSelect = container.querySelector('select[aria-label="Assignment"]')

    if (!(assignmentSelect instanceof HTMLSelectElement)) {
      throw new Error('Assignment select not found.')
    }

    await act(async () => {
      setInputValue(assignmentSelect, 'assignment-1')
    })

    await clickButton(container, 'Generate')
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledWith('assignment-1', {
      month: 4,
      year: 2026,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.sessions({}),
      exact: false,
    })
  })

  it('renders training types on session cards when available', async () => {
    usePtSessionsMock.mockReturnValue({
      sessions: [
        {
          id: 'session-1',
          assignmentId: 'assignment-1',
          trainerId: 'trainer-1',
          memberId: 'member-1',
          scheduledAt: '2026-04-06T07:00:00-05:00',
          status: 'scheduled',
          isRecurring: true,
          notes: null,
          trainingTypeName: 'Legs',
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z',
          trainerName: 'Jordan Trainer',
          memberName: 'Member One',
        },
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    expect(container.textContent).toContain('Legs')
  })

  it('uses schedule-specific colors for scheduled, cancelled, and rescheduled badges', async () => {
    usePtSessionsMock.mockReturnValue({
      sessions: [
        {
          id: 'session-1',
          assignmentId: 'assignment-1',
          trainerId: 'trainer-1',
          memberId: 'member-1',
          scheduledAt: '2026-04-06T07:00:00-05:00',
          status: 'scheduled',
          isRecurring: true,
          notes: null,
          trainingTypeName: null,
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z',
          trainerName: 'Jordan Trainer',
          memberName: 'Member One',
        },
        {
          id: 'session-2',
          assignmentId: 'assignment-1',
          trainerId: 'trainer-1',
          memberId: 'member-2',
          scheduledAt: '2026-04-06T08:00:00-05:00',
          status: 'cancelled',
          isRecurring: true,
          notes: null,
          trainingTypeName: null,
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z',
          trainerName: 'Jordan Trainer',
          memberName: 'Member Two',
        },
        {
          id: 'session-3',
          assignmentId: 'assignment-1',
          trainerId: 'trainer-1',
          memberId: 'member-3',
          scheduledAt: '2026-04-06T09:00:00-05:00',
          status: 'rescheduled',
          isRecurring: true,
          notes: null,
          trainingTypeName: null,
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z',
          trainerName: 'Jordan Trainer',
          memberName: 'Member Three',
        },
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    expect(getBadge(container, 'Scheduled').className).toContain('text-blue-700')
    expect(getBadge(container, 'Cancelled').className).toContain('text-amber-700')
    expect(getBadge(container, 'Rescheduled').className).toContain('text-orange-700')
  })
})
