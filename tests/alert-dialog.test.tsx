// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { latestContentProps } = vi.hoisted(() => ({
  latestContentProps: {
    current: null as null | Record<string, unknown>,
  },
}))

vi.mock('@radix-ui/react-alert-dialog', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  Content: ({ children, ...props }: React.ComponentProps<'div'>) => {
    latestContentProps.current = props

    return <div>{children}</div>
  },
  Title: ({ children, ...props }: React.ComponentProps<'h2'>) => <h2 {...props}>{children}</h2>,
  Description: ({ children, ...props }: React.ComponentProps<'p'>) => <p {...props}>{children}</p>,
  Action: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Cancel: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

import { AlertDialogContent } from '@/components/ui/alert-dialog'

describe('AlertDialogContent', () => {
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

  it('prevents escape dismissal while loading and still calls the caller handler', async () => {
    const onEscapeKeyDown = vi.fn()

    await act(async () => {
      root.render(
        <AlertDialogContent isLoading onEscapeKeyDown={onEscapeKeyDown}>
          Content
        </AlertDialogContent>,
      )
    })

    const contentProps = latestContentProps.current

    if (!contentProps) {
      throw new Error('Alert dialog content props were not captured.')
    }

    const escapeEvent = { preventDefault: vi.fn() }

    ;(contentProps.onEscapeKeyDown as (event: typeof escapeEvent) => void)(escapeEvent)

    expect(onEscapeKeyDown).toHaveBeenCalledWith(escapeEvent)
    expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('allows escape dismissal when loading is false', async () => {
    await act(async () => {
      root.render(<AlertDialogContent>Content</AlertDialogContent>)
    })

    const contentProps = latestContentProps.current

    if (!contentProps) {
      throw new Error('Alert dialog content props were not captured.')
    }

    const escapeEvent = { preventDefault: vi.fn() }

    ;(contentProps.onEscapeKeyDown as (event: typeof escapeEvent) => void)(escapeEvent)

    expect(escapeEvent.preventDefault).not.toHaveBeenCalled()
  })
})
