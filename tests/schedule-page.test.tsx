// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchPtSessionsMock,
  fetchQueryMock,
  generatePtAssignmentSessionsMock,
  invalidateQueriesMock,
  toastMock,
  usePtAssignmentsMock,
  usePtSessionsMock,
  useStaffMock,
} = vi.hoisted(() => ({
  fetchPtSessionsMock: vi.fn(),
  fetchQueryMock: vi.fn(),
  generatePtAssignmentSessionsMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  usePtAssignmentsMock: vi.fn(),
  usePtSessionsMock: vi.fn(),
  useStaffMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    fetchQuery: fetchQueryMock,
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
    fetchPtSessions: fetchPtSessionsMock,
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

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
    onClick,
    id,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean | 'indeterminate'
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
    onClick?: React.MouseEventHandler<HTMLInputElement>
    id?: string
    'aria-label'?: string
  }) => (
    <input
      id={id}
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked === true}
      data-indeterminate={checked === 'indeterminate' ? 'true' : 'false'}
      disabled={disabled}
      readOnly
      onClick={(event) => {
        onClick?.(event)
        onCheckedChange?.(checked === true ? false : true)
      }}
    />
  ),
}))

import SchedulePage from '@/app/(app)/schedule/page'
import { queryKeys } from '@/lib/query-keys'
import type { TrainerClient } from '@/lib/pt-scheduling'

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  const scheduledDays = overrides.scheduledDays ?? ['Monday']
  const sessionTime = overrides.sessionTime ?? '07:00'
  const trainingPlan = overrides.trainingPlan ?? []

  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 14000,
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
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

function getBadge(container: HTMLDivElement, label: string) {
  const badges = Array.from(container.querySelectorAll('[data-slot="badge"]'))
  const badge = badges.find((candidate) => candidate.textContent?.trim() === label)

  if (!(badge instanceof HTMLElement)) {
    throw new Error(`${label} badge not found.`)
  }

  return badge
}

function getByTestId(container: HTMLDivElement, testId: string) {
  const element = container.querySelector(`[data-testid="${testId}"]`)

  if (!(element instanceof HTMLElement)) {
    throw new Error(`${testId} element not found.`)
  }

  return element
}

function getMonthInput(container: HTMLDivElement) {
  const input = container.querySelector('input[type="month"]')

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Month input not found.')
  }

  return input
}

function getCheckbox(container: HTMLDivElement, label: string) {
  const input = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${label} checkbox not found.`)
  }

  return input
}

async function clickButton(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButton(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function clickCheckbox(container: HTMLDivElement, label: string) {
  await act(async () => {
    getCheckbox(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function clickByTestId(container: HTMLDivElement, testId: string) {
  await act(async () => {
    getByTestId(container, testId).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function scrollElement(element: HTMLElement, scrollLeft: number) {
  await act(async () => {
    element.scrollLeft = scrollLeft
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function createSession(overrides: Partial<{
  id: string
  assignmentId: string
  trainerId: string
  memberId: string
  scheduledAt: string
  status: 'scheduled' | 'cancelled' | 'rescheduled'
  trainingTypeName: string | null
  trainerName: string
  memberName: string
}> = {}) {
  return {
    id: overrides.id ?? 'session-1',
    assignmentId: overrides.assignmentId ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    scheduledAt: overrides.scheduledAt ?? '2026-04-06T07:00:00-05:00',
    status: overrides.status ?? 'scheduled',
    isRecurring: true,
    notes: null,
    trainingTypeName: overrides.trainingTypeName ?? null,
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    memberName: overrides.memberName ?? 'Member One',
  }
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
    fetchPtSessionsMock.mockResolvedValue([])
    fetchQueryMock.mockImplementation(({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn())
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

  it('renders a sticky calendar header and keeps it aligned with the horizontal calendar body', async () => {
    await act(async () => {
      root.render(<SchedulePage />)
    })

    const stickyHeader = getByTestId(container, 'schedule-calendar-sticky-header')
    const headerScroll = getByTestId(container, 'schedule-calendar-header-scroll')
    const scrollWrapper = getByTestId(container, 'schedule-calendar-scroll')
    const calendarSurface = getByTestId(container, 'schedule-calendar-surface')
    const monthHeader = getByTestId(container, 'schedule-calendar-month-header')
    const weekdayHeader = getByTestId(container, 'schedule-calendar-weekday-header')
    const calendarGrid = getByTestId(container, 'schedule-calendar-grid')

    expect(container.textContent?.match(/April 2026/g) ?? []).toHaveLength(2)
    expect(monthHeader.textContent?.trim()).toBe('April 2026')
    expect(stickyHeader.className).toContain('sticky')
    expect(stickyHeader.className).toContain('top-0')
    expect(weekdayHeader.className).toContain('grid-cols-7')
    expect(headerScroll.className).toContain('overflow-x-auto')
    expect(scrollWrapper.className).toContain('overflow-x-auto')
    expect(calendarSurface.className).toContain('min-w-[70rem]')
    expect(calendarGrid.className).toContain('grid-cols-7')
    expect(calendarGrid.className).not.toContain('md:grid-cols-7')

    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(weekdayHeader.textContent).toContain(weekday)
    }

    await scrollElement(scrollWrapper, 240)

    expect(headerScroll.scrollLeft).toBe(240)
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
    await clickByTestId(container, 'generate-assignment-row-assignment-1')

    await clickButton(container, 'Generate')
    await flushAsyncWork()

    expect(fetchQueryMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.sessions({ month: '2026-04' }),
      queryFn: expect.any(Function),
    })
    expect(fetchPtSessionsMock).toHaveBeenCalledWith({
      month: '2026-04',
    })
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

  it('disables generation until at least one assignment is selected and a month is chosen', async () => {
    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')

    expect(getButton(container, 'Generate').disabled).toBe(true)

    await clickByTestId(container, 'generate-assignment-row-assignment-1')

    expect(getButton(container, 'Generate').disabled).toBe(false)

    await act(async () => {
      setInputValue(getMonthInput(container), '')
    })

    expect(getButton(container, 'Generate').disabled).toBe(true)
  })

  it('toggles every assignment from the select-all checkbox', async () => {
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
        }),
        createAssignment({
          id: 'assignment-2',
          memberId: 'member-2',
          memberName: 'Member Two',
          trainerName: 'Alex Coach',
          trainerId: 'trainer-2',
        }),
      ],
      isLoading: false,
    })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')

    expect(container.textContent).toContain('0 of 2 selected')

    await clickCheckbox(container, 'Select all assignments')

    expect(container.textContent).toContain('2 of 2 selected')
    expect(getCheckbox(container, 'Select Member One <-> Jordan Trainer').checked).toBe(true)
    expect(getCheckbox(container, 'Select Member Two <-> Alex Coach').checked).toBe(true)

    await clickCheckbox(container, 'Select all assignments')

    expect(container.textContent).toContain('0 of 2 selected')
    expect(getCheckbox(container, 'Select Member One <-> Jordan Trainer').checked).toBe(false)
    expect(getCheckbox(container, 'Select Member Two <-> Alex Coach').checked).toBe(false)
  })

  it('generates selected assignments sequentially in rendered order', async () => {
    const firstAssignment = createAssignment({
      id: 'assignment-1',
      memberName: 'Member One',
      trainerName: 'Jordan Trainer',
    })
    const secondAssignment = createAssignment({
      id: 'assignment-2',
      memberId: 'member-2',
      memberName: 'Member Two',
      trainerName: 'Alex Coach',
      trainerId: 'trainer-2',
    })
    const firstDeferred = createDeferred<{ ok: true; generated: number; skipped: number }>()

    usePtAssignmentsMock.mockReturnValue({
      data: [firstAssignment, secondAssignment],
      isLoading: false,
    })
    generatePtAssignmentSessionsMock
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockResolvedValueOnce({
        ok: true,
        generated: 2,
        skipped: 0,
      })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')
    await clickByTestId(container, 'generate-assignment-row-assignment-1')
    await clickByTestId(container, 'generate-assignment-row-assignment-2')
    await clickButton(container, 'Generate')

    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledTimes(1)
    expect(generatePtAssignmentSessionsMock).toHaveBeenNthCalledWith(1, 'assignment-1', {
      month: 4,
      year: 2026,
    })

    await act(async () => {
      firstDeferred.resolve({
        ok: true,
        generated: 1,
        skipped: 0,
      })
      await firstDeferred.promise
    })
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledTimes(2)
    expect(generatePtAssignmentSessionsMock).toHaveBeenNthCalledWith(2, 'assignment-2', {
      month: 4,
      year: 2026,
    })
  })

  it('skips assignments that already have sessions in the selected month and reports the mixed summary', async () => {
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
        }),
        createAssignment({
          id: 'assignment-2',
          memberId: 'member-2',
          memberName: 'Member Two',
          trainerName: 'Alex Coach',
          trainerId: 'trainer-2',
        }),
      ],
      isLoading: false,
    })
    fetchPtSessionsMock.mockResolvedValue([
      createSession({
        id: 'session-existing',
        assignmentId: 'assignment-1',
      }),
    ])
    generatePtAssignmentSessionsMock.mockResolvedValue({
      ok: true,
      generated: 2,
      skipped: 0,
    })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')
    await clickCheckbox(container, 'Select all assignments')
    await clickButton(container, 'Generate')
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledTimes(1)
    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledWith('assignment-2', {
      month: 4,
      year: 2026,
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Sessions generated',
      description: 'Sessions generated for 1 assignment. 1 skipped — sessions already exist for the selected month.',
    })
  })

  it('reports when every selected assignment is skipped because sessions already exist', async () => {
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
        }),
        createAssignment({
          id: 'assignment-2',
          memberId: 'member-2',
          memberName: 'Member Two',
          trainerName: 'Alex Coach',
          trainerId: 'trainer-2',
        }),
      ],
      isLoading: false,
    })
    fetchPtSessionsMock.mockResolvedValue([
      createSession({
        id: 'session-1',
        assignmentId: 'assignment-1',
      }),
      createSession({
        id: 'session-2',
        assignmentId: 'assignment-2',
      }),
    ])

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')
    await clickCheckbox(container, 'Select all assignments')
    await clickButton(container, 'Generate')
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: 'No sessions generated',
      description:
        'No sessions were generated. Sessions already exist for the selected month for all selected assignments.',
    })
  })

  it('opens one grouped override prompt and reruns only warned assignments with override', async () => {
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
        }),
        createAssignment({
          id: 'assignment-2',
          memberId: 'member-2',
          memberName: 'Member Two',
          trainerName: 'Alex Coach',
          trainerId: 'trainer-2',
        }),
      ],
      isLoading: false,
    })
    generatePtAssignmentSessionsMock
      .mockResolvedValueOnce({
        ok: false,
        code: 'WEEK_LIMIT_EXCEEDED',
        weeks: ['2026-W15'],
      })
      .mockResolvedValueOnce({
        ok: true,
        generated: 2,
        skipped: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        generated: 1,
        skipped: 0,
      })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')
    await clickCheckbox(container, 'Select all assignments')
    await clickButton(container, 'Generate')
    await flushAsyncWork()

    expect(container.textContent).toContain('Override generation warnings?')
    expect(container.textContent).toContain('1 assignment would exceed 7 sessions in some weeks (2026-W15). Override and generate anyway?')

    await clickButton(container, 'Generate remaining')
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).toHaveBeenNthCalledWith(1, 'assignment-1', {
      month: 4,
      year: 2026,
    })
    expect(generatePtAssignmentSessionsMock).toHaveBeenNthCalledWith(2, 'assignment-2', {
      month: 4,
      year: 2026,
    })
    expect(generatePtAssignmentSessionsMock).toHaveBeenNthCalledWith(3, 'assignment-1', {
      month: 4,
      year: 2026,
      override: true,
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Sessions generated',
      description: 'Sessions generated for 2 assignments.',
    })
  })

  it('finalizes partial results when the grouped override is declined', async () => {
    usePtAssignmentsMock.mockReturnValue({
      data: [
        createAssignment({
          id: 'assignment-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
        }),
        createAssignment({
          id: 'assignment-2',
          memberId: 'member-2',
          memberName: 'Member Two',
          trainerName: 'Alex Coach',
          trainerId: 'trainer-2',
        }),
      ],
      isLoading: false,
    })
    generatePtAssignmentSessionsMock
      .mockResolvedValueOnce({
        ok: false,
        code: 'WEEK_LIMIT_EXCEEDED',
        weeks: ['2026-W15'],
      })
      .mockResolvedValueOnce({
        ok: true,
        generated: 2,
        skipped: 0,
      })

    await act(async () => {
      root.render(<SchedulePage />)
    })

    await clickButton(container, 'Generate Sessions')
    await clickCheckbox(container, 'Select all assignments')
    await clickButton(container, 'Generate')
    await flushAsyncWork()
    await clickButton(container, 'Cancel')
    await flushAsyncWork()

    expect(generatePtAssignmentSessionsMock).toHaveBeenCalledTimes(2)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Sessions generated',
      description: 'Sessions generated for 1 assignment. 1 not generated — override was not confirmed.',
    })
  })
})
