// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_FEE_AMOUNT_JMD } from '@/lib/business-constants'

const {
  createMemberPaymentRequestMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  recordMemberPaymentMock,
  toastMock,
  useCardFeeSettingsMock,
  useMemberTypesMock,
} = vi.hoisted(() => ({
  createMemberPaymentRequestMock: vi.fn().mockResolvedValue({
    id: 'payment-request-1',
  }),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  recordMemberPaymentMock: vi.fn().mockResolvedValue({
    id: 'payment-1',
    member_id: 'member-1',
    member_type_id: 'type-1',
    payment_type: 'membership',
    payment_method: 'cash',
    amount_paid: 12000,
    promotion: null,
    recorded_by: 'admin-1',
    payment_date: '2026-04-09',
    notes: null,
    receipt_number: 'EF-2026-00001',
    receipt_sent_at: null,
    membership_begin_time: '2026-04-09T00:00:00.000Z',
    membership_end_time: '2026-05-08T23:59:59.000Z',
    created_at: '2026-04-09T12:00:00.000Z',
  }),
  toastMock: vi.fn(),
  useCardFeeSettingsMock: vi.fn(),
  useMemberTypesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-member-types', () => ({
  useMemberTypes: useMemberTypesMock,
}))

vi.mock('@/hooks/use-card-fee-settings', () => ({
  useCardFeeSettings: useCardFeeSettingsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/member-payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-payments')>(
    '@/lib/member-payments',
  )

  return {
    ...actual,
    recordMemberPayment: recordMemberPaymentMock,
  }
})

vi.mock('@/lib/member-payment-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-payment-requests')>(
    '@/lib/member-payment-requests',
  )

  return {
    ...actual,
    createMemberPaymentRequest: createMemberPaymentRequestMock,
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
    SelectValue: ({
      children,
      placeholder,
    }: {
      children?: React.ReactNode
      placeholder?: string
    }) => {
      const context = React.useContext(SelectContext)

      if (children) {
        return <span>{children}</span>
      }

      return <span>{context?.value || placeholder}</span>
    },
  }
})

vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react')

  const TabsContext = React.createContext<{
    onValueChange?: (value: string) => void
    value?: string
  } | null>(null)

  return {
    Tabs: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
      value?: string
    }) => (
      <TabsContext.Provider value={{ onValueChange, value }}>
        <div>{children}</div>
      </TabsContext.Provider>
    ),
    TabsList: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    TabsTrigger: ({
      children,
      value,
    }: React.ComponentProps<'button'> & { value: string }) => {
      const context = React.useContext(TabsContext)

      return (
        <button type="button" onClick={() => context?.onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    TabsContent: ({
      children,
      value,
    }: React.ComponentProps<'div'> & { value: string }) => {
      const context = React.useContext(TabsContext)

      return context?.value === value ? <div>{children}</div> : null
    },
  }
})

import { RecordMemberPaymentDialog } from '@/components/record-member-payment-dialog'
import type { Member, MemberTypeRecord } from '@/types'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? '000611',
    name: overrides.name ?? 'Marcus Brown',
    cardNo: overrides.cardNo ?? '0102857149',
    cardCode: overrides.cardCode ?? 'A18',
    cardStatus: overrides.cardStatus ?? 'assigned',
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? 'type-1',
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? 'Male',
    email: overrides.email !== undefined ? overrides.email : 'marcus@example.com',
    phone: overrides.phone ?? '876-555-1111',
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? '2026-04-09T00:00:00.000Z',
    endTime: overrides.endTime ?? '2026-05-08T23:59:59.000Z',
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

async function clickButton(container: ParentNode, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RecordMemberPaymentDialog', () => {
  let container: HTMLDivElement
  let root: Root
  let memberTypesState: {
    memberTypes: MemberTypeRecord[]
    isLoading: boolean
    error: Error | null
  }
  let cardFeeSettingsState: {
    settings: { amountJmd: number } | null
    isLoading: boolean
    error: Error | null
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    memberTypesState = {
      memberTypes: [
        createMemberType(),
        createMemberType({ id: 'type-2', name: 'Civil Servant', monthly_rate: 7500 }),
      ],
      isLoading: false,
      error: null,
    }
    cardFeeSettingsState = {
      settings: { amountJmd: DEFAULT_CARD_FEE_AMOUNT_JMD },
      isLoading: false,
      error: null,
    }
    useMemberTypesMock.mockImplementation(() => memberTypesState)
    useCardFeeSettingsMock.mockImplementation(() => cardFeeSettingsState)
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

  it('submits the payment with the default membership type, amount, and Jamaica-local date', async () => {
    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const amountInput = container.querySelector('#record-payment-amount')
    const paymentDateInput = container.querySelector('#record-payment-payment-date')

    if (!(amountInput instanceof HTMLInputElement) || !(paymentDateInput instanceof HTMLInputElement)) {
      throw new Error('Payment form inputs not found.')
    }

    expect(amountInput.value).toBe('12000')
    expect(paymentDateInput.value).toBe('2026-04-09')

    await clickButton(container, 'Cash')
    await clickButton(container, 'Record Payment')
    await flushAsyncWork()

    expect(recordMemberPaymentMock).toHaveBeenCalledWith('member-1', {
      payment_type: 'membership',
      member_type_id: 'type-1',
      payment_method: 'cash',
      amount_paid: 12000,
      promotion: null,
      payment_date: '2026-04-09',
      notes: null,
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPayments', 'member-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'detail', 'member-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
  })

  it('does not overwrite a manually edited amount when the membership type changes', async () => {
    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const amountInput = container.querySelector('#record-payment-amount')

    if (!(amountInput instanceof HTMLInputElement)) {
      throw new Error('Amount input not found.')
    }

    await act(async () => {
      setInputValue(amountInput, '11000')
    })

    await clickButton(container, 'Civil Servant')

    expect(amountInput.value).toBe('11000')
  })

  it('submits a payment request instead of recording directly when approval is required', async () => {
    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
          requiresApproval
        />,
      )
    })

    expect(container.textContent).toContain('Submit Request')
    expect(container.textContent).not.toContain('Promotion (optional)')

    await clickButton(container, 'Cash')
    await clickButton(container, 'Submit Request')

    expect(createMemberPaymentRequestMock).toHaveBeenCalledWith({
      member_id: 'member-1',
      payment_type: 'membership',
      amount: 12000,
      payment_method: 'cash',
      payment_date: '2026-04-09',
      member_type_id: 'type-1',
    })
    expect(recordMemberPaymentMock).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests', 'pending'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Request submitted',
      description: 'Payment request submitted for admin approval',
    })
  })

  it('records a card fee payment with the fixed amount payload', async () => {
    cardFeeSettingsState = {
      settings: { amountJmd: 3200 },
      isLoading: false,
      error: null,
    }
    recordMemberPaymentMock.mockResolvedValueOnce({
      id: 'payment-card-fee-1',
      member_id: 'member-1',
      member_type_id: null,
      payment_type: 'card_fee',
      payment_method: 'cash',
      amount_paid: 3200,
      promotion: null,
      recorded_by: 'admin-1',
      payment_date: '2026-04-09',
      notes: 'Replacement card',
      receipt_number: 'EF-2026-00002',
      receipt_sent_at: null,
      membership_begin_time: '2026-04-09T00:00:00.000Z',
      membership_end_time: '2026-05-08T23:59:59.000Z',
      created_at: '2026-04-09T12:00:00.000Z',
    })

    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    await clickButton(container, 'Card Fee')
    await flushAsyncWork()

    const amountInput = container.querySelector('#record-card-fee-amount')

    if (!(amountInput instanceof HTMLInputElement)) {
      throw new Error('Card fee amount input not found.')
    }

    expect(amountInput.value).toBe('3200')
    expect(container.textContent).toContain('Configured card fee amount: JMD $3,200')

    await clickButton(container, 'Cash')
    await clickButton(container, 'Record Payment')
    await flushAsyncWork()

    expect(recordMemberPaymentMock).toHaveBeenCalledWith('member-1', {
      payment_type: 'card_fee',
      payment_method: 'cash',
      payment_date: '2026-04-09',
      notes: null,
    })
  })

  it('disables card fee submission while the configured amount is loading', async () => {
    cardFeeSettingsState = {
      settings: null,
      isLoading: true,
      error: null,
    }

    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    await clickButton(container, 'Card Fee')
    await flushAsyncWork()

    expect(container.textContent).toContain('Loading configured card fee amount...')

    const submitButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Record Payment',
    )

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Record Payment button not found.')
    }

    expect(submitButton.disabled).toBe(true)
    expect(recordMemberPaymentMock).not.toHaveBeenCalled()
  })

  it('disables card fee submission when the configured amount fails to load', async () => {
    cardFeeSettingsState = {
      settings: null,
      isLoading: false,
      error: new Error('Failed to load card fee settings.'),
    }

    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    await clickButton(container, 'Card Fee')
    await flushAsyncWork()

    expect(container.textContent).toContain('Failed to load card fee settings.')

    const submitButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Record Payment',
    )

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Record Payment button not found.')
    }

    expect(submitButton.disabled).toBe(true)
    expect(recordMemberPaymentMock).not.toHaveBeenCalled()
  })

  it('blocks submission when the member has no email on file', async () => {
    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember({ email: null })}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    expect(container.textContent).toContain(
      'Add an email address to this member\'s profile before recording a payment.',
    )

    const submitButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Record Payment',
    )

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Record Payment button not found.')
    }

    expect(submitButton.disabled).toBe(true)
    expect(recordMemberPaymentMock).not.toHaveBeenCalled()
    expect(createMemberPaymentRequestMock).not.toHaveBeenCalled()
  })

  it('shows membership type and amount loaders until member types finish loading on first open', async () => {
    memberTypesState = {
      memberTypes: [],
      isLoading: true,
      error: null,
    }

    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const loadingIndicators = container.querySelectorAll('[aria-label="Loading"]')
    const submitButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Record Payment',
    )

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Record Payment button not found.')
    }

    expect(container.textContent).toContain('Loading membership type...')
    expect(container.textContent).toContain('Loading amount...')
    expect(container.querySelector('#record-payment-amount')).toBeNull()
    expect(loadingIndicators).toHaveLength(2)
    expect(submitButton.disabled).toBe(true)

    await act(async () => {
      memberTypesState = {
        memberTypes: [
          createMemberType(),
          createMemberType({ id: 'type-2', name: 'Civil Servant', monthly_rate: 7500 }),
        ],
        isLoading: false,
        error: null,
      }

      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    const amountInput = container.querySelector('#record-payment-amount')
    const updatedSubmitButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Record Payment',
    )

    if (!(amountInput instanceof HTMLInputElement)) {
      throw new Error('Amount input not found after member types loaded.')
    }

    if (!(updatedSubmitButton instanceof HTMLButtonElement)) {
      throw new Error('Record Payment button not found after member types loaded.')
    }

    expect(container.textContent).not.toContain('Loading membership type...')
    expect(container.textContent).not.toContain('Loading amount...')
    expect(amountInput.value).toBe('12000')
    expect(updatedSubmitButton.disabled).toBe(false)
  })

  it('shows membership type guidance in a tooltip and keeps load errors under the field', async () => {
    await act(async () => {
      root.render(
        <RecordMemberPaymentDialog
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
        'Changing the membership type auto-fills the amount until it is edited manually.',
      ),
    )

    expect(infoTrigger.textContent).toBe('i')
    expect(helperParagraphs).toHaveLength(0)
    expect(
      Array.from(container.querySelectorAll('[data-testid="tooltip-content"]')).some((element) =>
        element.textContent?.includes(
          'Changing the membership type auto-fills the amount until it is edited manually.',
        ),
      ),
    ).toBe(true)

    await act(async () => {
      memberTypesState = {
        memberTypes: [],
        isLoading: false,
        error: new Error('Failed to load membership types.'),
      }

      root.render(
        <RecordMemberPaymentDialog
          member={createMember()}
          open
          onOpenChange={onOpenChangeMock}
        />,
      )
    })

    expect(container.textContent).toContain('Failed to load membership types.')
  })
})
