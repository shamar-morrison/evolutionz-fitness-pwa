// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { latestContentProps } = vi.hoisted(() => ({
  latestContentProps: {
    current: null as null | Record<string, unknown>,
  },
}))

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  Content: ({ children, ...props }: React.ComponentProps<'div'>) => {
    latestContentProps.current = props

    return <div>{children}</div>
  },
  Close: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Title: ({ children, ...props }: React.ComponentProps<'h2'>) => <h2 {...props}>{children}</h2>,
  Description: ({ children, ...props }: React.ComponentProps<'p'>) => <p {...props}>{children}</p>,
}))

import { DialogContent } from '@/components/ui/dialog'

describe('DialogContent', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    latestContentProps.current = null
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

  it('prevents all dismiss interactions while loading and still calls caller handlers', async () => {
    const onEscapeKeyDown = vi.fn()
    const onInteractOutside = vi.fn()
    const onPointerDownOutside = vi.fn()

    await act(async () => {
      root.render(
        <DialogContent
          isLoading
          onEscapeKeyDown={onEscapeKeyDown}
          onInteractOutside={onInteractOutside}
          onPointerDownOutside={onPointerDownOutside}
        >
          Content
        </DialogContent>,
      )
    })

    const contentProps = latestContentProps.current

    if (!contentProps) {
      throw new Error('Dialog content props were not captured.')
    }

    const escapeEvent = { preventDefault: vi.fn() }
    const interactOutsideEvent = { preventDefault: vi.fn() }
    const pointerDownOutsideEvent = { preventDefault: vi.fn() }

    ;(contentProps.onEscapeKeyDown as (event: typeof escapeEvent) => void)(escapeEvent)
    ;(contentProps.onInteractOutside as (event: typeof interactOutsideEvent) => void)(
      interactOutsideEvent,
    )
    ;(contentProps.onPointerDownOutside as (event: typeof pointerDownOutsideEvent) => void)(
      pointerDownOutsideEvent,
    )

    expect(onEscapeKeyDown).toHaveBeenCalledWith(escapeEvent)
    expect(onInteractOutside).toHaveBeenCalledWith(interactOutsideEvent)
    expect(onPointerDownOutside).toHaveBeenCalledWith(pointerDownOutsideEvent)
    expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(interactOutsideEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(pointerDownOutsideEvent.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('does not prevent dismiss interactions when loading is false', async () => {
    await act(async () => {
      root.render(<DialogContent>Content</DialogContent>)
    })

    const contentProps = latestContentProps.current

    if (!contentProps) {
      throw new Error('Dialog content props were not captured.')
    }

    const escapeEvent = { preventDefault: vi.fn() }
    const interactOutsideEvent = { preventDefault: vi.fn() }
    const pointerDownOutsideEvent = { preventDefault: vi.fn() }

    ;(contentProps.onEscapeKeyDown as (event: typeof escapeEvent) => void)(escapeEvent)
    ;(contentProps.onInteractOutside as (event: typeof interactOutsideEvent) => void)(
      interactOutsideEvent,
    )
    ;(contentProps.onPointerDownOutside as (event: typeof pointerDownOutsideEvent) => void)(
      pointerDownOutsideEvent,
    )

    expect(escapeEvent.preventDefault).not.toHaveBeenCalled()
    expect(interactOutsideEvent.preventDefault).not.toHaveBeenCalled()
    expect(pointerDownOutsideEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('hides the close button while loading', async () => {
    await act(async () => {
      root.render(<DialogContent>Content</DialogContent>)
    })

    expect(container.querySelector('[data-slot="dialog-close"]')).not.toBeNull()

    await act(async () => {
      root.render(<DialogContent isLoading>Content</DialogContent>)
    })

    expect(container.querySelector('[data-slot="dialog-close"]')).toBeNull()
  })
})
