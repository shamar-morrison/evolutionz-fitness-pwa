// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberTypeRecord } from '@/types'

const { currentRoleState, toastMock } = vi.hoisted(() => ({
  currentRoleState: { role: 'admin' as 'admin' | 'staff' },
  toastMock: vi.fn(),
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({
    role,
    children,
    fallback = null,
  }: {
    role: 'admin' | 'staff'
    children: React.ReactNode
    fallback?: React.ReactNode
  }) => (role === 'admin' && currentRoleState.role !== 'admin' ? <>{fallback}</> : <>{children}</>),
}))

vi.mock('@/components/redirect-on-mount', () => ({
  RedirectOnMount: ({ href }: { href: string }) => <div>{`redirect:${href}`}</div>,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

import SettingsPage from '@/app/(app)/settings/page'

function createMemberType(overrides: Partial<MemberTypeRecord> = {}): MemberTypeRecord {
  return {
    id: overrides.id ?? 'type-1',
    name: overrides.name ?? 'General',
    monthly_rate: overrides.monthly_rate ?? 12000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await flushAsyncWork()
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('Assertion did not pass in time.')
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Input value setter is unavailable.')
  }

  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickButtonByLabel(
  container: ParentNode,
  label: string,
  occurrence = 0,
) {
  const buttons = Array.from(container.querySelectorAll('button')).filter(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const button = buttons[occurrence]

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('SettingsPage', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let memberTypesState: MemberTypeRecord[]
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    currentRoleState.role = 'admin'
    toastMock.mockReset()
    memberTypesState = [
      createMemberType(),
      createMemberType({
        id: 'type-2',
        name: 'Civil Servant',
        monthly_rate: 7500,
        created_at: '2026-04-02T00:00:00.000Z',
      }),
      createMemberType({
        id: 'type-3',
        name: 'Student/BPO',
        monthly_rate: 7500,
        created_at: '2026-04-03T00:00:00.000Z',
      }),
    ]

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/settings/member-types') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            ok: true,
            memberTypes: memberTypesState,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (url.includes('/api/settings/member-types/') && init?.method === 'PATCH') {
        const requestBody = JSON.parse(String(init.body)) as { monthly_rate: number }
        const id = url.split('/').at(-1)
        const index = memberTypesState.findIndex((memberType) => memberType.id === id)

        if (index === -1) {
          return new Response(JSON.stringify({ ok: false, error: 'Membership type not found.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        memberTypesState = memberTypesState.map((memberType) =>
          memberType.id === id
            ? {
                ...memberType,
                monthly_rate: requestBody.monthly_rate,
              }
            : memberType,
        )

        return new Response(
          JSON.stringify({
            ok: true,
            memberType: memberTypesState[index],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      throw new Error(`Unhandled fetch request: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    queryClient.clear()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
  })

  it('renders the settings page and membership types for admins', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain('General')
    })
    expect(container.textContent).toContain('Settings')
    expect(container.textContent).toContain('Membership Types')
    expect(container.textContent).toContain(
      'Configure monthly rates for each membership type. Rates apply to new payments going forward.',
    )
    expect(container.textContent).toContain('General')
    expect(container.textContent).toContain('JMD $12,000')
    expect(container.textContent).toContain('Civil Servant')
    expect(container.textContent).toContain('Student/BPO')
  })

  it('redirects staff users to the trainer schedule', async () => {
    currentRoleState.role = 'staff'

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    expect(container.textContent).toContain('redirect:/trainer/schedule')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('updates a membership type rate and refreshes the table', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain('General')
    })

    await clickButtonByLabel(container, 'Edit Rate')

    const rateInput = container.querySelector('#member-type-monthly-rate')

    if (!(rateInput instanceof HTMLInputElement)) {
      throw new Error('Monthly rate input not found.')
    }

    expect(container.textContent).toContain('General')

    await setInputValue(rateInput, '13000')
    await clickButtonByLabel(container, 'Save')
    await waitForAssertion(() => {
      expect(container.textContent).toContain('JMD $13,000')
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/member-types/type-1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
    expect(container.textContent).toContain('JMD $13,000')
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Rate updated',
      description: 'General now uses JMD $13,000.',
    })
  })
})
