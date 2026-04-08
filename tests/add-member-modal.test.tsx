// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  addMemberMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  refetchAvailableCardsMock,
  toastMock,
  uploadMemberPhotoMock,
  useAvailableCardsMock,
} = vi.hoisted(() => ({
  addMemberMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  refetchAvailableCardsMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  uploadMemberPhotoMock: vi.fn(),
  useAvailableCardsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-available-cards', () => ({
  useAvailableCards: useAvailableCardsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-actions')>('@/lib/member-actions')

  return {
    ...actual,
    addMember: addMemberMock,
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

vi.mock('@/components/ui/select', async () => {
  const React = await import('react')

  const SelectContext = React.createContext<{
    disabled?: boolean
    onValueChange?: (value: string) => void
    value?: string
  } | null>(null)

  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onValueChange?: (value: string) => void
      value?: string
    }) => (
      <SelectContext.Provider
        value={{
          disabled,
          onValueChange,
          value: value ?? '',
        }}
      >
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: React.ComponentProps<'button'> & { value: string }) => {
      const context = React.useContext(SelectContext)

      return (
        <button
          type="button"
          onClick={() => context?.onValueChange?.(value)}
          disabled={context?.disabled}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, id }: React.ComponentProps<'button'>) => {
      const context = React.useContext(SelectContext)

      return (
        <button id={id} type="button" disabled={context?.disabled}>
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const context = React.useContext(SelectContext)

      return <span>{context?.value || placeholder}</span>
    },
  }
})

import { AddMemberModal } from '@/components/add-member-modal'
import type { AvailableAccessCard, Member } from '@/types'

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
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    beginTime: overrides.beginTime ?? '2026-04-08T09:30:00',
    endTime: overrides.endTime ?? '2026-05-05T23:59:59',
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

function mockAvailableCards(cards: AvailableAccessCard[], error: string | null = null) {
  useAvailableCardsMock.mockReturnValue({
    cards,
    isLoading: false,
    error,
    refetch: refetchAvailableCardsMock,
  })
}

describe('AddMemberModal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockAvailableCards([
      {
        cardNo: '12345',
        cardCode: 'EF-01',
      },
    ])
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    vi.useRealTimers()
    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.clearAllMocks()
  })

  it('creates a member after progressing through the three steps', async () => {
    addMemberMock.mockResolvedValue(createMember())

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('#member-name')
    const emailInput = container.querySelector('#member-email')

    if (!(nameInput instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement)) {
      throw new Error('Step 1 inputs not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jane Doe')
      setInputValue(emailInput, 'jane@example.com')
    })

    await clickButton(container, 'Female')
    await clickButton(container, 'Next')

    const startTimeInput = container.querySelector('#member-start-time')

    if (!(startTimeInput instanceof HTMLInputElement)) {
      throw new Error('Step 2 start time input not found.')
    }

    await act(async () => {
      setInputValue(startTimeInput, '09:30:00')
    })

    await clickButton(container, '1 Month')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 3 of 3')

    await clickButton(container, 'Save Member')
    await flushAsyncWork()

    expect(addMemberMock).toHaveBeenCalledWith(
      {
        name: 'Jane Doe',
        type: 'General',
        gender: 'Female',
        email: 'jane@example.com',
        beginTime: '2026-04-08T09:30:00',
        endTime: '2026-05-05T23:59:59',
        cardNo: '12345',
        cardCode: 'EF-01',
      },
      {
        onStepChange: expect.any(Function),
      },
    )
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'recent-members'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'expiring-members'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['cards', 'available'],
    })
    expect(uploadMemberPhotoMock).not.toHaveBeenCalled()
  })

  it('blocks Step 1 progression when the selected card does not have a synced card code', async () => {
    mockAvailableCards([
      {
        cardNo: '99999',
        cardCode: null,
      },
    ])

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 1 of 3')
    expect(addMemberMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Card code required',
      description: 'This card is missing its synced card code. Re-sync the imported cards and try again.',
      variant: 'destructive',
    })
  })

  it('blocks Step 2 progression when the access window is incomplete', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('#member-name')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Step 1 name input not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jane Doe')
    })

    await clickButton(container, 'Next')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 2 of 3')
    expect(addMemberMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Duration required',
      description: 'Choose how long this member should have access.',
      variant: 'destructive',
    })
  })

  it('preserves entered state when navigating back between steps', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('#member-name')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Step 1 name input not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jordan Member')
    })

    await clickButton(container, 'Male')
    await clickButton(container, 'Next')
    await clickButton(container, '2 Weeks')
    await clickButton(container, 'Next')
    await clickButton(container, 'Back')

    const durationTrigger = container.querySelector('#member-duration')

    if (!(durationTrigger instanceof HTMLButtonElement)) {
      throw new Error('Step 2 duration trigger not found.')
    }

    expect(durationTrigger.textContent).toContain('2_weeks')

    await clickButton(container, 'Back')

    const persistedNameInput = container.querySelector('#member-name')

    if (!(persistedNameInput instanceof HTMLInputElement)) {
      throw new Error('Step 1 name input not found after returning.')
    }

    expect(persistedNameInput.value).toBe('Jordan Member')
    expect(container.textContent).toContain('Step 1 of 3')
  })
})
