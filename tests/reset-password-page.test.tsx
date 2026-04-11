// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  refreshMock,
  replaceMock,
  toastMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  refreshMock: vi.fn(),
  replaceMock: vi.fn(),
  toastMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

import ResetPasswordPage from '@/app/auth/reset-password/page'

function createSupabaseBrowserClient() {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: unsubscribeMock,
          },
        },
      })),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn(),
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

function setLocation({ hash = '', search = '' }: { hash?: string; search?: string } = {}) {
  window.history.replaceState({}, '', `/auth/reset-password${search}${hash}`)
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function advancePollingIntervals(intervals: number) {
  for (let interval = 0; interval < intervals; interval += 1) {
    await act(async () => {
      vi.advanceTimersByTime(750)
      await Promise.resolve()
      await Promise.resolve()
    })
  }
}

async function renderResetPasswordPage(root: Root) {
  await act(async () => {
    root.render(<ResetPasswordPage />)
  })
}

describe('ResetPasswordPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    vi.useFakeTimers()
    createClientMock.mockReset()
    refreshMock.mockReset()
    replaceMock.mockReset()
    toastMock.mockReset()
    unsubscribeMock.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    setLocation()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    vi.useRealTimers()
    container.remove()
    document.body.innerHTML = ''
    setLocation()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.restoreAllMocks()
  })

  it('keeps checking the recovery session until it becomes available', async () => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'staff-1' } } } })

    createClientMock.mockReturnValue(supabase)
    setLocation({ hash: '#type=recovery' })

    await renderResetPasswordPage(root)
    await flushAsyncWork()

    expect(container.textContent).toContain('Checking your reset link...')

    await advancePollingIntervals(3)

    expect(container.textContent).toContain('Update password')
    expect(container.textContent).not.toContain('Checking your reset link...')
    expect(container.textContent).not.toContain('This reset link is invalid or has expired.')
  })

  it('marks the recovery link invalid after the polling window is exhausted', async () => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    createClientMock.mockReturnValue(supabase)
    setLocation({ hash: '#type=recovery' })

    await renderResetPasswordPage(root)
    await flushAsyncWork()

    await advancePollingIntervals(10)

    const invalidMessageMatches =
      container.textContent?.match(/This reset link is invalid or has expired\./g) ?? []

    expect(invalidMessageMatches).toHaveLength(1)
    expect(container.textContent).toContain('Request a new reset link')
  })

  it('redirects to the whitelisted login success message after updating the password', async () => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: 'staff-1' } },
      },
    })
    supabase.auth.updateUser.mockResolvedValue({ error: null })
    createClientMock.mockReturnValue(supabase)
    setLocation({ hash: '#type=recovery' })

    await renderResetPasswordPage(root)
    await flushAsyncWork()

    const passwordInput = container.querySelector('#password')
    const confirmPasswordInput = container.querySelector('#confirmPassword')
    const form = container.querySelector('form')

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    if (!(confirmPasswordInput instanceof HTMLInputElement)) {
      throw new Error('Confirm password input not found.')
    }

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Reset password form not found.')
    }

    await act(async () => {
      setInputValue(passwordInput, 'new-password')
      setInputValue(confirmPasswordInput, 'new-password')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await flushAsyncWork()

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
    expect(supabase.auth.signOut).toHaveBeenCalledOnce()
    expect(replaceMock).toHaveBeenCalledWith('/login?message=password-updated')
    expect(refreshMock).toHaveBeenCalledOnce()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('adds visible focus styles to both password visibility toggle buttons', async () => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: 'staff-1' } },
      },
    })
    createClientMock.mockReturnValue(supabase)
    setLocation({ hash: '#type=recovery' })

    await renderResetPasswordPage(root)
    await flushAsyncWork()

    const toggleButtons = container.querySelectorAll('button[aria-label="Show password"]')

    expect(toggleButtons).toHaveLength(2)

    for (const toggleButton of Array.from(toggleButtons)) {
      if (!(toggleButton instanceof HTMLButtonElement)) {
        throw new Error('Password toggle button not found.')
      }

      expect(toggleButton.className).toContain('focus-visible:outline-none')
      expect(toggleButton.className).toContain('focus-visible:ring-2')
      expect(toggleButton.className).toContain('focus-visible:ring-offset-2')
    }
  })
})
