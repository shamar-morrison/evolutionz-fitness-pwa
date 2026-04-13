// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  deleteMemberPaymentMock,
  invalidateQueriesMock,
  toastMock,
  useMemberPaymentsMock,
} = vi.hoisted(() => ({
  deleteMemberPaymentMock: vi.fn().mockResolvedValue(undefined),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  useMemberPaymentsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-member-payments', () => ({
  useMemberPayments: useMemberPaymentsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel?: () => void
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/member-payment-receipt-preview-dialog', () => ({
  MemberPaymentReceiptPreviewDialog: ({
    open,
    paymentId,
  }: {
    open: boolean
    paymentId: string | null
  }) => (open && paymentId ? <div data-testid="receipt-preview">{paymentId}</div> : null),
}))

vi.mock('@/lib/member-payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-payments')>(
    '@/lib/member-payments',
  )

  return {
    ...actual,
    deleteMemberPayment: deleteMemberPaymentMock,
  }
})

import { MemberPaymentHistory } from '@/components/member-payment-history'
import type { MemberPaymentHistoryItem } from '@/types'

function createPayment(
  index: number,
  overrides: Partial<MemberPaymentHistoryItem> = {},
): MemberPaymentHistoryItem {
  return {
    id: overrides.id ?? `payment-${index}`,
    memberId: overrides.memberId ?? 'member-1',
    memberTypeId: overrides.memberTypeId ?? 'type-1',
    memberTypeName: overrides.memberTypeName ?? 'General',
    paymentType: overrides.paymentType ?? 'membership',
    paymentMethod: overrides.paymentMethod ?? 'cash',
    amountPaid: overrides.amountPaid ?? 12000 + index,
    promotion: overrides.promotion ?? null,
    recordedBy: overrides.recordedBy ?? 'admin-1',
    recordedByName: overrides.recordedByName ?? 'Admin User',
    paymentDate: overrides.paymentDate ?? `2026-04-${String(index + 1).padStart(2, '0')}`,
    notes: overrides.notes ?? `Payment note ${index}`,
    receiptNumber: overrides.receiptNumber ?? `EF-2026-${String(index + 1).padStart(5, '0')}`,
    receiptSentAt: overrides.receiptSentAt ?? null,
    createdAt: overrides.createdAt ?? `2026-04-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('MemberPaymentHistory', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useMemberPaymentsMock.mockReturnValue({
      data: {
        payments: [],
        totalMatches: 0,
      },
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

  it('shows loading rows while payments are being fetched', async () => {
    useMemberPaymentsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" />)
    })

    expect(container.textContent).toContain('Payments')
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(container.textContent).not.toContain('No payment history recorded.')
  })

  it('shows the empty state when the member has no recorded payments', async () => {
    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" />)
    })

    expect(container.textContent).toContain('No payment history recorded.')
    expect(container.querySelector('button[aria-label="Go to next page"]')).toBeNull()
  })

  it('shows the error state and retries the query', async () => {
    const refetchMock = vi.fn()
    useMemberPaymentsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load payments.'),
      refetch: refetchMock,
    })

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" />)
    })

    expect(container.textContent).toContain('Failed to load payments.')

    await act(async () => {
      const retryButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Retry',
      )

      if (!(retryButton instanceof HTMLButtonElement)) {
        throw new Error('Retry button not found.')
      }

      retryButton.click()
    })

    expect(refetchMock).toHaveBeenCalledTimes(1)
  })

  it('renders paginated payment history 10 rows at a time', async () => {
    useMemberPaymentsMock.mockImplementation((_memberId: string, page: number) => ({
      data:
        page === 0
          ? {
              payments: Array.from({ length: 10 }, (_, index) =>
                createPayment(index, {
                  notes: `Page 1 note ${index + 1}`,
                }),
              ),
              totalMatches: 12,
            }
          : {
              payments: [
                createPayment(10, { notes: 'Page 2 note 1' }),
                createPayment(11, { notes: 'Page 2 note 2' }),
              ],
              totalMatches: 12,
            },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }))

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" />)
    })

    expect(container.textContent).toContain('Showing 1-10 of 12')
    expect(container.textContent).toContain('Page 1 note 10')
    expect(container.textContent).not.toContain('Page 2 note 1')

    await act(async () => {
      const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

      if (!(nextPageButton instanceof HTMLButtonElement)) {
        throw new Error('Next page button not found.')
      }

      nextPageButton.click()
    })

    expect(container.textContent).toContain('Showing 11-12 of 12')
    expect(container.textContent).toContain('Page 2 note 1')
    expect(container.textContent).not.toContain('Page 1 note 10')
  })

  it('clears a pending delete when the selected member changes', async () => {
    useMemberPaymentsMock.mockImplementation((memberId: string) => ({
      data: {
        payments: [
          createPayment(0, {
            id: memberId === 'member-1' ? 'payment-1' : 'payment-2',
            memberId,
            notes: memberId === 'member-1' ? 'Member 1 payment' : 'Member 2 payment',
          }),
        ],
        totalMatches: 1,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }))

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" />)
    })

    await act(async () => {
      const deleteButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Delete',
      )

      if (!(deleteButton instanceof HTMLButtonElement)) {
        throw new Error('Delete button not found.')
      }

      deleteButton.click()
    })

    expect(container.textContent).toContain('Delete payment?')
    expect(container.textContent).toContain('Member 1 payment')

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-2" />)
    })

    expect(container.textContent).not.toContain('Delete payment?')
    expect(container.textContent).toContain('Member 2 payment')

    await act(async () => {
      const deleteButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Delete',
      )

      if (!(deleteButton instanceof HTMLButtonElement)) {
        throw new Error('Delete button not found after switching members.')
      }

      deleteButton.click()
    })

    await act(async () => {
      const confirmDeleteButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Delete Payment',
      )

      if (!(confirmDeleteButton instanceof HTMLButtonElement)) {
        throw new Error('Delete Payment button not found.')
      }

      confirmDeleteButton.click()
      await Promise.resolve()
    })

    await flushAsyncWork()

    expect(deleteMemberPaymentMock).toHaveBeenCalledTimes(1)
    expect(deleteMemberPaymentMock).toHaveBeenCalledWith('member-2', 'payment-2')
  })

  it('deletes a payment, invalidates payment queries, and returns to the previous page when needed', async () => {
    useMemberPaymentsMock.mockImplementation((_memberId: string, page: number) => ({
      data:
        page === 0
          ? {
              payments: Array.from({ length: 10 }, (_, index) =>
                createPayment(index, {
                  notes: `Page 1 payment ${index + 1}`,
                }),
              ),
              totalMatches: 11,
            }
          : {
              payments: [
                createPayment(10, {
                  id: 'payment-last',
                  notes: 'Page 2 only payment',
                }),
              ],
              totalMatches: 11,
            },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }))

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" />)
    })

    await act(async () => {
      const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

      if (!(nextPageButton instanceof HTMLButtonElement)) {
        throw new Error('Next page button not found.')
      }

      nextPageButton.click()
    })

    expect(container.textContent).toContain('Showing 11-11 of 11')
    expect(container.textContent).toContain('Page 2 only payment')

    await act(async () => {
      const deleteButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Delete',
      )

      if (!(deleteButton instanceof HTMLButtonElement)) {
        throw new Error('Delete button not found.')
      }

      deleteButton.click()
    })

    expect(container.textContent).toContain('Delete payment?')

    await act(async () => {
      const confirmDeleteButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Delete Payment',
      )

      if (!(confirmDeleteButton instanceof HTMLButtonElement)) {
        throw new Error('Delete Payment button not found.')
      }

      confirmDeleteButton.click()
      await Promise.resolve()
    })

    await flushAsyncWork()

    expect(deleteMemberPaymentMock).toHaveBeenCalledWith('member-1', 'payment-last')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPayments', 'member-1'],
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Payment deleted',
    })
    expect(container.textContent).toContain('Showing 1-10 of 11')
    expect(container.textContent).toContain('Page 1 payment 10')
    expect(container.textContent).not.toContain('Page 2 only payment')
  })

  it('shows card fee labels and disables receipt sending when member email is missing', async () => {
    useMemberPaymentsMock.mockReturnValue({
      data: {
        payments: [
          createPayment(0, {
            paymentType: 'card_fee',
            memberTypeId: null,
            memberTypeName: null,
            amountPaid: 2500,
            receiptNumber: 'EF-2026-00001',
          }),
        ],
        totalMatches: 1,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<MemberPaymentHistory memberId="member-1" memberEmail={null} />)
    })

    expect(container.textContent).toContain('Card Fee')

    const sendReceiptButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Send Receipt',
    )

    if (!(sendReceiptButton instanceof HTMLButtonElement)) {
      throw new Error('Send Receipt button not found.')
    }

    expect(sendReceiptButton.disabled).toBe(true)
  })
})
