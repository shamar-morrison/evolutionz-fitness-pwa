// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassRegistrationEditRequest } from '@/types'

const {
  authState,
  invalidateQueriesMock,
  reviewClassRegistrationEditRequestMock,
  reviewClassRegistrationRemovalRequestMock,
  toastMock,
  useClassRegistrationRequestsMock,
} = vi.hoisted(() => ({
  authState: {
    profile: {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin' as const,
      titles: ['Owner'],
    },
    loading: false,
  },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  reviewClassRegistrationEditRequestMock: vi.fn(),
  reviewClassRegistrationRemovalRequestMock: vi.fn(),
  toastMock: vi.fn(),
  useClassRegistrationRequestsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-class-registration-requests', () => ({
  useClassRegistrationRequests: useClassRegistrationRequestsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/class-registration-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/class-registration-requests')>(
    '@/lib/class-registration-requests',
  )

  return {
    ...actual,
    reviewClassRegistrationEditRequest: reviewClassRegistrationEditRequestMock,
    reviewClassRegistrationRemovalRequest: reviewClassRegistrationRemovalRequestMock,
  }
})

vi.mock('@/components/class-registration-receipt-preview-dialog', () => ({
  ClassRegistrationReceiptPreviewDialog: ({
    open,
    registrationId,
  }: {
    open: boolean
    registrationId: string | null
  }) => (open ? <div>{`Receipt preview ${registrationId}`}</div> : null),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div data-testid="skeleton" {...props} />,
}))

import { PendingClassRegistrationRequestsPage } from '@/components/pending-class-registration-requests-page'

function createEditRequest(
  overrides: Partial<ClassRegistrationEditRequest> = {},
): ClassRegistrationEditRequest {
  return {
    id: overrides.id ?? 'edit-request-1',
    registrationId: overrides.registrationId ?? 'registration-1',
    classId: overrides.classId ?? 'class-1',
    className: overrides.className ?? 'Weight Loss Club',
    memberId: overrides.memberId ?? 'member-1',
    guestProfileId: overrides.guestProfileId ?? null,
    registrantName: overrides.registrantName ?? 'Client One',
    registrantEmail: overrides.registrantEmail ?? 'client.one@example.com',
    currentFeeType: overrides.currentFeeType ?? 'monthly',
    currentAmountPaid: overrides.currentAmountPaid ?? 15500,
    currentPeriodStart: overrides.currentPeriodStart ?? '2026-04-01',
    currentPaymentReceived: overrides.currentPaymentReceived ?? true,
    currentNotes: overrides.currentNotes ?? null,
    proposedFeeType: overrides.proposedFeeType ?? 'custom',
    proposedAmountPaid: overrides.proposedAmountPaid ?? 12000,
    proposedPeriodStart: overrides.proposedPeriodStart ?? '2026-04-08',
    proposedPaymentReceived: overrides.proposedPaymentReceived ?? true,
    proposedNotes: overrides.proposedNotes ?? 'Updated amount',
    requestedBy: overrides.requestedBy ?? 'staff-1',
    requestedByName: overrides.requestedByName ?? 'Jordan Staff',
    reviewedBy: overrides.reviewedBy ?? null,
    reviewedByName: overrides.reviewedByName ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    status: overrides.status ?? 'pending',
    createdAt: overrides.createdAt ?? '2026-04-11T10:00:00.000Z',
  }
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

describe('PendingClassRegistrationRequestsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useClassRegistrationRequestsMock.mockReturnValue({
      editRequests: [createEditRequest()],
      removalRequests: [],
      isLoading: false,
      error: null,
    })
    reviewClassRegistrationRemovalRequestMock.mockResolvedValue({ ok: true })
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

  it('does not open the receipt preview when the approved edit results in zero paid', async () => {
    reviewClassRegistrationEditRequestMock.mockResolvedValueOnce({
      ok: true,
      amountChanged: true,
      registration: {
        amount_paid: 0,
      },
    })

    await act(async () => {
      root.render(<PendingClassRegistrationRequestsPage />)
    })

    await clickButton(container, 'Approve')

    expect(container.textContent).not.toContain('Receipt preview registration-1')
  })

  it('opens the receipt preview when the approved edit keeps a paid amount and email', async () => {
    useClassRegistrationRequestsMock.mockReturnValue({
      editRequests: [createEditRequest({ registrantEmail: null })],
      removalRequests: [],
      isLoading: false,
      error: null,
    })
    reviewClassRegistrationEditRequestMock.mockResolvedValueOnce({
      ok: true,
      amountChanged: true,
      registration: {
        amount_paid: 12000,
        registrant_email: 'updated.client@example.com',
      },
    })

    await act(async () => {
      root.render(<PendingClassRegistrationRequestsPage />)
    })

    await clickButton(container, 'Approve')

    expect(container.textContent).toContain('Receipt preview registration-1')
  })
})
