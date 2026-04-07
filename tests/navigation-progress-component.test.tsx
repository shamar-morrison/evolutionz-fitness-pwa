// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationProgress } from '@/components/navigation-progress'
import { completeNavigationProgress, startNavigationProgress } from '@/lib/navigation-progress'

const routeState = {
  pathname: '/members',
  search: '',
}

vi.mock('next/navigation', () => ({
  usePathname: () => routeState.pathname,
  useSearchParams: () => new URLSearchParams(routeState.search),
}))

function TestShell() {
  return (
    <>
      <NavigationProgress />
      <a href="/staff" onClick={(event) => event.preventDefault()}>
        Staff
      </a>
      <a href="https://external.example/reports" onClick={(event) => event.preventDefault()}>
        External
      </a>
      <a href="#details" onClick={(event) => event.preventDefault()}>
        Details
      </a>
    </>
  )
}

describe('NavigationProgress', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    routeState.pathname = '/members'
    routeState.search = ''
    window.history.replaceState({}, '', '/members')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      completeNavigationProgress()
      vi.runAllTimers()
    })

    await act(async () => {
      root?.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.useRealTimers()
  })

  it('starts the loader for internal same-origin anchor clicks', async () => {
    await act(async () => {
      root.render(<TestShell />)
    })

    const bar = container.querySelector('[data-navigation-progress="bar"]')
    const staffLink = Array.from(container.querySelectorAll('a')).find(
      (link) => link.getAttribute('href') === '/staff',
    )

    if (!(bar instanceof HTMLDivElement) || !(staffLink instanceof HTMLAnchorElement)) {
      throw new Error('Required navigation progress elements not found.')
    }

    await act(async () => {
      staffLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })

    expect(bar.style.opacity).toBe('1')
    expect(bar.style.transform).toContain('0.12')
  })

  it('ignores external links and hash-only links on the current page', async () => {
    await act(async () => {
      root.render(<TestShell />)
    })

    const bar = container.querySelector('[data-navigation-progress="bar"]')
    const links = Array.from(container.querySelectorAll('a'))
    const externalLink = links.find((link) => link.getAttribute('href') === 'https://external.example/reports')
    const hashLink = links.find((link) => link.getAttribute('href') === '#details')

    if (
      !(bar instanceof HTMLDivElement) ||
      !(externalLink instanceof HTMLAnchorElement) ||
      !(hashLink instanceof HTMLAnchorElement)
    ) {
      throw new Error('Required navigation progress elements not found.')
    }

    await act(async () => {
      externalLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      hashLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })

    expect(bar.style.opacity).toBe('0')
    expect(bar.style.transform).toContain('0')
  })

  it('completes the loader when the route key changes', async () => {
    await act(async () => {
      root.render(<TestShell />)
    })

    await act(async () => {
      startNavigationProgress()
    })

    await act(async () => {
      routeState.pathname = '/staff'
      root.render(<TestShell />)
    })

    const bar = container.querySelector('[data-navigation-progress="bar"]')

    if (!(bar instanceof HTMLDivElement)) {
      throw new Error('Navigation progress bar not found.')
    }

    expect(bar.style.transform).toContain('1')

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(bar.style.opacity).toBe('0')
    expect(bar.style.transform).toContain('0')
  })
})
