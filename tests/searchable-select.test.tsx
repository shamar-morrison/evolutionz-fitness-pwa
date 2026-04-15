// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SearchableSelect } from '@/components/searchable-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const options = [
  {
    value: 'assignment-1',
    label: 'Client One <-> Trainer One',
    description: 'Mondays at 7:00 AM',
    keywords: ['Client One', 'Trainer One'],
  },
  {
    value: 'assignment-2',
    label: 'Client Two <-> Trainer Two',
    description: 'Wednesdays at 9:00 AM',
    keywords: ['Client Two', 'Trainer Two'],
  },
]

function findComboboxButton(root: ParentNode = document): HTMLButtonElement {
  const button = root.querySelector('button[role="combobox"]')

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Combobox trigger not found.')
  }

  return button
}

function findPopoverContent(root: ParentNode = document): HTMLElement {
  const content = root.querySelector('[data-slot="popover-content"]')

  if (!(content instanceof HTMLElement)) {
    throw new Error('Popover content not found.')
  }

  return content
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('SearchableSelect', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    ;(globalThis as typeof globalThis & {
      ResizeObserver?: new () => {
        observe: () => void
        unobserve: () => void
        disconnect: () => void
      }
    }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.scrollIntoView = () => undefined
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
  })

  it('mounts the popover content inside the dialog content when opened from a dialog', async () => {
    await act(async () => {
      root.render(
        <Dialog open onOpenChange={() => undefined}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Sessions</DialogTitle>
              <DialogDescription>Select an assignment.</DialogDescription>
            </DialogHeader>
            <SearchableSelect
              value={null}
              onValueChange={() => undefined}
              options={options}
              placeholder="Select an assignment"
              searchPlaceholder="Search assignments..."
              emptyMessage="No assignments found."
            />
          </DialogContent>
        </Dialog>,
      )
    })

    const dialogContent = document.body.querySelector('[data-slot="dialog-content"]')

    if (!(dialogContent instanceof HTMLElement)) {
      throw new Error('Dialog content not found.')
    }

    await click(findComboboxButton(dialogContent))

    const popoverContent = findPopoverContent(document.body)

    expect(dialogContent.contains(popoverContent)).toBe(true)
    expect(popoverContent.textContent).toContain('Client One <-> Trainer One')
  })

  it('still renders the popover through the default body portal outside dialogs', async () => {
    await act(async () => {
      root.render(
        <SearchableSelect
          value={null}
          onValueChange={() => undefined}
          options={options}
          placeholder="Select an assignment"
          searchPlaceholder="Search assignments..."
          emptyMessage="No assignments found."
        />,
      )
    })

    await click(findComboboxButton(container))

    const popoverContent = findPopoverContent(document.body)

    expect(container.contains(popoverContent)).toBe(false)
    expect(document.body.contains(popoverContent)).toBe(true)
    expect(popoverContent.textContent).toContain('Client Two <-> Trainer Two')
  })
})
