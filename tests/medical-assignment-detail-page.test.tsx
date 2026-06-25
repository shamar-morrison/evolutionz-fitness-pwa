// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  addMedicalVisitNoteMock,
  completeMedicalAssignmentMock,
  invalidateQueriesMock,
  pushMock,
  toastMock,
  updateMedicalAssignmentFollowUpMock,
  useMedicalAssignmentMock,
  useMedicalVisitNotesMock,
} = vi.hoisted(() => ({
  addMedicalVisitNoteMock: vi.fn(),
  completeMedicalAssignmentMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  toastMock: vi.fn(),
  updateMedicalAssignmentFollowUpMock: vi.fn(),
  useMedicalAssignmentMock: vi.fn(),
  useMedicalVisitNotesMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({
    assignmentId: 'assignment-1',
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/hooks/use-medical', () => ({
  useMedicalAssignment: useMedicalAssignmentMock,
  useMedicalVisitNotes: useMedicalVisitNotesMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/medical', () => ({
  addMedicalVisitNote: addMedicalVisitNoteMock,
  completeMedicalAssignment: completeMedicalAssignmentMock,
  formatMedicalDate: (value: string | null | undefined) => value ?? 'Not set',
  formatMedicalDateFromTimestamp: (value: string | null | undefined) => value ?? 'Unknown',
  formatMedicalTimestamp: (value: string | null | undefined) => value ?? 'Unknown',
  getTodayMedicalDateValue: () => '2026-05-23',
  updateMedicalAssignmentFollowUp: updateMedicalAssignmentFollowUpMock,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    cancelLabel = 'Cancel',
    isLoading = false,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    confirmLabel: string
    cancelLabel?: string
    isLoading?: boolean
    onConfirm: () => void
    onCancel?: () => void
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        <button
          type="button"
          data-loading={isLoading ? 'true' : 'false'}
          data-role="confirm"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" data-role="cancel" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    ) : null,
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
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: React.ComponentProps<'label'>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: React.ComponentProps<'div'>) => <div className={className} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}))

import MedicalAssignmentDetailPage from '@/app/(app)/medical/[assignmentId]/page'

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    memberId: 'member-1',
    memberName: 'Client One',
    memberType: 'Monthly',
    memberStatus: 'Active',
    memberPhotoUrl: null,
    staffId: 'medical-1',
    staffName: 'Morgan Medical',
    status: 'active',
    followUpDate: '2026-05-30',
    completedAt: null,
    completedBy: null,
    createdBy: 'admin-1',
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function getActionButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label && !candidate.dataset.role,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

function getConfirmButton(container: HTMLDivElement) {
  const button = container.querySelector('button[data-role="confirm"]')

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Confirm button not found.')
  }

  return button
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('MedicalAssignmentDetailPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useMedicalAssignmentMock.mockReturnValue({
      assignment: buildAssignment(),
      isLoading: false,
      error: null,
    })
    useMedicalVisitNotesMock.mockReturnValue({
      notes: [],
      isLoading: false,
      error: null,
    })
    completeMedicalAssignmentMock.mockResolvedValue(undefined)
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

  it('clears the completion loading state after a successful completion flow', async () => {
    await act(async () => {
      root.render(<MedicalAssignmentDetailPage />)
    })

    await click(getActionButton(container, 'Mark as Complete'))
    expect(getConfirmButton(container).dataset.loading).toBe('false')

    await click(getConfirmButton(container))
    await flushAsyncWork()

    expect(completeMedicalAssignmentMock).toHaveBeenCalledWith('assignment-1')
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(3)
    expect(pushMock).toHaveBeenCalledWith('/medical')
    expect(container.querySelector('[data-testid="confirm-dialog"]')).toBeNull()

    await click(getActionButton(container, 'Mark as Complete'))
    expect(getConfirmButton(container).dataset.loading).toBe('false')
  })
})
