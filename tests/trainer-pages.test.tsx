// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtSession, TrainerClient } from '@/lib/pt-scheduling'

const {
  createPtRescheduleRequestMock,
  invalidateQueriesMock,
  markPtSessionMock,
  toastMock,
  useQueryMock,
  useTrainerPtAssignmentsMock,
} = vi.hoisted(() => ({
  createPtRescheduleRequestMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  markPtSessionMock: vi.fn(),
  toastMock: vi.fn(),
  useQueryMock: vi.fn(),
  useTrainerPtAssignmentsMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    profile: {
      id: 'trainer-1',
      name: 'Jordan Trainer',
      role: 'staff',
      titles: ['Trainer'],
    },
  }),
}))

vi.mock('@/components/staff-only', () => ({
  StaffOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: ({ name }: { name: string }) => <div>{name}</div>,
}))

vi.mock('@/components/pagination-controls', () => ({
  PaginationControls: () => null,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    disabled,
  }: {
    onSelect?: (date: Date | undefined) => void
    disabled?: (date: Date) => boolean
  }) => {
    const dates = [
      { label: 'Apr 12 2099', date: new Date(2099, 3, 12) },
      { label: 'Apr 13 2099', date: new Date(2099, 3, 13) },
      { label: 'Apr 6 2026', date: new Date(2026, 3, 6) },
      { label: 'Apr 5 2026', date: new Date(2026, 3, 5) },
    ]

    return (
      <div>
        {dates.map(({ label, date }) => (
          <button
            key={label}
            type="button"
            aria-label={`Select ${label}`}
            disabled={disabled ? disabled(date) : false}
            onClick={() => onSelect?.(date)}
          >
            {label}
          </button>
        ))}
      </div>
    )
  },
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: React.ComponentProps<'button'>) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  TabsList: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  TabsTrigger: ({ children }: React.ComponentProps<'button'>) => <button type="button">{children}</button>,
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useTrainerPtAssignments: useTrainerPtAssignmentsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    createPtRescheduleRequest: createPtRescheduleRequestMock,
    markPtSession: markPtSessionMock,
  }
})

import TrainerClientsPage from '@/app/(app)/trainer/clients/page'
import TrainerSchedulePage from '@/app/(app)/trainer/schedule/page'

function createSession(overrides: Partial<PtSession> = {}): PtSession {
  return {
    id: overrides.id ?? 'session-1',
    assignmentId: overrides.assignmentId ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    scheduledAt: overrides.scheduledAt ?? '2099-04-12T10:00:00.000Z',
    status: overrides.status ?? 'scheduled',
    isRecurring: overrides.isRecurring ?? false,
    notes: overrides.notes ?? null,
    trainingTypeName: overrides.trainingTypeName ?? 'Strength',
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    memberName: overrides.memberName ?? 'Client One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
    pendingRequestType: overrides.pendingRequestType ?? null,
  }
}

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  const scheduledDays = overrides.scheduledDays ?? ['Monday', 'Wednesday']
  const sessionTime = overrides.sessionTime ?? '07:00'
  const trainingPlan =
    overrides.trainingPlan ??
    [
      { day: 'Monday', trainingTypeName: 'Legs', isCustom: false },
      { day: 'Wednesday', trainingTypeName: 'Back', isCustom: false },
    ]

  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 15000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? 2,
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
    sessionTime,
    notes: overrides.notes ?? null,
    trainingPlan,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    trainerTitles: overrides.trainerTitles ?? ['Trainer'],
    memberName: overrides.memberName ?? 'Client One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
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

function getButtonByAriaLabel(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )

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

async function clickButtonByAriaLabel(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButtonByAriaLabel(container, label).click()
  })
}

function getTextareaByPlaceholder(container: HTMLDivElement, placeholder: string) {
  const textarea = Array.from(container.querySelectorAll('textarea')).find(
    (candidate) => candidate.getAttribute('placeholder') === placeholder,
  )

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Textarea with placeholder "${placeholder}" not found.`)
  }

  return textarea
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(textarea),
      'value',
    )
    const setValue = descriptor?.set

    if (!setValue) {
      throw new Error('Textarea value setter is unavailable.')
    }

    setValue.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Trainer pages', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T15:07:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          'tab' in part &&
          part.tab === 'upcoming',
      )
        ? [createSession()]
        : [],
      isLoading: false,
      error: null,
    }))
    useTrainerPtAssignmentsMock.mockReturnValue({
      assignments: [createAssignment({ notes: null })],
      isLoading: false,
      error: null,
    })
    createPtRescheduleRequestMock.mockResolvedValue({ id: 'request-1' })
    markPtSessionMock.mockResolvedValue({ ok: true, pending: true })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders upcoming trainer sessions with mark and reschedule actions', async () => {
    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    expect(container.textContent).toContain('My Schedule')
    expect(container.textContent).toContain('Client One')
    expect(container.textContent).toContain('Strength')
    expect(container.textContent).toContain('Mark Session')
    expect(container.textContent).toContain('Request Reschedule')
  })

  it('opens the cancellation modal, requires a reason, and submits a pending cancellation request', async () => {
    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    await clickButton(container, 'Cancelled')

    expect(container.textContent).toContain('Cancel Session')
    expect(container.textContent).toContain('Client One')

    const submitButton = getButton(container, 'Submit')

    expect(submitButton.disabled).toBe(true)

    const reasonField = getTextareaByPlaceholder(
      container,
      'Provide a reason for cancelling this session',
    )
    await setTextareaValue(reasonField, 'Member is unwell today.')

    expect(getButton(container, 'Submit').disabled).toBe(false)

    await clickButton(container, 'Submit')

    expect(markPtSessionMock).toHaveBeenCalledWith('session-1', {
      requestedStatus: 'cancelled',
      note: 'Member is unwell today.',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['reschedule-requests', 'mine', 'trainer-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['session-update-requests', 'mine', 'trainer-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['pt-sessions', {}],
      exact: false,
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Request submitted — pending admin approval.',
    })
  })

  it('shows a readable formatted selection in the custom reschedule picker', async () => {
    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    await clickButton(container, 'Request Reschedule')

    expect(container.textContent).toContain('April 12, 2099 at 5:00 AM')
    expect(getButtonByAriaLabel(container, 'Select Apr 5 2026').disabled).toBe(true)
  })

  it('blocks submitting a same-day past time from the custom reschedule picker', async () => {
    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    await clickButton(container, 'Request Reschedule')
    await clickButtonByAriaLabel(container, 'Select Apr 6 2026')
    await clickButtonByAriaLabel(container, 'Hour 9')

    expect(container.textContent).toContain('Proposed date and time must be in the future.')
    expect(getButton(container, 'Send Request').disabled).toBe(true)
    expect(getButtonByAriaLabel(container, 'Minute 05').disabled).toBe(true)
    expect(createPtRescheduleRequestMock).not.toHaveBeenCalled()
  })

  it('submits a future selection from the custom reschedule picker using the existing payload shape', async () => {
    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    await clickButton(container, 'Request Reschedule')
    await clickButtonByAriaLabel(container, 'Select Apr 13 2099')
    await clickButtonByAriaLabel(container, 'Hour 11')
    await clickButtonByAriaLabel(container, 'Minute 15')
    await clickButton(container, 'PM')
    await clickButton(container, 'Send Request')

    expect(createPtRescheduleRequestMock).toHaveBeenCalledWith('session-1', {
      proposedAt: '2099-04-13T23:15',
      note: null,
    })
  })

  it('shows the pending approval badge and hides trainer actions when a request is already in flight', async () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          'tab' in part &&
          part.tab === 'upcoming',
      )
        ? [createSession({ pendingRequestType: 'status_change' })]
        : [],
      isLoading: false,
      error: null,
    }))

    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    expect(container.textContent).toContain('Pending approval')
    expect(container.textContent).not.toContain('Mark Session')
    expect(container.textContent).not.toContain('Request Reschedule')
  })

  it('renders trainer client cards with the training plan and notes fallback', async () => {
    await act(async () => {
      root.render(<TrainerClientsPage />)
    })

    expect(container.textContent).toContain('My Clients')
    expect(container.textContent).toContain('Monday → Legs')
    expect(container.textContent).toContain('Wednesday → Back')
    expect(container.textContent).toContain('No notes')
    expect(container.querySelector('a[href="/members/member-1"]')?.textContent).toBe('View Details')
  })
})
