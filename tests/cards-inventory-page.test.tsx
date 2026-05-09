// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

const {
  createInventoryCardMock,
  decommissionInventoryCardMock,
  invalidateQueriesMock,
  toastMock,
  useCardInventoryMock,
} = vi.hoisted(() => ({
  createInventoryCardMock: vi.fn(),
  decommissionInventoryCardMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  useCardInventoryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-card-inventory', () => ({
  useCardInventory: useCardInventoryMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/card-inventory', async () => {
  const actual = await vi.importActual<typeof import('@/lib/card-inventory')>(
    '@/lib/card-inventory',
  )

  return {
    ...actual,
    createInventoryCard: createInventoryCardMock,
    decommissionInventoryCard: decommissionInventoryCardMock,
  }
})

vi.mock('@/components/add-access-card-modal', () => ({
  AddAccessCardModal: ({
    open,
    onSuccess,
    createCardAction,
  }: {
    open: boolean
    onSuccess?: (card: { cardNo: string; cardCode: string | null }) => void
    createCardAction: (input: { cardNo: string; cardCode: string }) => Promise<unknown>
  }) =>
    open ? (
      <div>
        <h2>Add Access Card</h2>
        <button
          type="button"
          onClick={async () => {
            await createCardAction({
              cardNo: '1234567890',
              cardCode: 'N39',
            })
            onSuccess?.({
              cardNo: '1234567890',
              cardCode: 'N39',
            })
          }}
        >
          Save Card
        </button>
      </div>
    ) : null,
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
    onOpenChange,
  }: {
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel?: () => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            onCancel?.()
            onOpenChange(false)
          }}
        >
          {cancelLabel}
        </button>
      </div>
    ) : null,
}))

import { CardsInventoryPage } from '@/components/cards-inventory-page'

describe('CardsInventoryPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    createInventoryCardMock.mockResolvedValue({
      cardNo: '1234567890',
      cardCode: 'N39',
    })
    decommissionInventoryCardMock.mockResolvedValue(undefined)
    useCardInventoryMock.mockReturnValue({
      cards: [
        {
          cardNo: '0102857149',
          cardCode: 'A18',
          createdAt: '2026-05-01T10:00:00.000Z',
        },
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

  async function renderPage() {
    await act(async () => {
      root.render(<CardsInventoryPage />)
    })
  }

  function getButton(label: string, occurrence = 0) {
    const buttons = Array.from(container.querySelectorAll('button')).filter(
      (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === label,
    )
    const button = buttons[occurrence]

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button ${label} not found.`)
    }

    return button
  }

  function getSearchInput() {
    const input = container.querySelector(
      'input[placeholder="Search by card number or card code…"]',
    )

    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Search input not found.')
    }

    return input
  }

  async function setSearchValue(value: string) {
    const input = getSearchInput()
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    const setValue = descriptor?.set

    if (!setValue) {
      throw new Error('HTMLInputElement value setter is unavailable.')
    }

    await act(async () => {
      setValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('renders available card rows', async () => {
    await renderPage()

    expect(container.textContent).toContain('Cards')
    expect(container.textContent).toContain('Available Cards')
    expect(getSearchInput().placeholder).toBe('Search by card number or card code…')
    expect(container.textContent).toContain('0102857149')
    expect(container.textContent).toContain('A18')
    expect(container.textContent).toContain('Card Number')
    expect(container.textContent).toContain('Card Code')
    expect(container.textContent).toContain('Date Added')
  })

  it('filters available cards by partial card number or card code and clears the filter', async () => {
    useCardInventoryMock.mockReturnValue({
      cards: [
        {
          cardNo: '0102857149',
          cardCode: 'A18',
          createdAt: '2026-05-01T10:00:00.000Z',
        },
        {
          cardNo: '0104620061',
          cardCode: 'Ef-42',
          createdAt: '2026-05-02T10:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await renderPage()

    await setSearchValue('571')

    expect(container.textContent).toContain('0102857149')
    expect(container.textContent).not.toContain('0104620061')
    expect(container.textContent).not.toContain('Ef-42')

    await setSearchValue('ef')

    expect(container.textContent).not.toContain('0102857149')
    expect(container.textContent).not.toContain('A18')
    expect(container.textContent).toContain('0104620061')
    expect(container.textContent).toContain('Ef-42')

    await setSearchValue('')

    expect(container.textContent).toContain('0102857149')
    expect(container.textContent).toContain('A18')
    expect(container.textContent).toContain('0104620061')
    expect(container.textContent).toContain('Ef-42')
  })

  it('shows a filtered empty state when no cards match the search', async () => {
    await renderPage()

    await setSearchValue('missing-card')

    expect(container.textContent).toContain('Available Cards')
    expect(container.textContent).toContain('No cards match your search.')
    expect(container.textContent).not.toContain('No available cards.')
  })

  it('shows the empty state when no cards are available', async () => {
    useCardInventoryMock.mockReturnValue({
      cards: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await renderPage()

    expect(container.textContent).toContain('No available cards.')
  })

  it('opens the add card modal and uses the inventory create action', async () => {
    await renderPage()

    await act(async () => {
      getButton('Add Card').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Add Access Card')

    await act(async () => {
      getButton('Save Card').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createInventoryCardMock).toHaveBeenCalledWith({
      cardNo: '1234567890',
      cardCode: 'N39',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.cards.inventory,
    })
  })

  it('confirms and decommissions cards from the inventory list', async () => {
    await renderPage()

    await act(async () => {
      getButton('Decommission').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Decommission card?')
    expect(container.textContent).toContain(
      'This card will be permanently marked as decommissioned and cannot be assigned to any member.',
    )

    await act(async () => {
      getButton('Decommission', 1).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(decommissionInventoryCardMock).toHaveBeenCalledWith('0102857149')
    expect(invalidateQueriesMock).toHaveBeenNthCalledWith(1, {
      queryKey: queryKeys.cards.inventory,
    })
    expect(invalidateQueriesMock).toHaveBeenNthCalledWith(2, {
      queryKey: queryKeys.cards.available,
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Card decommissioned',
      description: '0102857149 is no longer assignable.',
    })
  })
})
