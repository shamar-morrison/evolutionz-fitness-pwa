// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  onOpenChangeMock,
  toastMock,
  updatePtSessionMock,
  usePtSessionDetailMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  toastMock: vi.fn(),
  updatePtSessionMock: vi.fn(),
  usePtSessionDetailMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  usePtSessionDetail: usePtSessionDetailMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    updatePtSession: updatePtSessionMock,
  }
})

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
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    className,
    isLoading = false,
  }: React.ComponentProps<'div'> & { isLoading?: boolean }) => (
    <div className={className} data-is-loading={isLoading ? 'true' : 'false'}>
      {children}
    </div>
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

import { PtSessionDialog } from '@/components/pt-session-dialog'
import type { PtSessionDetail } from '@/lib/pt-scheduling'

function createDetail(overrides: Partial<PtSessionDetail> = {}): PtSessionDetail {
  return {
    session: {
      id: 'session-1',
      assignmentId: 'assignment-1',
      trainerId: 'trainer-1',
      memberId: 'member-1',
      scheduledAt: '2026-04-06T07:00:00-05:00',
      status: 'scheduled',
      isRecurring: true,
      notes: 'Original note',
      trainingTypeName: null,
      createdAt: '2026-04-05T00:00:00.000Z',
      updatedAt: '2026-04-05T00:00:00.000Z',
      trainerName: 'Jordan Trainer',
      memberName: 'Member One',
      pendingRequestType: null,
      ...(overrides.session ?? {}),
    },
    changes: overrides.changes ?? [],
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Input value setter is unavailable.')
  }

  setValue.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('PtSessionDialog loading wiring', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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

  it('uses the same submitting state for DialogContent and the save button', async () => {
    const deferred = createDeferred<{ ok: true }>()

    usePtSessionDetailMock.mockReturnValue({
      detail: createDetail(),
      isLoading: false,
      error: null,
    })
    updatePtSessionMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(
        <PtSessionDialog
          sessionId="session-1"
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const notesInput = container.querySelector('#pt-session-notes')

    if (!(notesInput instanceof HTMLTextAreaElement)) {
      throw new Error('Notes input not found.')
    }

    await act(async () => {
      setInputValue(notesInput, 'Updated note')
    })

    const saveButton = container.querySelector('button[type="submit"]')

    if (!(saveButton instanceof HTMLButtonElement)) {
      throw new Error('Save button not found.')
    }

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const dialogContent = container.querySelector('[data-is-loading="true"]')
    const loadingButton = container.querySelector('button[data-loading="true"]')

    expect(dialogContent).not.toBeNull()
    expect(loadingButton).toBe(saveButton)
    expect(saveButton.disabled).toBe(true)

    deferred.resolve({ ok: true })
    await flushAsyncWork()
  })
})
