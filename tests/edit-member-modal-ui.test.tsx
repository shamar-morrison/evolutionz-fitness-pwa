// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createMemberEditRequestMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  toastMock,
  updateMemberMock,
  uploadMemberPhotoMock,
  useMemberTypesMock,
} = vi.hoisted(() => ({
  createMemberEditRequestMock: vi.fn().mockResolvedValue({
    id: 'request-1',
  }),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  toastMock: vi.fn(),
  updateMemberMock: vi.fn(),
  uploadMemberPhotoMock: vi.fn(),
  useMemberTypesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/hooks/use-member-types', () => ({
  useMemberTypes: useMemberTypesMock,
}))

vi.mock('@/lib/member-actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-actions')>('@/lib/member-actions')

  return {
    ...actual,
    updateMember: updateMemberMock,
    uploadMemberPhoto: uploadMemberPhotoMock,
  }
})

vi.mock('@/lib/member-edit-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-edit-requests')>(
    '@/lib/member-edit-requests',
  )

  return {
    ...actual,
    createMemberEditRequest: createMemberEditRequestMock,
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

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-root">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
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
import type { Member, MemberTypeRecord } from '@/types'

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
    memberTypeId: overrides.memberTypeId ?? null,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender === undefined ? 'Female' : overrides.gender,
    email: overrides.email === undefined ? 'jane@example.com' : overrides.email,
    phone: overrides.phone === undefined ? '555-0100' : overrides.phone,
    remark: overrides.remark === undefined ? 'Existing member' : overrides.remark,
    photoUrl: overrides.photoUrl ?? null,
    beginTime: overrides.beginTime ?? '2026-04-02T00:00:00.000Z',
    endTime: overrides.endTime ?? '2026-05-01T23:59:59.000Z',
  }
}

function createMemberType(overrides: Partial<MemberTypeRecord> = {}): MemberTypeRecord {
  return {
    id: overrides.id ?? 'type-1',
    name: overrides.name ?? 'General',
    monthly_rate: overrides.monthly_rate ?? 12000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
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
    useMemberTypesMock.mockReturnValue({
      memberTypes: [
        createMemberType(),
        createMemberType({ id: 'type-2', name: 'Civil Servant', monthly_rate: 7500 }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
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

  it('allows saving a legacy member without requiring missing profile fields', async () => {
    updateMemberMock.mockResolvedValue({
      member: createMember({
        name: 'Legacy Member Updated',
        memberTypeId: null,
        gender: null,
        email: null,
        phone: null,
        remark: null,
      }),
    })

    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember({
            name: 'Legacy Member',
            memberTypeId: null,
            gender: null,
            email: null,
            phone: null,
            remark: null,
          })}
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
      setInputValue(nameInput, 'Legacy Member Updated')
    })

    const submitButton = container.querySelector('button[type="submit"]')

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateMemberMock).toHaveBeenCalledWith('member-1', {
      name: 'Legacy Member Updated',
      memberTypeId: null,
      gender: null,
      email: null,
      phone: null,
      remark: null,
      beginTime: '2026-04-02T00:00:00',
      endTime: '2026-05-01T23:59:59',
    })
  })

  it('submits only changed supported fields when approval is required', async () => {
    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
          requiresApproval
        />,
      )
    })

    expect(container.textContent).toContain('Submit Request')
    expect(container.textContent).toContain('Start Date')
    expect(container.textContent).toContain('Start Time')
    expect(container.textContent).toContain('Duration')
    expect(container.textContent).not.toContain('Remark')

    const nameInput = container.querySelector('#edit-name')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Name input not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jane Updated')
    })

    const submitButton = container.querySelector('button[type="submit"]')

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createMemberEditRequestMock).toHaveBeenCalledWith({
      member_id: 'member-1',
      proposed_name: 'Jane Updated',
    })
    expect(updateMemberMock).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests', 'pending'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Request submitted',
      description: 'Edit request submitted for admin approval',
    })
  })

  it('submits only changed access window fields when approval is required', async () => {
    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember({
            beginTime: '2026-04-02T00:00:00.000Z',
            endTime: '2026-04-29T23:59:59.000Z',
          })}
          open
          onOpenChange={onOpenChangeMock}
          requiresApproval
        />,
      )
    })

    const startTimeInput = container.querySelector('#edit-start-time')

    if (!(startTimeInput instanceof HTMLInputElement)) {
      throw new Error('Start time input not found.')
    }

    await act(async () => {
      setInputValue(startTimeInput, '08:30')
    })

    const submitButton = container.querySelector('button[type="submit"]')

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createMemberEditRequestMock).toHaveBeenCalledWith({
      member_id: 'member-1',
      proposed_start_time: '08:30:00',
    })
  })

  it('renders membership type guidance in a tooltip and leaves load errors below the field', async () => {
    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const infoTrigger = container.querySelector('button[aria-label="Membership type information"]')

    if (!(infoTrigger instanceof HTMLButtonElement)) {
      throw new Error('Membership type info trigger not found.')
    }

    const helperParagraphs = Array.from(container.querySelectorAll('p')).filter((paragraph) =>
      paragraph.textContent?.includes(
        'Leave blank for legacy members who do not have a membership type assigned yet.',
      ),
    )

    expect(infoTrigger.textContent).toBe('i')
    expect(helperParagraphs).toHaveLength(0)
    expect(
      Array.from(container.querySelectorAll('[data-testid="tooltip-content"]')).some((element) =>
        element.textContent?.includes(
          'Leave blank for legacy members who do not have a membership type assigned yet.',
        ),
      ),
    ).toBe(true)

    useMemberTypesMock.mockReturnValue({
      memberTypes: [],
      isLoading: false,
      error: new Error('Failed to load membership types.'),
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(
        <EditMemberModal
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    expect(container.textContent).toContain('Failed to load membership types.')
  })
})
