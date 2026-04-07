// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { latestAlertDialogProps, latestContentProps } = vi.hoisted(() => ({
  latestAlertDialogProps: {
    current: null as null | Record<string, unknown>,
  },
  latestContentProps: {
    current: null as null | Record<string, unknown>,
  },
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => {
    latestAlertDialogProps.current = props
    return props.open ? <div>{children}</div> : null
  },
  AlertDialogContent: ({
    children,
    isLoading = false,
  }: React.ComponentProps<'div'> & { isLoading?: boolean }) => {
    latestContentProps.current = { isLoading }
    return <div data-is-loading={isLoading ? 'true' : 'false'}>{children}</div>
  },
  AlertDialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    asChild = false,
    ...props
  }: React.ComponentProps<'button'> & { asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props)
    }

    return (
      <button type="button" {...props}>
        {children}
      </button>
    )
  },
}))

import { ConfirmDialog } from '@/components/confirm-dialog'

describe('ConfirmDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    latestAlertDialogProps.current = null
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

  it('shows the loading spinner on the confirm button and passes loading to the dialog content', async () => {
    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Delete member?"
          description="Delete this member permanently."
          confirmLabel="Delete Member"
          onConfirm={() => undefined}
          onOpenChange={() => undefined}
          isLoading
          variant="destructive"
        />,
      )
    })

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Delete Member',
    )

    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error('Confirm button not found.')
    }

    expect(confirmButton.disabled).toBe(true)
    expect(confirmButton.querySelector('[aria-label="Loading"]')).not.toBeNull()
    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(latestContentProps.current).toEqual({ isLoading: true })
  })

  it('does not auto-close when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Delete member?"
          description="Delete this member permanently."
          confirmLabel="Delete Member"
          onConfirm={onConfirm}
          onOpenChange={onOpenChange}
          variant="destructive"
        />,
      )
    })

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Delete Member',
    )

    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error('Confirm button not found.')
    }

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('ignores close requests from onOpenChange while loading', async () => {
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Delete member?"
          description="Delete this member permanently."
          confirmLabel="Delete Member"
          onConfirm={() => undefined}
          onOpenChange={onOpenChange}
          isLoading
          variant="destructive"
        />,
      )
    })

    const alertDialogProps = latestAlertDialogProps.current

    if (!alertDialogProps) {
      throw new Error('Alert dialog props were not captured.')
    }

    ;(alertDialogProps.onOpenChange as (open: boolean) => void)(false)

    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Delete member?"
          description="Delete this member permanently."
          confirmLabel="Delete Member"
          onConfirm={() => undefined}
          onOpenChange={onOpenChange}
          variant="destructive"
        />,
      )
    })

    const idleAlertDialogProps = latestAlertDialogProps.current

    if (!idleAlertDialogProps) {
      throw new Error('Idle alert dialog props were not captured.')
    }

    ;(idleAlertDialogProps.onOpenChange as (open: boolean) => void)(false)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
