// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  pushMock,
  refreshMock,
  readStaffProfileMock,
  signOutMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  signOutMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/staff', () => ({
  readStaffProfile: readStaffProfileMock,
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

import LoginPage from '@/app/(auth)/login/page'

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
      signOut: signOutMock,
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

  it('signs in and redirects staff to /trainer/schedule with a loading state while the request is in flight', async () => {
    const supabase = createSupabaseBrowserClient()
    const pendingSignIn = createDeferred<{
      data: { user: { id: string } }
      error: null
    }>()

    supabase.auth.signInWithPassword.mockReturnValue(pendingSignIn.promise)
    createClientMock.mockReturnValue(supabase)
    readStaffProfileMock.mockResolvedValue({
      id: 'trainer-1',
      role: 'staff',
    })

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
      pendingSignIn.resolve({
        data: {
          user: { id: 'trainer-1' },
        },
        error: null,
      })
    })

    await flushAsyncWork()

    expect(readStaffProfileMock).toHaveBeenCalledWith(supabase, 'trainer-1')
    expect(pushMock).toHaveBeenCalledWith('/trainer/schedule')
    expect(refreshMock).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Unable to sign in')
  })

  it('redirects admins to /dashboard after sign-in', async () => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'admin-1' },
      },
      error: null,
    })
    createClientMock.mockReturnValue(supabase)
    readStaffProfileMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    })

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
      setInputValue(emailInput, 'admin@evolutionzfitness.com')
      setInputValue(passwordInput, 'secret-password')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await flushAsyncWork()

    expect(pushMock).toHaveBeenCalledWith('/dashboard')
  })

  it('shows a generic error when Supabase rejects the credentials', async () => {
    const supabase = createSupabaseBrowserClient()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: null,
      },
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

  it('shows an archived-account error and signs out the session when the profile is archived', async () => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'archived-1' },
      },
      error: null,
    })
    createClientMock.mockReturnValue(supabase)
    readStaffProfileMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'archived-1',
        role: 'staff',
        archivedAt: '2026-04-07T18:00:00.000Z',
      })

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
      setInputValue(emailInput, 'archived@evolutionzfitness.com')
      setInputValue(passwordInput, 'password123')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await flushAsyncWork()

    expect(readStaffProfileMock).toHaveBeenNthCalledWith(1, supabase, 'archived-1')
    expect(readStaffProfileMock).toHaveBeenNthCalledWith(2, supabase, 'archived-1', {
      includeArchived: true,
    })
    expect(signOutMock).toHaveBeenCalledOnce()
    expect(pushMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain(
      'This staff account has been archived. Contact an admin if you need access again.',
    )
  })
})
