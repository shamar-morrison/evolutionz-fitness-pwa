// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  recordPtPaymentMock,
  toastMock,
  useMemberPtAssignmentMock,
  usePtPaymentsMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  recordPtPaymentMock: vi.fn(),
  toastMock: vi.fn(),
  useMemberPtAssignmentMock: vi.fn(),
  usePtPaymentsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useMemberPtAssignment: useMemberPtAssignmentMock,
}))

vi.mock('@/hooks/use-pt-payments', () => ({
  usePtPayments: usePtPaymentsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/pt-payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-payments')>('@/lib/pt-payments')

  return {
    ...actual,
    getDefaultMemberPaymentDate: () => '2026-04-10',
    recordPtPayment: recordPtPaymentMock,
  }
})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
}))

import { MemberPtPaymentsSection } from '@/components/member-pt-payments-section'

const memberId = 'member-1'

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('MemberPtPaymentsSection', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    invalidateQueriesMock.mockClear()
    recordPtPaymentMock.mockReset()
    toastMock.mockReset()
    useMemberPtAssignmentMock.mockReturnValue({
      assignment: {
        id: 'assignment-1',
        trainerId: 'trainer-1',
        memberId,
        status: 'active',
        ptFee: 15000,
        commissionOverride: null,
        sessionsPerWeek: 3,
        scheduledSessions: [],
        scheduledDays: [],
        sessionTime: '07:00',
        notes: null,
        trainingPlan: [],
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        trainerName: 'Jordan Trainer',
      },
      isLoading: false,
      error: null,
    })
    usePtPaymentsMock.mockReturnValue({
      payments: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('shows a disabled state when there is no active assignment', async () => {
    useMemberPtAssignmentMock.mockReturnValue({
      assignment: null,
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<MemberPtPaymentsSection memberId={memberId} />)
    })

    expect(container.textContent).toContain('No active PT assignment.')
    expect(container.querySelector('form')).toBeNull()
  })

  it('renders the payment form and history rows for an active assignment', async () => {
    usePtPaymentsMock.mockReturnValue({
      payments: [
        {
          id: 'payment-1',
          assignmentId: 'assignment-1',
          trainerName: 'Jordan Trainer',
          amount: 15000,
          monthsCovered: 2,
          paymentMethod: 'cash',
          notes: 'April and May',
          paymentDate: '2026-04-10',
          recordedBy: 'Admin User',
          createdAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<MemberPtPaymentsSection memberId={memberId} />)
    })

    expect((container.querySelector('#pt-payment-amount') as HTMLInputElement).value).toBe('15000')
    expect((container.querySelector('#pt-payment-date') as HTMLInputElement).value).toBe('2026-04-10')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('April and May')
    expect(container.textContent).toContain('Admin User')
  })

  it('submits the PT payment payload and invalidates member PT payments', async () => {
    recordPtPaymentMock.mockResolvedValue({
      id: 'payment-1',
    })

    await act(async () => {
      root.render(<MemberPtPaymentsSection memberId={memberId} />)
    })

    await act(async () => {
      setInputValue(container.querySelector('#pt-payment-amount') as HTMLInputElement, '18000')
      setInputValue(container.querySelector('#pt-payment-months-covered') as HTMLInputElement, '2')
      setInputValue(container.querySelector('select') as HTMLSelectElement, 'cash')
      setInputValue(container.querySelector('#pt-payment-notes') as HTMLTextAreaElement, 'April and May')
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(recordPtPaymentMock).toHaveBeenCalledWith({
      memberId,
      assignmentId: 'assignment-1',
      amount: 18000,
      monthsCovered: 2,
      paymentMethod: 'cash',
      notes: 'April and May',
      paymentDate: '2026-04-10',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['ptPayments', memberId],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'PT payment recorded',
    })
  })
})
