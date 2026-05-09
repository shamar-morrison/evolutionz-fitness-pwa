// @vitest-environment jsdom

import * as React from 'react'
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

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const SelectContext = React.createContext<
    | {
        value?: string
        onValueChange?: (value: string) => void
      }
    | undefined
  >(undefined)

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
      value?: string
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const context = React.useContext(SelectContext)

      return (
        <button
          type="button"
          data-select-item-value={value}
          onClick={() => context?.onValueChange?.(value)}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, className }: React.ComponentProps<'button'>) => (
      <button type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: () => {
      const context = React.useContext(SelectContext)

      return <span>{context?.value ?? ''}</span>
    },
  }
})

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

function createCard(index: number) {
  return {
    cardNo: `CARD-${String(index).padStart(2, '0')}`,
    cardCode: `CODE-${String(index).padStart(2, '0')}`,
    createdAt: `2026-05-${String(index).padStart(2, '0')}T10:00:00.000Z`,
  }
}

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
      'input[placeholder="Search by card number or card code..."]',
    )

    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Search input not found.')
    }

    return input
  }

  function getVisibleCardNumbers() {
    return Array.from(container.querySelectorAll('tbody tr td:first-child')).map(
      (cell) => cell.textContent?.trim() ?? '',
    )
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

  it('renders the members-style header, standalone search, and card rows', async () => {
    await renderPage()

    expect(container.querySelector('h1')?.textContent).toBe('Available Cards')
    expect(container.textContent).toContain(
      'These cards can be assigned to members and manually decommissioned if needed.',
    )
    expect(
      Array.from(container.querySelectorAll('h1, h2, h3')).filter(
        (heading) => heading.textContent === 'Available Cards',
      ),
    ).toHaveLength(1)
    expect(getSearchInput().placeholder).toBe('Search by card number or card code...')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.textContent).toContain('0102857149')
    expect(container.textContent).toContain('A18')
    expect(container.textContent).toContain('Card Number')
    expect(container.textContent).toContain('Card Code')
    expect(container.textContent).toContain('Date Added')
    expect(container.textContent).toContain('Page 1 of 1')
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
          cardCode: 'EF-42',
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
    expect(container.textContent).not.toContain('EF-42')

    await setSearchValue('ef')

    expect(container.textContent).not.toContain('0102857149')
    expect(container.textContent).not.toContain('A18')
    expect(container.textContent).toContain('0104620061')
    expect(container.textContent).toContain('EF-42')

    await setSearchValue('')

    expect(container.textContent).toContain('0102857149')
    expect(container.textContent).toContain('A18')
    expect(container.textContent).toContain('0104620061')
    expect(container.textContent).toContain('EF-42')
  })

  it('shows a filtered empty state when no cards match the search', async () => {
    await renderPage()

    await setSearchValue('missing-card')

    expect(container.textContent).toContain('Available Cards')
    expect(container.textContent).toContain('No cards match your search.')
    expect(container.textContent).not.toContain('No available cards.')
  })

  it('shows a table-shell empty state when no cards are available', async () => {
    useCardInventoryMock.mockReturnValue({
      cards: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await renderPage()

    expect(container.querySelector('table')).not.toBeNull()
    expect(container.textContent).toContain('No available cards.')
    expect(container.textContent).not.toContain(
      'Add a card to make it available for member assignment.',
    )
  })

  it('adds pagination and updates visible rows when the page changes', async () => {
    useCardInventoryMock.mockReturnValue({
      cards: Array.from({ length: 11 }, (_, index) => createCard(index + 1)),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await renderPage()

    expect(container.textContent).toContain('11 Rows')
    expect(container.textContent).toContain('Page 1 of 2')
    expect(getVisibleCardNumbers()).toEqual([
      'CARD-01',
      'CARD-02',
      'CARD-03',
      'CARD-04',
      'CARD-05',
      'CARD-06',
      'CARD-07',
      'CARD-08',
      'CARD-09',
      'CARD-10',
    ])

    const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

    if (!(nextPageButton instanceof HTMLButtonElement)) {
      throw new Error('Next page button not found.')
    }

    await act(async () => {
      nextPageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Page 2 of 2')
    expect(getVisibleCardNumbers()).toEqual(['CARD-11'])
  })

  it('changes rows per page and resets pagination when search narrows the results', async () => {
    useCardInventoryMock.mockReturnValue({
      cards: Array.from({ length: 11 }, (_, index) => createCard(index + 1)),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await renderPage()

    await act(async () => {
      const rowsPerPageOption = container.querySelector('button[data-select-item-value="25"]')

      if (!(rowsPerPageOption instanceof HTMLButtonElement)) {
        throw new Error('Rows-per-page option not found.')
      }

      rowsPerPageOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Page 1 of 1')
    expect(getVisibleCardNumbers()).toEqual([
      'CARD-01',
      'CARD-02',
      'CARD-03',
      'CARD-04',
      'CARD-05',
      'CARD-06',
      'CARD-07',
      'CARD-08',
      'CARD-09',
      'CARD-10',
      'CARD-11',
    ])

    await act(async () => {
      const nextPageButton = container.querySelector('button[aria-label="Go to next page"]')

      if (!(nextPageButton instanceof HTMLButtonElement)) {
        throw new Error('Next page button not found.')
      }

      nextPageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await setSearchValue('card-01')

    expect(container.textContent).toContain('Page 1 of 1')
    expect(getVisibleCardNumbers()).toEqual(['CARD-01'])
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
