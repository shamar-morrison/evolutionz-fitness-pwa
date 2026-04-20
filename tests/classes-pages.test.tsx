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
  assignClassTrainerMock,
  createClassRegistrationMock,
  createClassRegistrationEditRequestMock,
  createClassRegistrationRemovalRequestMock,
  createClassScheduleRuleMock,
  deleteClassRegistrationMock,
  deleteClassScheduleRuleMock,
  generateClassSessionsMock,
  invalidateQueriesMock,
  pushMock,
  replaceMock,
  removeClassTrainerMock,
  toastMock,
  updateClassRegistrationMock,
  useClassScheduleRulesMock,
  useClassSessionsMock,
  useClassDetailMock,
  useClassRegistrationsMock,
  useClassTrainersMock,
  useClassesMock,
  useMembersMock,
  useStaffMock,
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
  assignClassTrainerMock: vi.fn(),
  createClassRegistrationMock: vi.fn(),
  createClassRegistrationEditRequestMock: vi.fn(),
  createClassRegistrationRemovalRequestMock: vi.fn(),
  createClassScheduleRuleMock: vi.fn(),
  deleteClassRegistrationMock: vi.fn(),
  deleteClassScheduleRuleMock: vi.fn(),
  generateClassSessionsMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  removeClassTrainerMock: vi.fn(),
  toastMock: vi.fn(),
  updateClassRegistrationMock: vi.fn(),
  useClassScheduleRulesMock: vi.fn(),
  useClassSessionsMock: vi.fn(),
  useClassDetailMock: vi.fn(),
  useClassRegistrationsMock: vi.fn(),
  useClassTrainersMock: vi.fn(),
  useClassesMock: vi.fn(),
  useMembersMock: vi.fn(),
  useStaffMock: vi.fn(),
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
  useClassTrainers: useClassTrainersMock,
}))

vi.mock('@/hooks/use-members', () => ({
  useMembers: useMembersMock,
}))

vi.mock('@/hooks/use-staff', () => ({
  useStaff: useStaffMock,
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
    replace: replaceMock,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/class-registration-requests', () => ({
  createClassRegistrationEditRequest: createClassRegistrationEditRequestMock,
  createClassRegistrationRemovalRequest: createClassRegistrationRemovalRequestMock,
}))

vi.mock('@/lib/classes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/classes')>('@/lib/classes')

  return {
    ...actual,
    assignClassTrainer: assignClassTrainerMock,
    createClassRegistration: createClassRegistrationMock,
    deleteClassRegistration: deleteClassRegistrationMock,
    createClassScheduleRule: createClassScheduleRuleMock,
    deleteClassScheduleRule: deleteClassScheduleRuleMock,
    generateClassSessions: generateClassSessionsMock,
    removeClassTrainer: removeClassTrainerMock,
    updateClassRegistration: updateClassRegistrationMock,
  }
})

vi.mock('@/components/ui/radio-group', async () => {
  const React = await import('react')
  const RadioGroupContext = React.createContext<{
    value: string
    onValueChange?: (value: string) => void
  }>({
    value: '',
  })

  return {
    RadioGroup: ({
      children,
      value,
      onValueChange,
      className,
    }: any) => (
      <RadioGroupContext.Provider value={{ value: value ?? '', onValueChange }}>
        <div className={className}>{children}</div>
      </RadioGroupContext.Provider>
    ),
    RadioGroupItem: ({
      value,
      id,
    }: any) => {
      const context = React.useContext(RadioGroupContext)

      return (
        <input
          id={id}
          type="radio"
          value={value}
          checked={context.value === value}
          onChange={() => context.onValueChange?.(value)}
        />
      )
    },
  }
})

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    onOpenChange,
  }: {
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel?: () => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button
          type="button"
          onClick={() => {
            onCancel?.()
            onOpenChange(false)
          }}
        >
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}))

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
    placeholder,
  }: {
    value: string | null
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <select
      aria-label={placeholder?.toLowerCase().includes('trainer') ? 'Trainer' : 'Member'}
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">{placeholder ?? 'Select an option'}</option>
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
    per_session_fee:
      Object.prototype.hasOwnProperty.call(overrides, 'per_session_fee')
        ? (overrides.per_session_fee ?? null)
        : null,
    monthly_fee:
      Object.prototype.hasOwnProperty.call(overrides, 'monthly_fee')
        ? (overrides.monthly_fee ?? null)
        : 15500,
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
    fee_type: overrides.fee_type ?? 'monthly',
    amount_paid: overrides.amount_paid ?? 15500,
    payment_recorded_at: overrides.payment_recorded_at ?? '2026-04-08T12:00:00.000Z',
    notes: overrides.notes ?? null,
    receipt_number: overrides.receipt_number ?? null,
    receipt_sent_at: overrides.receipt_sent_at ?? null,
    reviewed_by: overrides.reviewed_by ?? 'user-1',
    reviewed_at: overrides.reviewed_at ?? '2026-04-08T12:00:00.000Z',
    review_note: overrides.review_note ?? null,
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
    registrant_name: overrides.registrant_name ?? 'Client One',
    registrant_type: overrides.registrant_type ?? 'member',
    registrant_email: overrides.registrant_email ?? 'client.one@example.com',
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

function buildStaffProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'trainer-1',
    name: 'Jordan Trainer',
    email: 'jordan@evolutionzfitness.com',
    role: 'staff',
    titles: ['Trainer'],
    phone: null,
    gender: null,
    remark: null,
    specialties: [],
    photoUrl: null,
    archivedAt: null,
    created_at: '2026-04-03T00:00:00.000Z',
    ...overrides,
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

function getCompactTables(container: HTMLDivElement) {
  return Array.from(container.querySelectorAll('table[data-size="compact"]'))
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
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
    useClassTrainersMock.mockReturnValue({
      trainers: buildClass().trainers,
      isLoading: false,
      error: null,
    })
    useClassSessionsMock.mockReturnValue({
      sessions: [buildSession()],
      isLoading: false,
      error: null,
    })
    useStaffMock.mockReturnValue({
      staff: [
        buildStaffProfile(),
        buildStaffProfile({
          id: 'trainer-2',
          name: 'Alex Coach',
          titles: ['Trainer', 'Medical'],
          email: 'alex@evolutionzfitness.com',
        }),
        buildStaffProfile({
          id: 'assistant-1',
          name: 'Casey Assistant',
          titles: ['Assistant'],
          email: 'casey@evolutionzfitness.com',
        }),
      ],
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
    createClassRegistrationEditRequestMock.mockResolvedValue({ ok: true, requestId: 'request-1' })
    createClassRegistrationRemovalRequestMock.mockResolvedValue({ ok: true, requestId: 'request-2' })
    assignClassTrainerMock.mockResolvedValue({
      class_id: 'class-1',
      profile_id: 'trainer-2',
      created_at: '2026-04-08T12:00:00.000Z',
    })
    createClassScheduleRuleMock.mockResolvedValue(buildScheduleRule())
    deleteClassRegistrationMock.mockResolvedValue(undefined)
    deleteClassScheduleRuleMock.mockResolvedValue(undefined)
    generateClassSessionsMock.mockResolvedValue(1)
    removeClassTrainerMock.mockResolvedValue(undefined)
    updateClassRegistrationMock.mockResolvedValue({
      registration: buildRegistration(),
      amountChanged: false,
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

  it('renders the classes index cards for front desk staff', async () => {
    authState.role = 'staff'
    authState.profile = {
      id: 'user-2',
      name: 'Assistant User',
      role: 'staff',
      titles: ['Assistant'],
    }

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

    expect(getCompactTables(container)).toHaveLength(3)
    expect(container.textContent).toContain('Class Information')
    expect(container.textContent).not.toContain('3 times per week')
    expect(getButton(container, 'Add Trainer').className).toContain('w-full')
    expect(getButton(container, 'Add Rule').className).toContain('w-full')
    expect(container.textContent).toContain('Assign or remove trainer-title staff for this class.')
    expect(container.textContent).toContain('Add Trainer')
    expect(container.textContent).toContain('Schedule')
    expect(container.textContent).toContain('Add Rule')
    expect(getButtonByAriaLabel(container, 'Remove trainer Jordan Trainer').textContent).toContain(
      'Remove',
    )
    expect(getButtonByAriaLabel(container, 'Remove Monday schedule rule').textContent).toContain(
      'Remove',
    )
    expect(container.textContent).toContain('Generate Sessions')
    expect(container.textContent).toContain('Set Period Start')
    expect(container.textContent).toContain('Register')
    expect(container.textContent).toContain('Pending Approvals')
    expect(container.textContent).toContain('Registrations')
    expect(container.textContent).toContain('Sessions')
    expect(container.textContent).toContain('Mark Attendance')
  })

  it('shows registration controls for front desk staff without admin approval tools', async () => {
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

    expect(getCompactTables(container)).toHaveLength(2)
    expect(container.textContent).toContain('Class Information')
    expect(container.textContent).not.toContain('3 times per week')
    expect(container.textContent).toContain('Register')
    expect(container.textContent).toContain('Registrations')
    expect(container.textContent).toContain('Review the recurring class schedule.')
    expect(container.textContent).toContain('Monday')
    expect(container.textContent).not.toContain('Assign or remove trainer-title staff for this class.')
    expect(container.textContent).not.toContain('Add Trainer')
    expect(container.textContent).not.toContain('Add Rule')
    expect(container.textContent).not.toContain('Set Period Start')
    expect(container.textContent).not.toContain('Generate Sessions')
    expect(container.textContent).not.toContain('Pending Approvals')
    expect(container.textContent).toContain('Edit')
    expect(container.textContent).toContain('Remove')
    expect(container.textContent).toContain('Sessions')
    expect(container.textContent).toContain('Mark Attendance')
  })

  it('redirects unauthorized users away from the class detail page instead of rendering blank', async () => {
    authState.role = 'staff'
    authState.profile = {
      id: 'user-4',
      name: 'Medical Staff',
      role: 'staff',
      titles: ['Medical'],
    }

    await act(async () => {
      root.render(<ClassDetailPage />)
      await Promise.resolve()
    })

    expect(replaceMock).toHaveBeenCalledWith('/unauthorized')
  })

  it('keys schedule-management controls off the owner permission path instead of auth role alone', async () => {
    authState.role = 'admin'
    authState.profile = {
      id: 'user-3',
      name: 'Front Desk',
      role: 'admin',
      titles: ['Administrative Assistant'],
    }

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    expect(getCompactTables(container)).toHaveLength(2)
    expect(container.textContent).toContain('Class Information')
    expect(container.textContent).not.toContain('3 times per week')
    expect(container.textContent).toContain('Register')
    expect(container.textContent).toContain('Registrations')
    expect(container.textContent).toContain('Review the recurring class schedule.')
    expect(container.textContent).not.toContain('Assign or remove trainer-title staff for this class.')
    expect(container.textContent).not.toContain('Set Period Start')
    expect(container.textContent).not.toContain('Pending Approvals')
    expect(container.textContent).toContain('Edit')
    expect(container.textContent).toContain('Remove')
    expect(container.textContent).toContain('Mark Attendance')
  })

  it('uses registration request flows when auth role is admin but classes.manage is unavailable', async () => {
    authState.role = 'admin'
    authState.profile = {
      id: 'user-3',
      name: 'Front Desk',
      role: 'admin',
      titles: ['Administrative Assistant'],
    }

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButton(container, 'Edit')

    expect(container.textContent).toContain('Request Registration Edit')

    await clickButton(container, 'Submit Request')

    expect(createClassRegistrationEditRequestMock).toHaveBeenCalledWith(
      'registration-1',
      expect.objectContaining({
        period_start: '2026-04-10',
        fee_type: 'monthly',
        amount_paid: 15500,
        payment_received: true,
        notes: null,
      }),
    )
    expect(updateClassRegistrationMock).not.toHaveBeenCalled()

    await clickButton(container, 'Remove')

    expect(container.textContent).toContain('Request registration removal?')

    await clickButton(container, 'Submit Request')

    expect(createClassRegistrationRemovalRequestMock).toHaveBeenCalledWith('registration-1')
    expect(deleteClassRegistrationMock).not.toHaveBeenCalled()
  })

  it('shows an empty trainer state when no trainers are assigned', async () => {
    useClassDetailMock.mockReturnValue({
      classItem: buildClass({ trainers: [] }),
      isLoading: false,
      error: null,
    })
    useClassTrainersMock.mockReturnValue({
      trainers: [],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    expect(container.textContent).toContain('No trainers assigned to this class')
  })

  it('filters the add trainer options to unassigned trainer-title staff', async () => {
    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButton(container, 'Add Trainer')

    const trainerField = getInputByLabel(container, 'Trainer')

    if (!(trainerField instanceof HTMLSelectElement)) {
      throw new Error('Trainer field was not rendered as a select.')
    }

    expect(Array.from(trainerField.options).map((option) => option.textContent?.trim())).toEqual([
      'Select a trainer',
      'Alex Coach',
    ])
  })

  it('assigns a trainer from the dialog and invalidates the trainer queries', async () => {
    useClassTrainersMock.mockReturnValue({
      trainers: [],
      isLoading: false,
      error: null,
    })
    useClassDetailMock.mockReturnValue({
      classItem: buildClass({ trainers: [] }),
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButton(container, 'Add Trainer')
    const trainerField = getInputByLabel(container, 'Trainer')
    await setInputValue(trainerField, 'trainer-2')
    await clickButton(container, 'Save')

    expect(assignClassTrainerMock).toHaveBeenCalledWith('class-1', {
      profile_id: 'trainer-2',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['classes', 'trainers', 'class-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['classes', 'detail', 'class-1'],
    })
    expect(container.textContent).not.toContain('Assign a trainer-title staff profile to this class.')
  })

  it('confirms trainer removal and invalidates the trainer queries', async () => {
    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButtonByAriaLabel(container, 'Remove trainer Jordan Trainer')

    expect(container.textContent).toContain('Remove trainer from class?')

    await clickButton(container, 'Remove Trainer')

    expect(removeClassTrainerMock).toHaveBeenCalledWith('class-1', 'trainer-1')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['classes', 'trainers', 'class-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['classes', 'detail', 'class-1'],
    })
  })

  it('shows row-scoped loading state while removing a trainer', async () => {
    const trainers = [
      {
        id: 'trainer-1',
        name: 'Jordan Trainer',
        titles: ['Trainer'],
      },
      {
        id: 'trainer-2',
        name: 'Alex Coach',
        titles: ['Trainer', 'Medical'],
      },
    ]
    const deferred = createDeferred<void>()

    useClassDetailMock.mockReturnValue({
      classItem: buildClass({ trainers }),
      isLoading: false,
      error: null,
    })
    useClassTrainersMock.mockReturnValue({
      trainers,
      isLoading: false,
      error: null,
    })
    removeClassTrainerMock.mockImplementationOnce(() => deferred.promise)

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButtonByAriaLabel(container, 'Remove trainer Jordan Trainer')
    await clickButton(container, 'Remove Trainer')

    const pendingButton = getButtonByAriaLabel(container, 'Remove trainer Jordan Trainer')
    const idleButton = getButtonByAriaLabel(container, 'Remove trainer Alex Coach')

    expect(pendingButton.disabled).toBe(true)
    expect(pendingButton.querySelector('[aria-label="Loading"]')).not.toBeNull()
    expect(idleButton.disabled).toBe(false)
    expect(idleButton.querySelector('[aria-label="Loading"]')).toBeNull()

    await act(async () => {
      deferred.resolve(undefined)
      await deferred.promise
    })
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

  it('shows row-scoped loading state while deleting a schedule rule', async () => {
    const deferred = createDeferred<void>()

    useClassScheduleRulesMock.mockReturnValue({
      scheduleRules: [
        buildScheduleRule({ id: 'rule-1', day_of_week: 1 }),
        buildScheduleRule({ id: 'rule-2', day_of_week: 2, session_time: '11:00:00' }),
      ],
      isLoading: false,
      error: null,
    })
    deleteClassScheduleRuleMock.mockImplementationOnce(() => deferred.promise)

    await act(async () => {
      root.render(<ClassDetailPage />)
    })

    await clickButtonByAriaLabel(container, 'Remove Monday schedule rule')

    const pendingButton = getButtonByAriaLabel(container, 'Remove Monday schedule rule')
    const idleButton = getButtonByAriaLabel(container, 'Remove Tuesday schedule rule')

    expect(pendingButton.disabled).toBe(true)
    expect(pendingButton.querySelector('[aria-label="Loading"]')).not.toBeNull()
    expect(idleButton.disabled).toBe(false)
    expect(idleButton.querySelector('[aria-label="Loading"]')).toBeNull()

    await act(async () => {
      deferred.resolve(undefined)
      await deferred.promise
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

    expect(() => getButton(container, 'Register')).toThrow()
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

  it(
    'advances through the registration dialog and submits the selected member registration',
    async () => {
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
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Registration submitted',
      }),
    )
    },
    10_000,
  )

  it('blocks class registration submission when the custom fee is blank', async () => {
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
            monthly_fee: null,
            per_session_fee: null,
          })}
          open
          onOpenChange={() => {}}
        />,
      )
    })

    const memberField = getInputByLabel(container, 'Member')
    await setInputValue(memberField, 'member-1')
    await clickButton(container, 'Next')
    await clickButton(container, 'Submit for Approval')

    expect(createClassRegistrationMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Custom fee required',
      }),
    )
  })

  it('shows an inline error and blocks guest registration when the email format is invalid', async () => {
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

    const guestRadio = container.querySelector('#registrant-guest')

    if (!(guestRadio instanceof HTMLInputElement)) {
      throw new Error('Guest radio not found.')
    }

    await act(async () => {
      guestRadio.click()
    })

    const guestNameField = getInputByLabel(container, 'Guest name')
    const guestEmailField = getInputByLabel(container, 'Email')

    await setInputValue(guestNameField, 'Guest One')
    await setInputValue(guestEmailField, 'guest.one@invalid@domain')

    expect(container.textContent).toContain('Enter a valid email address.')
    expect((guestEmailField as HTMLInputElement).getAttribute('aria-invalid')).toBe('true')
    expect(getButton(container, 'Next').disabled).toBe(true)

    const form = container.querySelector('form')

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Registration form not found.')
    }

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(createClassRegistrationMock).not.toHaveBeenCalled()
  })

  it('keeps successful registration UX when onRegistered throws', async () => {
    const onOpenChange = vi.fn()
    const onRegistered = vi.fn(() => {
      throw new Error('Callback failed.')
    })
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await act(async () => {
        root.render(
          <ClassRegistrationDialog
            classItem={buildClass({
              current_period_start: null,
            })}
            open
            onOpenChange={onOpenChange}
            onRegistered={onRegistered}
          />,
        )
      })

      const memberField = getInputByLabel(container, 'Member')
      await setInputValue(memberField, 'member-1')
      await clickButton(container, 'Next')
      await clickButton(container, 'Register')

      expect(createClassRegistrationMock).toHaveBeenCalled()
      expect(onRegistered).toHaveBeenCalledTimes(1)
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Class registration succeeded but onRegistered failed:',
        expect.any(Error),
      )
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Registration added',
        }),
      )
      expect(toastMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Registration failed',
        }),
      )
    } finally {
      consoleErrorMock.mockRestore()
    }
  })
})
