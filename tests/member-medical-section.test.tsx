// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  completeMedicalAssignmentMock,
  createMedicalAssignmentMock,
  invalidateQueriesMock,
  toastMock,
  useMedicalAssignmentsMock,
  useStaffMock,
} = vi.hoisted(() => ({
  completeMedicalAssignmentMock: vi.fn(),
  createMedicalAssignmentMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  useMedicalAssignmentsMock: vi.fn(),
  useStaffMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-medical', () => ({
  useMedicalAssignments: useMedicalAssignmentsMock,
}))

vi.mock('@/hooks/use-staff', () => ({
  useStaff: useStaffMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/medical', () => ({
  completeMedicalAssignment: completeMedicalAssignmentMock,
  createMedicalAssignment: createMedicalAssignmentMock,
  formatMedicalDate: (value: string) => value,
  formatMedicalDateFromTimestamp: (value: string) => value,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
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
      aria-label="Medical/Consultant Staff"
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

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  CardContent: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
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
  DialogFooter: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: React.ComponentProps<'label'>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: React.ComponentProps<'div'>) => <div className={className} />,
}))

import { MemberMedicalSection } from '@/components/member-medical-section'

function createStaff(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'medical-1',
    name: 'Morgan Medical',
    titles: ['Medical/Consultant'],
    archivedAt: null,
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

function getStaffSelect(container: HTMLDivElement) {
  const select = container.querySelector('select[aria-label="Medical/Consultant Staff"]')

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error('Medical staff select not found.')
  }

  return select
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(select),
    'value',
  )
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Select value setter is unavailable.')
  }

  setValue.call(select, value)
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
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

describe('MemberMedicalSection', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useMedicalAssignmentsMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    useStaffMock.mockReturnValue({
      staff: [createStaff()],
      isLoading: false,
    })
    createMedicalAssignmentMock.mockResolvedValue({
      id: 'assignment-1',
      staffName: 'Morgan Medical',
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

  it('renders the assignment modal without a follow-up date field and submits only member and staff ids', async () => {
    await act(async () => {
      root.render(<MemberMedicalSection memberId="member-1" />)
    })

    await clickButton(container, 'Assign to Medical Staff')

    expect(container.textContent).not.toContain('Follow-up Date')
    expect(container.querySelector('input[type="date"]')).toBeNull()

    await act(async () => {
      setSelectValue(getStaffSelect(container), 'medical-1')
    })

    await clickButton(container, 'Assign')
    await flushAsyncWork()

    expect(createMedicalAssignmentMock).toHaveBeenCalledWith({
      memberId: 'member-1',
      staffId: 'medical-1',
    })
    expect(createMedicalAssignmentMock.mock.calls[0]?.[0]).not.toHaveProperty('followUpDate')
  })
})
