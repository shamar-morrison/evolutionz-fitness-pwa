// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClassScheduleRule,
  ClassSessionListItem,
  ClassWithTrainers,
  ClassRegistrationListItem,
} from '@/lib/classes'

const {
  authState,
  createClassRegistrationMock,
  createClassScheduleRuleMock,
  deleteClassScheduleRuleMock,
  generateClassSessionsMock,
  invalidateQueriesMock,
  pushMock,
  toastMock,
  useClassScheduleRulesMock,
  useClassSessionsMock,
  useClassDetailMock,
  useClassRegistrationsMock,
  useClassesMock,
  useMembersMock,
} = vi.hoisted(() => ({
  authState: {
    role: 'admin' as 'admin' | 'staff' | null,
    profile: {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin' as 'admin' | 'staff',
      titles: ['Owner'],
    },
    loading: false,
  },
  createClassRegistrationMock: vi.fn(),
  createClassScheduleRuleMock: vi.fn(),
  deleteClassScheduleRuleMock: vi.fn(),
  generateClassSessionsMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  toastMock: vi.fn(),
  useClassScheduleRulesMock: vi.fn(),
  useClassSessionsMock: vi.fn(),
  useClassDetailMock: vi.fn(),
  useClassRegistrationsMock: vi.fn(),
  useClassesMock: vi.fn(),
  useMembersMock: vi.fn(),
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

vi.mock('next/navigation', () => ({
  useParams: () => ({
    id: 'class-1',
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-classes', () => ({
  useClasses: useClassesMock,
  useClassDetail: useClassDetailMock,
  useClassRegistrations: useClassRegistrationsMock,
  useClassScheduleRules: useClassScheduleRulesMock,
  useClassSessions: useClassSessionsMock,
}))

vi.mock('@/hooks/use-members', () => ({
  useMembers: useMembersMock,
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-back-link', () => ({
  useBackLink: () => '/classes',
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/classes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/classes')>('@/lib/classes')

  return {
    ...actual,
    createClassRegistration: createClassRegistrationMock,
    createClassScheduleRule: createClassScheduleRuleMock,
    deleteClassScheduleRule: deleteClassScheduleRuleMock,
    generateClassSessions: generateClassSessionsMock,
  }
})

vi.mock('@/components/class-attendance-dialog', () => ({
  ClassAttendanceDialog: ({
    open,
    readOnly,
  }: {
    open: boolean
    readOnly: boolean
  }) => (open ? <div>{readOnly ? 'Attendance dialog (read-only)' : 'Attendance dialog'}</div> : null),
}))

vi.mock('@/components/searchable-select', () => ({
  SearchableSelect: ({
    value,
    onValueChange,
    options,
  }: {
    value: string | null
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
  }) => (
    <select
      aria-label="Member"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">Select a member</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open?: boolean
  }) => (open ?? true ? <div>{children}</div> : null),
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
  Calendar: () => null,
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  TabsList: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  TabsTrigger: ({ children }: React.ComponentProps<'button'>) => <button type="button">{children}</button>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <select
      aria-label="Day of week"
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: React.ComponentProps<'div'>) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: React.ComponentProps<'div'>) => <>{children}</>,
  SelectValue: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

import ClassesPage from '@/app/(app)/classes/page'
import ClassDetailPage from '@/app/(app)/classes/[id]/page'
import { ClassRegistrationDialog } from '@/components/class-registration-dialog'

function buildClass(overrides: Partial<ClassWithTrainers> = {}): ClassWithTrainers {
  return {
    id: overrides.id ?? 'class-1',
    name: overrides.name ?? 'Weight Loss Club',
    schedule_description: overrides.schedule_description ?? '3 times per week',
    per_session_fee: overrides.per_session_fee ?? null,
    monthly_fee: overrides.monthly_fee ?? 15500,
    trainer_compensation_pct: overrides.trainer_compensation_pct ?? 30,
    current_period_start:
      Object.prototype.hasOwnProperty.call(overrides, 'current_period_start')
        ? (overrides.current_period_start ?? null)
        : '2026-04-01',
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
    trainers:
      overrides.trainers ??
      [
        {
          id: 'trainer-1',
          name: 'Jordan Trainer',
          titles: ['Trainer'],
        },
      ],
  }
}

function buildRegistration(
  overrides: Partial<ClassRegistrationListItem> = {},
): ClassRegistrationListItem {
  return {
    id: overrides.id ?? 'registration-1',
    class_id: overrides.class_id ?? 'class-1',
    member_id: overrides.member_id ?? 'member-1',
    guest_profile_id: overrides.guest_profile_id ?? null,
    month_start: overrides.month_start ?? '2026-04-10',
    status: overrides.status ?? 'approved',
    amount_paid: overrides.amount_paid ?? 15500,
    payment_recorded_at: overrides.payment_recorded_at ?? '2026-04-08T12:00:00.000Z',
    reviewed_by: overrides.reviewed_by ?? 'user-1',
    reviewed_at: overrides.reviewed_at ?? '2026-04-08T12:00:00.000Z',
    review_note: overrides.review_note ?? null,
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
    registrant_name: overrides.registrant_name ?? 'Client One',
    registrant_type: overrides.registrant_type ?? 'member',
  }
}

function buildScheduleRule(overrides: Partial<ClassScheduleRule> = {}): ClassScheduleRule {
  return {
    id: overrides.id ?? 'rule-1',
    class_id: overrides.class_id ?? 'class-1',
    day_of_week: overrides.day_of_week ?? 1,
    session_time: overrides.session_time ?? '09:00:00',
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
  }
}

function buildSession(overrides: Partial<ClassSessionListItem> = {}): ClassSessionListItem {
  return {
    id: overrides.id ?? 'session-1',
    class_id: overrides.class_id ?? 'class-1',
    scheduled_at: overrides.scheduled_at ?? '2026-04-14T09:00:00-05:00',
    period_start: overrides.period_start ?? '2026-04-01',
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
    marked_count: overrides.marked_count ?? 1,
    total_count: overrides.total_count ?? 2,
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

function getInputByLabel(container: HTMLDivElement, label: string) {
  const field = Array.from(container.querySelectorAll('input, select')).find((candidate) => {
    if (!(candidate instanceof HTMLElement)) {
      return false
    }

    const ariaLabel = candidate.getAttribute('aria-label')

    if (ariaLabel === label) {
      return true
    }

    const id = candidate.getAttribute('id')

    if (!id) {
      return false
    }

    const labelNode = container.querySelector(`label[for="${id}"]`)
    return labelNode?.textContent?.trim() === label
  })

  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
    throw new Error(`${label} field not found.`)
  }

  return field
}

async function clickButton(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButton(container, label).click()
  })
}

async function clickButtonByAriaLabel(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.click()
  })
}

async function setInputValue(
  field: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')
    const setValue = descriptor?.set

    if (!setValue) {
      throw new Error('Field value setter is unavailable.')
    }

    setValue.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('classes pages', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    ;(globalThis as typeof globalThis & {
      ResizeObserver?: new () => {
        observe: () => void
        unobserve: () => void
        disconnect: () => void
      }
    }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    authState.role = 'admin'
    authState.profile = {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    }
    authState.loading = false
    useClassesMock.mockReturnValue({
      classes: [buildClass()],
      isLoading: false,
      error: null,
    })
    useClassDetailMock.mockReturnValue({
      classItem: buildClass(),
      isLoading: false,
      error: null,
    })
    useClassRegistrationsMock.mockImplementation((_classId: string, status?: string) => ({
      registrations:
        status === 'pending'
          ? [buildRegistration({ id: 'registration-2', status: 'pending' })]
          : [buildRegistration()],
      isLoading: false,
      error: null,
    }))
    useClassScheduleRulesMock.mockReturnValue({
      scheduleRules: [buildScheduleRule()],
      isLoading: false,
      error: null,
    })
    useClassSessionsMock.mockReturnValue({
      sessions: [buildSession()],
      isLoading: false,
      error: null,
    })
    useMembersMock.mockReturnValue({
      members: [
        {
          id: 'member-1',
          employeeNo: 'EMP001',
          name: 'Client One',
          type: 'General',
          status: 'Active',
        },
      ],
      isLoading: false,
      error: null,
    })
    createClassRegistrationMock.mockResolvedValue(buildRegistration({ status: 'approved' }))
    createClassScheduleRuleMock.mockResolvedValue(buildScheduleRule())
    deleteClassScheduleRuleMock.mockResolvedValue(undefined)
    generateClassSessionsMock.mockResolvedValue(1)
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

  it('renders the classes index cards', async () => {
    await act(async () => {
      root.render(<ClassesPage />)
    })

    expect(container.textContent).toContain('Classes')
    expect(container.textContent).toContain('Weight Loss Club')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('View')
  })

  it('shows the full class detail controls for admins', async () => {
    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    expect(container.textContent).toContain('Schedule')
    expect(container.textContent).toContain('Add Rule')
    expect(container.textContent).toContain('Generate Sessions')
    expect(container.textContent).toContain('Set Period Start')
    expect(container.textContent).toContain('Register')
    expect(container.textContent).toContain('Pending Approvals')
    expect(container.textContent).toContain('Registrations')
    expect(container.textContent).toContain('Sessions')
    expect(container.textContent).toContain('Mark Attendance')
  })

  it('hides admin-only class detail controls for staff users', async () => {
    authState.role = 'staff'
    authState.profile = {
      id: 'user-2',
      name: 'Assistant User',
      role: 'staff',
      titles: ['Assistant'],
    }

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    expect(container.textContent).toContain('Register')
    expect(container.textContent).not.toContain('Set Period Start')
    expect(container.textContent).not.toContain('Pending Approvals')
    expect(container.textContent).toContain('Sessions')
    expect(container.textContent).toContain('Mark Attendance')
  })

  it('opens the add rule dialog and saves a new schedule rule', async () => {
    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButton(container, 'Add Rule')

    const dayField = getInputByLabel(container, 'Day of week')
    const timeField = getInputByLabel(container, 'Session time')
    await setInputValue(dayField, '4')
    await setInputValue(timeField, '11:30')
    await clickButton(container, 'Save')

    expect(createClassScheduleRuleMock).toHaveBeenCalledWith('class-1', {
      day_of_week: 4,
      session_time: '11:30',
    })
  })

  it('shows generate-session warnings when the current period start and rules are missing', async () => {
    useClassDetailMock.mockReturnValue({
      classItem: buildClass({
        current_period_start: null,
      }),
      isLoading: false,
      error: null,
    })
    useClassScheduleRulesMock.mockReturnValue({
      scheduleRules: [],
      isLoading: false,
      error: null,
    })
    useClassSessionsMock.mockReturnValue({
      sessions: [],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButton(container, 'Generate Sessions')

    expect(container.textContent).toContain('Set a period start date before generating sessions.')
    expect(container.textContent).toContain('Add schedule rules before generating sessions.')
  })

  it('allows admins to remove preview rows before confirming session generation', async () => {
    useClassScheduleRulesMock.mockReturnValue({
      scheduleRules: [buildScheduleRule({ day_of_week: 1 })],
      isLoading: false,
      error: null,
    })
    useClassSessionsMock.mockReturnValue({
      sessions: [buildSession()],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButton(container, 'Generate Sessions')
    await clickButtonByAriaLabel(container, 'Remove 2026-04-06T09:00:00-05:00')
    await clickButton(container, 'Confirm')

    expect(generateClassSessionsMock).toHaveBeenCalledWith('class-1', {
      sessions: [
        { scheduled_at: '2026-04-13T09:00:00-05:00' },
        { scheduled_at: '2026-04-20T09:00:00-05:00' },
        { scheduled_at: '2026-04-27T09:00:00-05:00' },
      ],
    })
  })

  it('shows a read-only attendance action for trainer-title staff', async () => {
    authState.role = 'staff'
    authState.profile = {
      id: 'trainer-1',
      name: 'Jordan Trainer',
      role: 'staff',
      titles: ['Trainer'],
    }

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    expect(container.textContent).toContain('View Attendance')
    expect(container.textContent).not.toContain('Mark Attendance')

    await clickButton(container, 'View Attendance')

    expect(container.textContent).toContain('Attendance dialog (read-only)')
  })

  it('shows an empty sessions state when no current-period sessions exist', async () => {
    useClassSessionsMock.mockReturnValue({
      sessions: [],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    expect(container.textContent).toContain('No sessions generated for this period.')
  })

  it('advances through the registration dialog and submits the selected member registration', async () => {
    authState.role = 'staff'
    authState.profile = {
      id: 'user-2',
      name: 'Assistant User',
      role: 'staff',
      titles: ['Assistant'],
    }

    await act(async () => {
      root.render(
        <ClassRegistrationDialog
          classItem={buildClass({
            current_period_start: null,
          })}
          open
          onOpenChange={() => {}}
        />,
      )
    })

    const memberField = getInputByLabel(container, 'Member')
    await setInputValue(memberField, 'member-1')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 2 of 2')
    expect(container.textContent).toContain('15,500')
    expect(container.textContent).toContain('Payment received')

    await clickButton(container, 'Submit for Approval')

    expect(createClassRegistrationMock).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        registrant_type: 'member',
        member_id: 'member-1',
        amount_paid: 15500,
        payment_received: true,
      }),
    )
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(3)
  })
})
