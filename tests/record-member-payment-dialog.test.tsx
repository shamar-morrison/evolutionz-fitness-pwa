// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  onOpenChangeMock,
  recordMemberPaymentMock,
  toastMock,
  useMemberTypesMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  recordMemberPaymentMock: vi.fn().mockResolvedValue({
    id: 'payment-1',
  }),
  toastMock: vi.fn(),
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
    email: overrides.email ?? 'marcus@example.com',
    phone: overrides.phone ?? '876-555-1111',
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
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

describe('RecordMemberPaymentDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))
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
    })
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

    expect(recordMemberPaymentMock).toHaveBeenCalledWith('member-1', {
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
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Payment recorded',
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
})
