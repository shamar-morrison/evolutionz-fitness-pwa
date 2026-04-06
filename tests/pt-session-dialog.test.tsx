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

import { PtSessionDialog } from '@/components/pt-session-dialog'
import { queryKeys } from '@/lib/query-keys'
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
      createdAt: '2026-04-05T00:00:00.000Z',
      updatedAt: '2026-04-05T00:00:00.000Z',
      trainerName: 'Jordan Trainer',
      memberName: 'Member One',
      ...(overrides.session ?? {}),
    },
    changes: overrides.changes ?? [],
  }
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

describe('PtSessionDialog', () => {
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

  it('invalidates all PT session list queries and the updated session detail after saving', async () => {
    usePtSessionDetailMock.mockReturnValue({
      detail: createDetail(),
      isLoading: false,
      error: null,
    })
    updatePtSessionMock.mockResolvedValue({
      ok: true,
    })

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
      setInputValue(notesInput, '  Updated note  ')
    })

    await clickButton(container, 'Save')
    await flushAsyncWork()

    expect(updatePtSessionMock).toHaveBeenCalledWith('session-1', {
      scheduledAt: '2026-04-06T07:00',
      status: 'scheduled',
      notes: 'Updated note',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.ptScheduling.sessions({}),
      exact: false,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['pt-sessions', 'detail', 'session-1'],
    })
  })
})
