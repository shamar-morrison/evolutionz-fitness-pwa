// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MemberTypeRecord,
  MembershipExpiryEmailSettings,
} from '@/types'

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

vi.mock('@/components/authenticated-home-redirect', () => ({
  AuthenticatedHomeRedirect: () => <div>redirect:home</div>,
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

function createMembershipExpiryEmailSettings(
  overrides: Partial<MembershipExpiryEmailSettings> = {},
): MembershipExpiryEmailSettings {
  return {
    enabled: overrides.enabled ?? true,
    dayOffsets: overrides.dayOffsets ?? [1, 7],
    subjectTemplate:
      overrides.subjectTemplate ??
      'Your Evolutionz Fitness membership expires on {{expiry_date}}',
    bodyTemplate:
      overrides.bodyTemplate ??
      'Hi {{member_name}},\n\nYour membership expires on {{expiry_date}}.',
    lastRun:
      overrides.lastRun === undefined
        ? {
            status: 'success',
            startedAt: '2026-04-10T11:00:00.000Z',
            completedAt: '2026-04-10T11:00:30.000Z',
            sentCount: 4,
            skippedCount: 1,
            duplicateCount: 0,
            errorCount: 0,
            message: '4 sent, 1 skipped, 0 duplicates, 0 errors',
          }
        : overrides.lastRun,
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

async function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
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

function getButtonByLabel(
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

  return button
}

async function clickButtonByAriaLabel(container: ParentNode, label: string) {
  const button = container.querySelector(`button[aria-label="${label}"]`)

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
  let membershipExpiryEmailSettingsState: MembershipExpiryEmailSettings
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
    membershipExpiryEmailSettingsState = createMembershipExpiryEmailSettings()

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

        memberTypesState = memberTypesState.map((memberType) =>
          memberType.id === id
            ? {
                ...memberType,
                monthly_rate: requestBody.monthly_rate,
              }
            : memberType,
        )

        const updatedMemberType = memberTypesState.find((memberType) => memberType.id === id)

        return new Response(
          JSON.stringify({
            ok: true,
            memberType: updatedMemberType,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (
        url.endsWith('/api/settings/membership-expiry-emails') &&
        (!init?.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            ok: true,
            settings: membershipExpiryEmailSettingsState,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (url.endsWith('/api/settings/membership-expiry-emails') && init?.method === 'PATCH') {
        const requestBody = JSON.parse(String(init.body)) as MembershipExpiryEmailSettings
        membershipExpiryEmailSettingsState = {
          ...membershipExpiryEmailSettingsState,
          enabled: requestBody.enabled,
          dayOffsets: requestBody.dayOffsets,
          subjectTemplate: requestBody.subjectTemplate,
          bodyTemplate: requestBody.bodyTemplate,
        }

        return new Response(
          JSON.stringify({
            ok: true,
            settings: membershipExpiryEmailSettingsState,
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

  it('renders the settings page, the membership types section, and the reminder settings summary', async () => {
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
    expect(container.textContent).toContain('Membership Expiry Emails')
    expect(container.textContent).toContain('Configure monthly rates for each membership type.')
    expect(container.textContent).toContain('Status: Success')
    expect(container.textContent).toContain('4 sent, 1 skipped, 0 duplicates, 0 errors')
    expect(container.textContent).toContain('{{member_name}}')
    expect(container.textContent).toContain('{{expiry_date}}')
    expect(container.textContent).toContain('{{days_until_expiry}}')
    expect(container.textContent).toContain('1 day before expiry')
    expect(container.textContent).toContain('7 days before expiry')
  })

  it('redirects staff users to their authenticated home', async () => {
    currentRoleState.role = 'staff'

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    expect(container.textContent).toContain('redirect:home')
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
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Rate updated',
      description: 'General now uses JMD $13,000.',
    })
  })

  it('saves membership expiry reminder settings after editing offsets and templates', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.querySelector('#membership-expiry-day-offset')).not.toBeNull()
    })

    const dayOffsetInput = container.querySelector('#membership-expiry-day-offset')
    const subjectInput = container.querySelector('#membership-expiry-subject-template')
    const bodyTextarea = container.querySelector('#membership-expiry-body-template')

    if (
      !(dayOffsetInput instanceof HTMLInputElement) ||
      !(subjectInput instanceof HTMLInputElement) ||
      !(bodyTextarea instanceof HTMLTextAreaElement)
    ) {
      throw new Error('Reminder settings inputs not found.')
    }

    expect(getButtonByLabel(container, 'Save Reminder Settings').disabled).toBe(true)

    await setInputValue(dayOffsetInput, '3')
    await clickButtonByLabel(container, 'Add Offset')
    await setInputValue(subjectInput, 'Reminder for {{member_name}}')
    await setInputValue(bodyTextarea, 'Hello {{member_name}}\nExpires on {{expiry_date}}')

    expect(getButtonByLabel(container, 'Save Reminder Settings').disabled).toBe(false)

    await clickButtonByLabel(container, 'Save Reminder Settings')

    await waitForAssertion(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Reminder settings updated',
        description: 'Membership expiry reminder emails will use the new configuration.',
      })
    })

    await waitForAssertion(() => {
      expect(getButtonByLabel(container, 'Save Reminder Settings').disabled).toBe(true)
    })

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/settings/membership-expiry-emails' &&
        typeof init === 'object' &&
        init?.method === 'PATCH',
    )

    expect(patchCall).toBeDefined()
    expect(
      JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({
      enabled: true,
      dayOffsets: [1, 3, 7],
      subjectTemplate: 'Reminder for {{member_name}}',
      bodyTemplate: 'Hello {{member_name}}\nExpires on {{expiry_date}}',
    })
  })

  it('disables the reminder save button when the form matches the saved settings', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.querySelector('#membership-expiry-subject-template')).not.toBeNull()
    })

    const subjectInput = container.querySelector('#membership-expiry-subject-template')

    if (!(subjectInput instanceof HTMLInputElement)) {
      throw new Error('Reminder subject input not found.')
    }

    expect(getButtonByLabel(container, 'Save Reminder Settings').disabled).toBe(true)

    await setInputValue(subjectInput, ' Reminder for {{member_name}} ')

    expect(getButtonByLabel(container, 'Save Reminder Settings').disabled).toBe(false)

    await setInputValue(
      subjectInput,
      ` ${membershipExpiryEmailSettingsState.subjectTemplate} `,
    )

    expect(getButtonByLabel(container, 'Save Reminder Settings').disabled).toBe(true)
  })

  it('blocks enabling reminder emails without at least one offset', async () => {
    membershipExpiryEmailSettingsState = createMembershipExpiryEmailSettings({
      enabled: false,
      dayOffsets: [],
      lastRun: null,
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.querySelector('#membership-expiry-enabled')).not.toBeNull()
    })

    fetchMock.mockClear()

    const enabledCheckbox = container.querySelector('#membership-expiry-enabled')

    if (!(enabledCheckbox instanceof HTMLInputElement)) {
      throw new Error('Reminder enabled checkbox not found.')
    }

    await act(async () => {
      enabledCheckbox.click()
    })
    await clickButtonByLabel(container, 'Save Reminder Settings')

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Reminder offsets required',
      description: 'Add at least one reminder day offset before enabling reminder emails.',
      variant: 'destructive',
    })
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === '/api/settings/membership-expiry-emails' &&
          typeof init === 'object' &&
          init?.method === 'PATCH',
      ),
    ).toBe(false)
  })

  it('removes reminder offsets from the editor', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SettingsPage />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain('1 day before expiry')
    })

    await clickButtonByAriaLabel(container, 'Remove 1 day offset')
    await clickButtonByAriaLabel(container, 'Remove 7 day offset')

    expect(container.textContent).toContain('No reminder offsets configured.')
  })
})
