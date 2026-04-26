// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  addMemberMock,
  calendarSelectionState,
  compressImageMock,
  createManualAccessCardMock,
  createMemberApprovalRequestMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  refetchAvailableCardsMock,
  toastMock,
  uploadMemberPhotoMock,
  uploadMemberApprovalRequestPhotoMock,
  useAvailableCardsMock,
  useMemberTypesMock,
  usePermissionsMock,
} = vi.hoisted(() => ({
  addMemberMock: vi.fn(),
  calendarSelectionState: { value: new Date(2026, 3, 7, 12, 0, 0, 0) },
  compressImageMock: vi.fn(),
  createManualAccessCardMock: vi.fn(),
  createMemberApprovalRequestMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  refetchAvailableCardsMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  uploadMemberPhotoMock: vi.fn(),
  uploadMemberApprovalRequestPhotoMock: vi.fn(),
  useAvailableCardsMock: vi.fn(),
  useMemberTypesMock: vi.fn(),
  usePermissionsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-available-cards', () => ({
  useAvailableCards: useAvailableCardsMock,
}))

vi.mock('@/hooks/use-member-types', () => ({
  useMemberTypes: useMemberTypesMock,
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: usePermissionsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/compress-image', () => ({
  compressImage: compressImageMock,
}))

vi.mock('@/lib/available-cards', async () => {
  const actual = await vi.importActual<typeof import('@/lib/available-cards')>(
    '@/lib/available-cards',
  )

  return {
    ...actual,
    createManualAccessCard: createManualAccessCardMock,
  }
})

vi.mock('@/lib/member-approval-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-approval-requests')>(
    '@/lib/member-approval-requests',
  )

  return {
    ...actual,
    createMemberApprovalRequest: createMemberApprovalRequestMock,
    uploadMemberApprovalRequestPhoto: uploadMemberApprovalRequestPhotoMock,
  }
})

vi.mock('@/lib/member-actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-actions')>(
    '@/lib/member-actions',
  )

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

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({
    children,
  }: React.ComponentProps<'button'> & { children: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({
    children,
    className,
    isLoading = false,
  }: React.ComponentProps<'div'> & { isLoading?: boolean }) => (
    <div className={className} data-is-loading={isLoading ? 'true' : 'false'}>
      {children}
    </div>
  ),
  AlertDialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/file-upload', () => ({
  Pattern: ({
    onFileChange,
    selectedFile,
  }: {
    onFileChange?: (file: {
      id: string
      file: File
      preview: string
      name: string
      size: number
      type: string
    } | null) => void
    selectedFile?: { name: string } | null
  }) => (
    <div data-testid="pattern">
      <output data-testid="pattern-selected-file">{selectedFile?.name ?? 'none'}</output>
      <button
        type="button"
        onClick={() => {
          const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' })

          onFileChange?.({
            id: 'mock-photo',
            file,
            preview: 'blob:mock-photo',
            name: file.name,
            size: file.size,
            type: file.type,
          })
        }}
      >
        Choose Photo
      </button>
      <button type="button" onClick={() => onFileChange?.(null)}>
        Remove Photo
      </button>
    </div>
  ),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    'data-testid': dataTestId,
  }: {
    onSelect?: (date: Date) => void
    'data-testid'?: string
  }) => (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={() => onSelect?.(calendarSelectionState.value)}
    >
      Mock calendar selection
    </button>
  ),
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
import type { AvailableAccessCard, Member, MemberApprovalRequest, MemberTypeRecord } from '@/types'

function createRequest(overrides: Partial<MemberApprovalRequest> = {}): MemberApprovalRequest {
  return {
    id: overrides.id ?? 'request-1',
    name: overrides.name ?? 'Jane Doe',
    gender: overrides.gender ?? 'Female',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? '2026-04-08T09:30:00.000Z',
    endTime: overrides.endTime ?? '2026-05-05T23:59:59.000Z',
    cardNo: overrides.cardNo ?? '12345',
    cardCode: overrides.cardCode ?? 'EF-01',
    memberTypeId: overrides.memberTypeId ?? 'type-1',
    memberTypeName: overrides.memberTypeName ?? 'General',
    photoUrl: overrides.photoUrl ?? null,
    status: overrides.status ?? 'pending',
    submittedBy: overrides.submittedBy ?? 'staff-1',
    submittedByName: overrides.submittedByName ?? 'Jordan Staff',
    reviewedBy: overrides.reviewedBy ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    reviewNote: overrides.reviewNote ?? null,
    memberId: overrides.memberId ?? null,
    createdAt: overrides.createdAt ?? '2026-04-08T15:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-08T15:00:00.000Z',
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

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? '000611',
    name: overrides.name ?? 'Jane Doe',
    cardNo: overrides.cardNo ?? '12345',
    cardCode: overrides.cardCode ?? 'EF-01',
    cardStatus: overrides.cardStatus ?? 'assigned',
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? 'type-1',
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? 'Female',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? '2026-04-08T09:30:00.000Z',
    endTime: overrides.endTime ?? '2026-05-05T23:59:59.000Z',
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

async function fillRequiredBasicStep(
  container: HTMLDivElement,
  {
    name = 'Jane Doe',
    email = 'jane@example.com',
    phone = '876-555-1111',
    gender = 'Female',
    membershipType = 'General',
  }: {
    name?: string
    email?: string
    phone?: string
    gender?: 'Male' | 'Female'
    membershipType?: string
  } = {},
) {
  const nameInput = container.querySelector('#member-name')
  const emailInput = container.querySelector('#member-email')
  const phoneInput = container.querySelector('#member-phone')

  if (
    !(nameInput instanceof HTMLInputElement) ||
    !(emailInput instanceof HTMLInputElement) ||
    !(phoneInput instanceof HTMLInputElement)
  ) {
    throw new Error('Step 1 inputs not found.')
  }

  await act(async () => {
    setInputValue(nameInput, name)
    setInputValue(emailInput, email)
    setInputValue(phoneInput, phone)
  })

  await clickButton(container, gender)
  await clickButton(container, membershipType)
}

function mockAvailableCards(cards: AvailableAccessCard[], error: string | null = null) {
  useAvailableCardsMock.mockReturnValue({
    cards,
    isLoading: false,
    error,
    refetch: refetchAvailableCardsMock,
  })
}

function mockMemberTypes(
  memberTypes: MemberTypeRecord[] = [
    createMemberType(),
    createMemberType({ id: 'type-2', name: 'Civil Servant', monthly_rate: 7500 }),
    createMemberType({ id: 'type-3', name: 'Student/BPO', monthly_rate: 7500 }),
  ],
  error: Error | null = null,
) {
  useMemberTypesMock.mockReturnValue({
    memberTypes,
    isLoading: false,
    error,
    refetch: vi.fn(),
  })
}

function mockPermissions(role: 'admin' | 'staff' = 'admin') {
  usePermissionsMock.mockReturnValue({
    can: vi.fn(),
    requiresApproval: vi.fn().mockReturnValue(role === 'staff'),
    role,
    permissions: new Set(),
  })
}

function ControlledAddMemberModal() {
  const [open, setOpen] = useState(true)

  return (
    <AddMemberModal
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChangeMock(nextOpen)
        setOpen(nextOpen)
      }}
    />
  )
}

describe('AddMemberModal', () => {
  let container: HTMLDivElement
  let root: Root
  let revokeObjectURLDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    compressImageMock.mockImplementation(async (file: File) => file)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockAvailableCards([
      {
        cardNo: '12345',
        cardCode: 'EF-01',
      },
    ])
    mockMemberTypes()
    mockPermissions()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    vi.useRealTimers()
    container.remove()
    document.body.innerHTML = ''

    if (revokeObjectURLDescriptor) {
      Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURLDescriptor)
    } else {
      delete (URL as unknown as Record<string, unknown>)['revokeObjectURL']
    }

    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.clearAllMocks()
  })

  it('submits a pending member request for staff after progressing through the three steps', async () => {
    createMemberApprovalRequestMock.mockResolvedValue(createRequest())
    mockPermissions('staff')

    await act(async () => {
      root.render(<ControlledAddMemberModal />)
    })
    await flushAsyncWork()

    await fillRequiredBasicStep(container)
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

    await clickButton(container, 'Submit Request')
    await flushAsyncWork()

    expect(createMemberApprovalRequestMock).toHaveBeenCalledWith(
      {
        name: 'Jane Doe',
        member_type_id: 'type-1',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1111',
        joined_at: '2026-04-08',
        beginTime: '2026-04-08T09:30:00',
        endTime: '2026-05-05T23:59:59',
        cardNo: '12345',
        cardCode: 'EF-01',
      },
    )
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberApprovalRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberApprovalRequests', 'pending'],
    })
    expect(addMemberMock).not.toHaveBeenCalled()
    expect(uploadMemberPhotoMock).not.toHaveBeenCalled()
    expect(uploadMemberApprovalRequestPhotoMock).not.toHaveBeenCalled()
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(container.textContent).toContain('Member request submitted')
    expect(container.textContent).toContain(
      'Remember to record payment once the request is approved.',
    )
    expect(container.textContent).toContain('Got it')
    expect(container.textContent).not.toContain('Step 3 of 3')
    expect(toastMock).not.toHaveBeenCalled()

    await clickButton(container, 'Got it')

    expect(container.textContent).not.toContain('Member request submitted')
  })

  it('creates a member directly for admins, uploads the member photo, and refreshes member data', async () => {
    const compressedPhoto = new Blob(['compressed-photo'], { type: 'image/jpeg' })

    addMemberMock.mockResolvedValue({ member: createMember() })
    compressImageMock.mockResolvedValue(compressedPhoto)
    uploadMemberPhotoMock.mockResolvedValue(createMember({ photoUrl: 'members/member-1.jpg' }))

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await fillRequiredBasicStep(container)
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
    await clickButton(container, 'Choose Photo')
    await clickButton(container, 'Create Member')
    await flushAsyncWork()

    expect(addMemberMock).toHaveBeenCalledWith({
      name: 'Jane Doe',
      type: 'General',
      memberTypeId: 'type-1',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1111',
      joinedAt: '2026-04-08',
      beginTime: '2026-04-08T09:30:00',
      endTime: '2026-05-05T23:59:59',
      cardNo: '12345',
      cardCode: 'EF-01',
    })
    expect(createMemberApprovalRequestMock).not.toHaveBeenCalled()
    expect(uploadMemberPhotoMock).toHaveBeenCalledWith('member-1', compressedPhoto)
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['cards', 'available'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'recent-members'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'expiring-members'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Member created',
      description: 'EF-01 Jane Doe was created successfully.',
    })
  })

  it('uploads the staged photo to the approval request for staff', async () => {
    const compressedPhoto = new Blob(['compressed-photo'], { type: 'image/jpeg' })

    createMemberApprovalRequestMock.mockResolvedValue(createRequest())
    compressImageMock.mockResolvedValue(compressedPhoto)
    uploadMemberApprovalRequestPhotoMock.mockResolvedValue(createRequest({ photoUrl: 'requests/request-1.jpg' }))
    mockPermissions('staff')

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await fillRequiredBasicStep(container)
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
    await clickButton(container, 'Choose Photo')
    await clickButton(container, 'Submit Request')
    await flushAsyncWork()

    expect(uploadMemberApprovalRequestPhotoMock).toHaveBeenCalledWith('request-1', compressedPhoto)
    expect(addMemberMock).not.toHaveBeenCalled()
    expect(uploadMemberPhotoMock).not.toHaveBeenCalled()
  })

  it('blocks admin direct creation when the selected membership type cannot be provisioned directly', async () => {
    mockMemberTypes([createMemberType({ id: 'type-vip', name: 'VIP' })])

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await fillRequiredBasicStep(container, { membershipType: 'VIP' })
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
    await clickButton(container, 'Create Member')
    await flushAsyncWork()

    expect(addMemberMock).not.toHaveBeenCalled()
    expect(createMemberApprovalRequestMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Unsupported membership type',
      description: 'The selected membership type cannot be used for direct member creation.',
      variant: 'destructive',
    })
  })

  it('opens the add access card modal, creates a card, and preselects it in Step 1', async () => {
    createManualAccessCardMock.mockResolvedValue({
      cardNo: '98765',
      cardCode: 'N39',
    })

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await clickButton(container, 'Add Access Card')

    const manualCardNumberInput = container.querySelector('#manual-card-number')
    const manualCardCodeInput = container.querySelector('#manual-card-code')

    if (
      !(manualCardNumberInput instanceof HTMLInputElement) ||
      !(manualCardCodeInput instanceof HTMLInputElement)
    ) {
      throw new Error('Manual card inputs not found.')
    }

    await act(async () => {
      setInputValue(manualCardNumberInput, ' 98765 ')
      setInputValue(manualCardCodeInput, ' N39 ')
    })

    await clickButton(container, 'Create Card')
    await flushAsyncWork()

    expect(createManualAccessCardMock).toHaveBeenCalledWith({
      cardNo: '98765',
      cardCode: 'N39',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['cards', 'manual-create'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['cards', 'available'],
    })
    expect(container.querySelector('#manual-card-number')).toBeNull()

    const selectedCardTrigger = container.querySelector('#member-card-number')

    if (!(selectedCardTrigger instanceof HTMLButtonElement)) {
      throw new Error('Selected card trigger not found.')
    }

    expect(selectedCardTrigger.textContent).toContain('98765')
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Card added',
      description: 'N39 — 98765 is now available.',
    })
  })

  it('keeps the add access card modal open when manual card creation fails', async () => {
    createManualAccessCardMock.mockRejectedValue(
      new Error('A card with this number already exists.'),
    )

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await clickButton(container, 'Add Access Card')

    const manualCardNumberInput = container.querySelector('#manual-card-number')
    const manualCardCodeInput = container.querySelector('#manual-card-code')

    if (
      !(manualCardNumberInput instanceof HTMLInputElement) ||
      !(manualCardCodeInput instanceof HTMLInputElement)
    ) {
      throw new Error('Manual card inputs not found.')
    }

    await act(async () => {
      setInputValue(manualCardNumberInput, '12345')
      setInputValue(manualCardCodeInput, 'N39')
    })

    await clickButton(container, 'Create Card')
    await flushAsyncWork()

    expect(container.querySelector('#manual-card-number')).not.toBeNull()
    expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
      queryKey: ['cards', 'manual-create'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Card creation failed',
      description: 'A card with this number already exists.',
      variant: 'destructive',
    })
  })

  it('requires a card code when adding a manual access card', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await clickButton(container, 'Add Access Card')

    expect(container.textContent).toContain('Required prefix code shown to staff (e.g. N39).')

    const manualCardNumberInput = container.querySelector('#manual-card-number')
    const manualCardCodeInput = container.querySelector('#manual-card-code')

    if (
      !(manualCardNumberInput instanceof HTMLInputElement) ||
      !(manualCardCodeInput instanceof HTMLInputElement)
    ) {
      throw new Error('Manual card inputs not found.')
    }

    await act(async () => {
      setInputValue(manualCardNumberInput, '12345')
      setInputValue(manualCardCodeInput, '   ')
    })

    await clickButton(container, 'Create Card')
    await flushAsyncWork()

    expect(createManualAccessCardMock).not.toHaveBeenCalled()
    expect(container.querySelector('#manual-card-number')).not.toBeNull()
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Card code required',
      description: 'Enter the card code before saving.',
      variant: 'destructive',
    })
  })

  it('treats whitespace-only card codes as missing in Step 1', async () => {
    mockAvailableCards([
      {
        cardNo: '99999',
        cardCode: '   ',
      },
    ])

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('#member-name')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Step 1 name input not found.')
    }

    expect(container.textContent).toContain(
      'This card is missing its synced card code and cannot be assigned until the next successful sync.',
    )
    expect(nameInput.disabled).toBe(true)
    expect(nameInput.placeholder).toBe('Select a card with a synced card code')

    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 1 of 3')
    expect(createMemberApprovalRequestMock).not.toHaveBeenCalled()
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

    await fillRequiredBasicStep(container)
    await clickButton(container, 'Next')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 2 of 3')
    expect(createMemberApprovalRequestMock).not.toHaveBeenCalled()
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

    await fillRequiredBasicStep(container, {
      name: 'Jordan Member',
      email: 'jordan@example.com',
      phone: '876-555-2222',
      gender: 'Male',
    })
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

  it('preserves the selected photo when returning to Step 3', async () => {
    const revokeObjectURLMock = vi.mocked(URL.revokeObjectURL)

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    await fillRequiredBasicStep(container, {
      name: 'Jordan Member',
      email: 'jordan@example.com',
      phone: '876-555-3333',
    })
    await clickButton(container, 'Next')
    await clickButton(container, '2 Weeks')
    await clickButton(container, 'Next')

    const selectedPhotoOutput = container.querySelector('[data-testid="pattern-selected-file"]')

    if (!(selectedPhotoOutput instanceof HTMLOutputElement)) {
      throw new Error('Pattern selected-file output not found.')
    }

    expect(selectedPhotoOutput.textContent).toBe('none')

    await clickButton(container, 'Choose Photo')

    expect(selectedPhotoOutput.textContent).toBe('avatar.png')
    expect(revokeObjectURLMock).not.toHaveBeenCalled()

    await clickButton(container, 'Back')
    await clickButton(container, 'Next')

    const restoredPhotoOutput = container.querySelector('[data-testid="pattern-selected-file"]')

    if (!(restoredPhotoOutput instanceof HTMLOutputElement)) {
      throw new Error('Pattern selected-file output not found after returning to Step 3.')
    }

    expect(restoredPhotoOutput.textContent).toBe('avatar.png')
    expect(revokeObjectURLMock).not.toHaveBeenCalled()
  })

  it('shows membership type guidance in a tooltip and keeps errors under the field', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const infoTrigger = container.querySelector('button[aria-label="Membership type information"]')

    if (!(infoTrigger instanceof HTMLButtonElement)) {
      throw new Error('Membership type info trigger not found.')
    }

    const helperParagraphs = Array.from(container.querySelectorAll('p')).filter((paragraph) =>
      paragraph.textContent?.includes(
        'Select the membership type to assign when the member is created immediately.',
      ),
    )

    expect(infoTrigger.textContent).toBe('i')
    expect(helperParagraphs).toHaveLength(0)
    expect(
      Array.from(container.querySelectorAll('[data-testid="tooltip-content"]')).some((element) =>
        element.textContent?.includes(
          'Select the membership type to assign when the member is created immediately.',
        ),
      ),
    ).toBe(true)

    mockPermissions('staff')

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    expect(
      Array.from(container.querySelectorAll('[data-testid="tooltip-content"]')).some((element) =>
        element.textContent?.includes(
          'Select the membership type that will be used if the request is approved.',
        ),
      ),
    ).toBe(true)

    mockMemberTypes([], new Error('Failed to load membership types.'))

    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Failed to load membership types.')
  })

  it('blocks Step 1 progression when gender is missing', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('#member-name')
    const emailInput = container.querySelector('#member-email')
    const phoneInput = container.querySelector('#member-phone')

    if (
      !(nameInput instanceof HTMLInputElement) ||
      !(emailInput instanceof HTMLInputElement) ||
      !(phoneInput instanceof HTMLInputElement)
    ) {
      throw new Error('Step 1 inputs not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jane Doe')
      setInputValue(emailInput, 'jane@example.com')
      setInputValue(phoneInput, '876-555-1111')
    })

    await clickButton(container, 'General')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 1 of 3')
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Gender required',
      description: 'Select the member’s gender before saving.',
      variant: 'destructive',
    })
  })

  it('blocks Step 1 progression when email is missing', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('#member-name')
    const phoneInput = container.querySelector('#member-phone')

    if (!(nameInput instanceof HTMLInputElement) || !(phoneInput instanceof HTMLInputElement)) {
      throw new Error('Step 1 inputs not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jane Doe')
      setInputValue(phoneInput, '876-555-1111')
    })

    await clickButton(container, 'Female')
    await clickButton(container, 'General')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 1 of 3')
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Email required',
      description: 'Enter the member’s email address before saving.',
      variant: 'destructive',
    })
  })

  it('blocks Step 1 progression when phone is missing', async () => {
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
    await clickButton(container, 'General')
    await clickButton(container, 'Next')

    expect(container.textContent).toContain('Step 1 of 3')
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Phone required',
      description: 'Enter the member’s phone number before saving.',
      variant: 'destructive',
    })
  })

  it('defaults the add-member join date to today', async () => {
    await act(async () => {
      root.render(<AddMemberModal open onOpenChange={onOpenChangeMock} />)
    })
    await flushAsyncWork()

    const joinDateTrigger = container.querySelector('#member-join-date')

    if (!(joinDateTrigger instanceof HTMLButtonElement)) {
      throw new Error('Join date trigger not found.')
    }

    expect(joinDateTrigger.textContent).toContain('Apr 8, 2026')
  })
})
