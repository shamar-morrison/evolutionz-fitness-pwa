// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchClassRegistrationReceiptPreviewMock,
  sendClassRegistrationReceiptMock,
  toastMock,
} = vi.hoisted(() => ({
  fetchClassRegistrationReceiptPreviewMock: vi.fn(),
  sendClassRegistrationReceiptMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('@/lib/class-registration-receipts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/class-registration-receipts')>(
    '@/lib/class-registration-receipts',
  )

  return {
    ...actual,
    fetchClassRegistrationReceiptPreview: fetchClassRegistrationReceiptPreviewMock,
    sendClassRegistrationReceipt: sendClassRegistrationReceiptMock,
    formatClassRegistrationReceiptDateValue: (value: string | null) => value ?? 'N/A',
    formatClassRegistrationReceiptTimestampValue: (value: string | null) => value ?? 'N/A',
  }
})

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: React.ComponentProps<'button'>) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div data-testid="skeleton" {...props} />,
}))

import { ClassRegistrationReceiptPreviewDialog } from '@/components/class-registration-receipt-preview-dialog'

function createPreviewResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    receipt: {
      registrationId: 'registration-1',
      gymName: 'Evolutionz Fitness',
      gymAddress: '1 Main Street',
      gymContact: '876-000-0000',
      receiptNumber: 'EF-2026-00001',
      receiptSentAt: null,
      registrantName: 'Client One',
      recipientEmail: 'client.one@example.com',
      className: 'Weight Loss Club',
      feeType: 'monthly',
      feeTypeLabel: 'Monthly',
      amountPaid: 12000,
      paymentDate: '2026-04-12',
      notes: null,
    },
    canSend: true,
    disabledReason: null,
    receiptSentAt: null,
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ClassRegistrationReceiptPreviewDialog', () => {
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

  it('clears stale preview state while a new registration preview is loading', async () => {
    const secondPreview = createDeferred<ReturnType<typeof createPreviewResponse>>()
    fetchClassRegistrationReceiptPreviewMock
      .mockResolvedValueOnce(createPreviewResponse())
      .mockReturnValueOnce(secondPreview.promise)

    await act(async () => {
      root.render(
        <ClassRegistrationReceiptPreviewDialog
          registrationId="registration-1"
          open
          onOpenChange={() => {}}
        />,
      )
      await flushPromises()
    })

    const firstSendButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Send'),
    )
    expect(firstSendButton).toBeInstanceOf(HTMLButtonElement)
    expect((firstSendButton as HTMLButtonElement).disabled).toBe(false)

    await act(async () => {
      root.render(
        <ClassRegistrationReceiptPreviewDialog
          registrationId="registration-2"
          open
          onOpenChange={() => {}}
        />,
      )
      await Promise.resolve()
    })

    const secondSendButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Send'),
    )
    expect(secondSendButton).toBeInstanceOf(HTMLButtonElement)
    expect((secondSendButton as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      secondPreview.resolve(
        createPreviewResponse({
          receipt: {
            ...createPreviewResponse().receipt,
            registrationId: 'registration-2',
          },
        }),
      )
      await flushPromises()
    })
  })

  it('shows an informational toast when a receipt send is already in progress', async () => {
    sendClassRegistrationReceiptMock.mockResolvedValue({
      ok: false,
      sendInProgress: true,
      error: 'A receipt send is already in progress for this registration.',
      receiptSentAt: null,
    })
    fetchClassRegistrationReceiptPreviewMock.mockResolvedValue(createPreviewResponse())
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(
        <ClassRegistrationReceiptPreviewDialog
          registrationId="registration-1"
          open
          onOpenChange={onOpenChange}
        />,
      )
      await flushPromises()
    })

    const sendButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Send'),
    )

    if (!(sendButton instanceof HTMLButtonElement)) {
      throw new Error('Send button not found.')
    }

    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await flushPromises()
    })

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Receipt send in progress',
      description: 'A receipt send is already in progress for this registration.',
    })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
