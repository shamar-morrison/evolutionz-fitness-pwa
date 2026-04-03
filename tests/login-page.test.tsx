// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  pushMock,
  refreshMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}))

import LoginPage from '@/app/login/page'

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason?: unknown) => void

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  }
}

function createSupabaseBrowserClient() {
  return {
    auth: {
      signInWithPassword: vi.fn(),
    },
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('HTMLInputElement value setter is unavailable.')
  }

  setValue.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('LoginPage', () => {
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
    vi.restoreAllMocks()
  })

  it('signs in and redirects to /dashboard with a loading state while the request is in flight', async () => {
    const supabase = createSupabaseBrowserClient()
    const pendingSignIn = createDeferred<{ error: null }>()

    supabase.auth.signInWithPassword.mockReturnValue(pendingSignIn.promise)
    createClientMock.mockReturnValue(supabase)

    await act(async () => {
      root.render(<LoginPage />)
    })

    const emailInput = container.querySelector('#email')
    const passwordInput = container.querySelector('#password')
    const submitButton = container.querySelector('button[type="submit"]')
    const form = container.querySelector('form')

    if (!(emailInput instanceof HTMLInputElement)) {
      throw new Error('Email input not found.')
    }

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Submit button not found.')
    }

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Login form not found.')
    }

    await act(async () => {
      setInputValue(emailInput, 'staff@evolutionzfitness.com')
      setInputValue(passwordInput, 'secret-password')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@evolutionzfitness.com',
      password: 'secret-password',
    })
    expect(submitButton.textContent).toBe('Signing In...')
    expect(submitButton.disabled).toBe(true)

    await act(async () => {
      pendingSignIn.resolve({ error: null })
    })

    await flushAsyncWork()

    expect(pushMock).toHaveBeenCalledWith('/dashboard')
    expect(refreshMock).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Unable to sign in')
  })

  it('shows a generic error when Supabase rejects the credentials', async () => {
    const supabase = createSupabaseBrowserClient()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    supabase.auth.signInWithPassword.mockResolvedValue({
      error: {
        message: 'Invalid login credentials',
      },
    })
    createClientMock.mockReturnValue(supabase)

    await act(async () => {
      root.render(<LoginPage />)
    })

    const emailInput = container.querySelector('#email')
    const passwordInput = container.querySelector('#password')
    const form = container.querySelector('form')

    if (!(emailInput instanceof HTMLInputElement)) {
      throw new Error('Email input not found.')
    }

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Login form not found.')
    }

    await act(async () => {
      setInputValue(emailInput, 'staff@evolutionzfitness.com')
      setInputValue(passwordInput, 'wrong-password')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await flushAsyncWork()

    expect(pushMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain(
      'Unable to sign in. Please check your credentials and try again.',
    )
    expect(container.textContent).not.toContain('Invalid login credentials')
    expect(consoleErrorSpy).toHaveBeenCalledOnce()
  })
})
