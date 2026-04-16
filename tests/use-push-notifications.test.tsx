// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { profileState, toastMock } = vi.hoisted(() => ({
  profileState: { role: 'admin' as 'admin' | 'staff' | null },
  toastMock: vi.fn(),
}))

vi.mock('@/contexts/auth-context', () => ({
  useOptionalAuth: () => ({
    profile: profileState.role ? { role: profileState.role } : null,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

import { usePushNotifications } from '@/hooks/use-push-notifications'

let hookValue: ReturnType<typeof usePushNotifications> | null = null

function TestComponent() {
  hookValue = usePushNotifications()
  return null
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

describe('usePushNotifications', () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>
  let getRegistrationMock: ReturnType<typeof vi.fn>
  let getSubscriptionMock: ReturnType<typeof vi.fn>
  let subscriptionUnsubscribeMock: ReturnType<typeof vi.fn>
  let originalNotificationDescriptor: PropertyDescriptor | undefined
  let originalPushManagerDescriptor: PropertyDescriptor | undefined
  let originalServiceWorkerDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    hookValue = null
    profileState.role = 'admin'
    toastMock.mockReset()

    subscriptionUnsubscribeMock = vi.fn().mockResolvedValue(true)
    getSubscriptionMock = vi.fn().mockResolvedValue({
      endpoint: 'https://example.com/subscription',
      unsubscribe: subscriptionUnsubscribeMock,
    } satisfies Partial<PushSubscription>)
    getRegistrationMock = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: getSubscriptionMock,
      },
    })

    originalNotificationDescriptor = Object.getOwnPropertyDescriptor(window, 'Notification')
    originalPushManagerDescriptor = Object.getOwnPropertyDescriptor(window, 'PushManager')
    originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'granted' as NotificationPermission,
        requestPermission: vi.fn(),
      },
    })

    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    })

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: getRegistrationMock,
      },
    })

    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''

    if (originalNotificationDescriptor) {
      Object.defineProperty(window, 'Notification', originalNotificationDescriptor)
    } else {
      Reflect.deleteProperty(window, 'Notification')
    }

    if (originalPushManagerDescriptor) {
      Object.defineProperty(window, 'PushManager', originalPushManagerDescriptor)
    } else {
      Reflect.deleteProperty(window, 'PushManager')
    }

    if (originalServiceWorkerDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorkerDescriptor)
    } else {
      Reflect.deleteProperty(navigator as unknown as Record<PropertyKey, unknown>, 'serviceWorker')
    }

    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
  })

  async function renderHook() {
    await act(async () => {
      root.render(<TestComponent />)
    })

    await flushAsyncWork()
  }

  it('deletes the server subscription before unsubscribing locally', async () => {
    const callOrder: string[] = []

    fetchMock.mockImplementationOnce(async () => {
      callOrder.push('server-delete')
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    subscriptionUnsubscribeMock.mockImplementationOnce(async () => {
      callOrder.push('local-unsubscribe')
      return true
    })

    await renderHook()

    expect(hookValue?.isSubscribed).toBe(true)

    await act(async () => {
      await hookValue?.unsubscribe()
    })

    expect(callOrder).toEqual(['server-delete', 'local-unsubscribe'])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://example.com/subscription' }),
      }),
    )
    expect(subscriptionUnsubscribeMock).toHaveBeenCalledTimes(1)
    expect(hookValue?.isSubscribed).toBe(false)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Push notifications disabled',
      description: 'This device will no longer receive updates.',
    })
  })

  it('throws on a non-ok server delete without unsubscribing locally', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await renderHook()

    let caughtError: unknown = null

    await act(async () => {
      try {
        await hookValue?.unsubscribe()
      } catch (error) {
        caughtError = error
      }
    })

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toBe('Failed to delete subscription on the server.')
    expect(subscriptionUnsubscribeMock).not.toHaveBeenCalled()
    expect(hookValue?.isSubscribed).toBe(true)
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('rethrows fetch errors without unsubscribing locally', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failed'))

    await renderHook()

    let caughtError: unknown = null

    await act(async () => {
      try {
        await hookValue?.unsubscribe()
      } catch (error) {
        caughtError = error
      }
    })

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toBe('Network failed')
    expect(subscriptionUnsubscribeMock).not.toHaveBeenCalled()
    expect(hookValue?.isSubscribed).toBe(true)
    expect(toastMock).not.toHaveBeenCalled()
  })
})
