// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PwaInstallPrompt } from '@/components/pwa-install-prompt'

type MockBeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

function createBeforeInstallPromptEvent() {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as MockBeforeInstallPromptEvent

  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({
    outcome: 'accepted',
    platform: 'web',
  })

  return event
}

describe('PwaInstallPrompt', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    window.sessionStorage.clear()
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
    window.sessionStorage.clear()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.restoreAllMocks()
  })

  it('allows the install prompt to be dismissed for the current browser tab', async () => {
    await act(async () => {
      root.render(<PwaInstallPrompt />)
    })

    await act(async () => {
      window.dispatchEvent(createBeforeInstallPromptEvent())
    })

    expect(container.textContent).toContain('Install Evolutionz Fitness')

    const dismissButton = container.querySelector('button[aria-label="Dismiss install prompt"]')

    if (!(dismissButton instanceof HTMLButtonElement)) {
      throw new Error('Dismiss button not found.')
    }

    await act(async () => {
      dismissButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('Install Evolutionz Fitness')

    await act(async () => {
      root.unmount()
    })

    root = createRoot(container)

    await act(async () => {
      root.render(<PwaInstallPrompt />)
    })

    await act(async () => {
      window.dispatchEvent(createBeforeInstallPromptEvent())
    })

    expect(container.textContent).not.toContain('Install Evolutionz Fitness')
  })
})
