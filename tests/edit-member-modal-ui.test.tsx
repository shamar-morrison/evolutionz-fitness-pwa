// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  onOpenChangeMock,
  toastMock,
  updateMemberMock,
  uploadMemberPhotoMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  toastMock: vi.fn(),
  updateMemberMock: vi.fn(),
  uploadMemberPhotoMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-actions')>('@/lib/member-actions')

  return {
    ...actual,
    updateMember: updateMemberMock,
    uploadMemberPhoto: uploadMemberPhotoMock,
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
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/file-upload', () => ({
  Pattern: () => <div data-testid="pattern" />,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
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

import { EditMemberModal } from '@/components/edit-member-modal'
import type { Member } from '@/types'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? '1001',
    name: overrides.name ?? 'Jane Doe',
    cardNo: overrides.cardNo ?? '12345',
    cardCode: overrides.cardCode ?? 'EF-01',
    cardStatus: overrides.cardStatus ?? 'assigned',
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? 'Female',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? '555-0100',
    remark: overrides.remark ?? 'Existing member',
    photoUrl: overrides.photoUrl ?? null,
    beginTime: overrides.beginTime ?? '2026-04-02T00:00:00.000Z',
    endTime: overrides.endTime ?? '2026-05-01T23:59:59.000Z',
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('EditMemberModal UI', () => {
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

  it('shows the save icon in the idle save button state', async () => {
    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const submitButton = container.querySelector('button[type="submit"]')

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    expect(submitButton.textContent).toContain('Save Changes')
    expect(submitButton.querySelector('svg[data-icon="inline-start"]')).not.toBeNull()
    expect(submitButton.querySelector('[aria-label="Loading"]')).toBeNull()
  })

  it('shows the loading state from isSubmitting while the save request is in flight', async () => {
    const deferred = createDeferred<{ member: Member; warning?: string | null }>()
    updateMemberMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const nameInput = container.querySelector('#edit-name')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Name input not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jane Smith')
    })

    const submitButton = container.querySelector('button[type="submit"]')

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(submitButton.disabled).toBe(true)
    expect(submitButton.textContent).toContain('Saving...')
    expect(submitButton.querySelector('[aria-label="Loading"]')).not.toBeNull()

    deferred.resolve({ member: createMember({ name: 'Jane Smith' }) })
    await flushAsyncWork()
  })
})
