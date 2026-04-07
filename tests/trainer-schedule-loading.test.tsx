// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtSession } from '@/lib/pt-scheduling'

const {
  createPtRescheduleRequestMock,
  invalidateQueriesMock,
  markPtSessionMock,
  toastMock,
  useQueryMock,
} = vi.hoisted(() => ({
  createPtRescheduleRequestMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  markPtSessionMock: vi.fn(),
  toastMock: vi.fn(),
  useQueryMock: vi.fn(),
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

vi.mock('@/components/reschedule-date-time-picker', () => ({
  RescheduleDateTimePicker: ({
    id,
    value,
    placeholder,
  }: {
    id: string
    value: string
    placeholder?: string
  }) => <input id={id} placeholder={placeholder} readOnly value={value} />,
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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open?: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    isLoading = false,
  }: React.ComponentProps<'div'> & { isLoading?: boolean }) => (
    <div data-is-loading={isLoading ? 'true' : 'false'}>{children}</div>
  ),
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function getSessionCard(container: HTMLDivElement, sessionId: string) {
  const card = container.querySelector(`[data-session-id="${sessionId}"]`)

  if (!(card instanceof HTMLDivElement)) {
    throw new Error(`Card for ${sessionId} not found.`)
  }

  return card
}

function getButtonWithin(container: ParentNode, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Textarea value setter is unavailable.')
  }

  setValue.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('Trainer schedule loading feedback', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    const upcomingSessions = [
      createSession({ id: 'session-1', memberName: 'Client One' }),
      createSession({
        id: 'session-2',
        assignmentId: 'assignment-2',
        memberId: 'member-2',
        memberName: 'Client Two',
        scheduledAt: '2099-04-13T10:00:00.000Z',
      }),
    ]

    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          'tab' in part &&
          part.tab === 'upcoming',
      )
        ? upcomingSessions
        : [],
      isLoading: false,
      error: null,
    }))

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
    vi.clearAllMocks()
  })

  it('shows loading only on the clicked mark action card', async () => {
    const deferred = createDeferred<{ ok: true; pending: false }>()
    markPtSessionMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    const firstCard = getSessionCard(container, 'session-1')
    const secondCard = getSessionCard(container, 'session-2')

    await act(async () => {
      getButtonWithin(firstCard, 'Completed').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(markPtSessionMock).toHaveBeenCalledWith('session-1', { requestedStatus: 'completed' })
    expect(firstCard.getAttribute('data-session-loading')).toBe('true')
    expect(firstCard.getAttribute('aria-busy')).toBe('true')
    expect(secondCard.getAttribute('data-session-loading')).toBe('false')
    expect(firstCard.textContent).toContain('Updating session...')
    expect(getButtonWithin(firstCard, 'Mark Session').disabled).toBe(true)
    expect(getButtonWithin(firstCard, 'Request Reschedule').disabled).toBe(true)
    expect(getButtonWithin(secondCard, 'Mark Session').disabled).toBe(false)
    expect(getButtonWithin(secondCard, 'Request Reschedule').disabled).toBe(false)

    deferred.resolve({ ok: true, pending: false })
    await flushAsyncWork()
  })

  it('keeps the reschedule dialog loading state while marking the session card as pending', async () => {
    const deferred = createDeferred<{ id: string }>()
    createPtRescheduleRequestMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    const firstCard = getSessionCard(container, 'session-1')
    const secondCard = getSessionCard(container, 'session-2')

    await act(async () => {
      getButtonWithin(firstCard, 'Request Reschedule').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })

    const submitButton = getButtonWithin(container, 'Send Request')

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(createPtRescheduleRequestMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ note: null }),
    )
    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(submitButton.getAttribute('data-loading')).toBe('true')
    expect(submitButton.disabled).toBe(true)
    expect(firstCard.getAttribute('data-session-loading')).toBe('true')
    expect(secondCard.getAttribute('data-session-loading')).toBe('false')
    expect(firstCard.textContent).toContain('Submitting request...')

    deferred.resolve({ id: 'request-1' })
    await flushAsyncWork()
  })

  it('keeps the cancellation dialog loading state while marking the session card as pending', async () => {
    const deferred = createDeferred<{ ok: true; pending: true }>()
    markPtSessionMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    const firstCard = getSessionCard(container, 'session-1')
    const secondCard = getSessionCard(container, 'session-2')

    await act(async () => {
      getButtonWithin(firstCard, 'Cancelled').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const reasonField = getTextareaByPlaceholder(
      container,
      'Provide a reason for cancelling this session',
    )

    await act(async () => {
      setTextareaValue(reasonField, 'Member is unwell today.')
    })

    const submitButton = getButtonWithin(container, 'Submit')

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(markPtSessionMock).toHaveBeenCalledWith('session-1', {
      requestedStatus: 'cancelled',
      note: 'Member is unwell today.',
    })
    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(submitButton.getAttribute('data-loading')).toBe('true')
    expect(submitButton.disabled).toBe(true)
    expect(firstCard.getAttribute('data-session-loading')).toBe('true')
    expect(secondCard.getAttribute('data-session-loading')).toBe('false')
    expect(firstCard.textContent).toContain('Submitting request...')

    deferred.resolve({ ok: true, pending: true })
    await flushAsyncWork()
  })
})
