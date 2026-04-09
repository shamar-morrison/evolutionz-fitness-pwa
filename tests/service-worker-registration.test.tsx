// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceWorkerRegistration } from '@/components/service-worker-registration'

describe('ServiceWorkerRegistration', () => {
  let container: HTMLDivElement
  let root: Root
  let originalNodeEnv: string | undefined
  let originalServiceWorkerDescriptor: PropertyDescriptor | undefined
  let processEnv: Record<string, string | undefined>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    processEnv = process.env as Record<string, string | undefined>
    originalNodeEnv = processEnv.NODE_ENV
    originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    processEnv.NODE_ENV = originalNodeEnv

    if (originalServiceWorkerDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorkerDescriptor)
    } else {
      Reflect.deleteProperty(navigator as unknown as Record<PropertyKey, unknown>, 'serviceWorker')
    }

    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.restoreAllMocks()
  })

  it('logs rejected service worker registrations', async () => {
    const registrationError = new Error('registration failed')
    const registerMock = vi.fn().mockRejectedValue(registrationError)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    processEnv.NODE_ENV = 'production'
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: registerMock,
      },
    })

    await act(async () => {
      root.render(<ServiceWorkerRegistration />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(registerMock).toHaveBeenCalledWith('/sw.js')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to register service worker:',
      registrationError,
    )
  })
})
