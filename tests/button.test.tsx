// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'

describe('Button', () => {
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
  })

  it('renders a spinner when loading is true', async () => {
    await act(async () => {
      root.render(<Button loading>Save Changes</Button>)
    })

    const spinner = container.querySelector('[aria-label="Loading"]')

    expect(spinner).not.toBeNull()
    expect(spinner?.getAttribute('data-icon')).toBe('inline-start')
    expect(container.textContent).toContain('Save Changes')
  })

  it('does not render an empty icon slot when idle', async () => {
    await act(async () => {
      root.render(<Button loading={false}>Save Changes</Button>)
    })

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(container.querySelector('[aria-label="Loading"]')).toBeNull()
  })

  it('forces the button into a disabled state while loading', async () => {
    await act(async () => {
      root.render(<Button loading={true}>Save Changes</Button>)
    })

    const button = container.querySelector('button')

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Button not found.')
    }

    expect(button.disabled).toBe(true)
  })

  it('preserves existing child content when rendered asChild', async () => {
    await act(async () => {
      root.render(
        <Button asChild loading={false}>
          <a href="/members">Members</a>
        </Button>,
      )
    })

    const link = container.querySelector('a')

    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error('Anchor not found.')
    }

    expect(link.textContent).toContain('Members')
    expect(link.getAttribute('href')).toBe('/members')
  })
})
