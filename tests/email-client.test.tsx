// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'
import type { Member, MemberTypeRecord } from '@/types'

const {
  toastMock,
  useEmailQuotaMock,
  useMembersMock,
  useMemberTypesMock,
} = vi.hoisted(() => ({
  toastMock: vi.fn(),
  useEmailQuotaMock: vi.fn(),
  useMembersMock: vi.fn(),
  useMemberTypesMock: vi.fn(),
}))

vi.mock('@tiptap/react', async () => {
  const React = await import('react')

  function createChain() {
    const chain = {
      focus: () => chain,
      toggleBold: () => chain,
      toggleItalic: () => chain,
      toggleUnderline: () => chain,
      toggleBulletList: () => chain,
      toggleOrderedList: () => chain,
      run: () => undefined,
    }

    return chain
  }

  return {
    useEditor: (options: { content?: string; onUpdate?: (input: { editor: any }) => void }) => {
      const editorRef = React.useRef<any>(null)

      if (!editorRef.current) {
        const editor: any = {
          _html: typeof options.content === 'string' ? options.content : '',
          _onUpdate: options.onUpdate,
          getHTML: () => editor._html,
          isActive: () => false,
          chain: () => createChain(),
          commands: {
            clearContent: () => {
              editor._html = ''
            },
          },
        }

        editorRef.current = editor
      }

      editorRef.current._onUpdate = options.onUpdate

      return editorRef.current
    },
    EditorContent: ({ editor }: { editor: any }) => (
      <textarea
        aria-label="Email body editor"
        defaultValue={editor?._html ?? ''}
        onInput={(event) => {
          editor._html = (event.currentTarget as HTMLTextAreaElement).value
          editor._onUpdate?.({ editor })
        }}
      />
    ),
  }
})

vi.mock('@tiptap/starter-kit', () => ({
  default: {
    configure: () => ({}),
  },
}))

vi.mock('@tiptap/extension-underline', () => ({
  default: {},
}))

vi.mock('@/components/searchable-select', () => ({
  SearchableSelect: () => <div />,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    type = 'button',
    disabled,
    onClick,
    className,
  }: ComponentProps<'button'>) => (
    <button type={type} disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
    disabled,
    className,
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    id?: string
    disabled?: boolean
    className?: string
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked === true}
      disabled={disabled}
      className={className}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children, ...props }: ComponentProps<'div'>) => (
    <div role="dialog" {...props}>
      {children}
    </div>
  ),
  DialogDescription: ({ children, ...props }: ComponentProps<'p'>) => (
    <p {...props}>{children}</p>
  ),
  DialogHeader: ({ children, ...props }: ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  DialogTitle: ({ children, ...props }: ComponentProps<'h2'>) => (
    <h2 {...props}>{children}</h2>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    className,
    ...props
  }: ComponentProps<'input'>) => <input className={className} {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span>Loading</span>,
}))

vi.mock('@/components/ui/toggle', () => ({
  Toggle: ({
    children,
    disabled,
    onPressedChange,
    pressed,
  }: {
    children: ReactNode
    disabled?: boolean
    onPressedChange?: (pressed: boolean) => void
    pressed?: boolean
  }) => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={() => onPressedChange?.(!pressed)}
    >
      {children}
    </button>
  ),
}))

vi.mock('@/hooks/use-member-types', () => ({
  useMemberTypes: useMemberTypesMock,
}))

vi.mock('@/hooks/use-email-quota', () => ({
  useEmailQuota: useEmailQuotaMock,
}))

vi.mock('@/hooks/use-members', () => ({
  useMembers: useMembersMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

import { EmailClient } from '@/app/(app)/email/email-client'

const GENERAL_MEMBER_TYPE_ID = 'type-general'
const STUDENT_MEMBER_TYPE_ID = 'type-student'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? 'EMP-001',
    name: overrides.name ?? 'Member One',
    cardNo: overrides.cardNo ?? null,
    cardCode: overrides.cardCode ?? null,
    cardStatus: overrides.cardStatus ?? null,
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? GENERAL_MEMBER_TYPE_ID,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? null,
    email: overrides.email ?? 'member@example.com',
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? null,
    endTime: overrides.endTime ?? null,
  }
}

async function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
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

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function getCheckbox(container: HTMLElement, selector: string) {
  const checkbox = container.querySelector(selector)

  expect(checkbox).toBeInstanceOf(HTMLInputElement)

  return checkbox as HTMLInputElement
}

function getButton(container: HTMLElement, selector: string) {
  const button = container.querySelector(selector)

  expect(button).toBeInstanceOf(HTMLButtonElement)

  return button as HTMLButtonElement
}

async function selectMemberTypeFilter(
  container: HTMLElement,
  status: 'active' | 'expiring' | 'expired',
  memberTypeId = GENERAL_MEMBER_TYPE_ID,
) {
  await clickElement(getCheckbox(container, `#email-${status}-members`))
  await clickElement(getCheckbox(container, `#email-${status}-member-type-${memberTypeId}`))
}

describe('EmailClient', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    toastMock.mockReset()
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-1',
          name: 'Alpha',
          email: 'alpha@example.com',
        }),
        createMember({
          id: 'member-2',
          name: 'Beta',
          email: 'beta@example.com',
        }),
        createMember({
          id: 'member-3',
          name: 'Gamma',
          email: 'gamma@example.com',
        }),
      ],
      isLoading: false,
      error: null,
    })
    useMemberTypesMock.mockReturnValue({
      memberTypes: [
        {
          id: GENERAL_MEMBER_TYPE_ID,
          name: 'General',
          monthly_rate: 5000,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: STUDENT_MEMBER_TYPE_ID,
          name: 'Student',
          monthly_rate: 3000,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ] as MemberTypeRecord[],
      isLoading: false,
      error: null,
    })
    useEmailQuotaMock.mockReturnValue({
      quota: {
        sent: 12,
        limit: 100,
        remaining: 88,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    useMembersMock.mockReset()
    useMemberTypesMock.mockReset()
    useEmailQuotaMock.mockReset()
  })

  it('shows the remaining daily quota in the warning copy when quota data is available', async () => {
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-1',
          name: 'Alpha',
          email: 'alpha@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-2',
          name: 'Beta',
          email: 'beta@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-3',
          name: 'Gamma',
          email: 'gamma@example.com',
          status: 'Expired',
        }),
      ],
      isLoading: false,
      error: null,
    })
    useEmailQuotaMock.mockReturnValue({
      quota: {
        sent: 98,
        limit: 100,
        remaining: 2,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={10} />)
    })

    await selectMemberTypeFilter(container, 'active')
    await selectMemberTypeFilter(container, 'expired')

    expect(container.textContent).toContain(
      'You have 2 emails remaining today. Only the first 2 recipients will receive this email.',
    )
  })

  it('falls back to the configured daily limit warning while quota is loading', async () => {
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-1',
          name: 'Alpha',
          email: 'alpha@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-2',
          name: 'Beta',
          email: 'beta@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-3',
          name: 'Gamma',
          email: 'gamma@example.com',
          status: 'Expired',
        }),
      ],
      isLoading: false,
      error: null,
    })
    useEmailQuotaMock.mockReturnValue({
      quota: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={2} />)
    })

    await selectMemberTypeFilter(container, 'active')
    await selectMemberTypeFilter(container, 'expired')

    expect(container.textContent).toContain(
      'You can send up to 2 emails per day. Only the first 2 recipients will receive this email.',
    )
  })

  it('renders the daily quota counter near the top of the page', async () => {
    await act(async () => {
      root.render(<EmailClient resendDailyLimit={5} />)
    })

    expect(container.textContent).toContain('Daily Email Quota')
    expect(container.textContent).toContain('88 of 100 remaining')
    expect(container.textContent).toContain('12 sent today (Jamaica time)')
  })

  it('shows the warning quota state when 20 or fewer emails remain', async () => {
    useEmailQuotaMock.mockReturnValue({
      quota: {
        sent: 80,
        limit: 100,
        remaining: 20,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={5} />)
    })

    expect(container.textContent).toContain('20 of 100 remaining')
    expect(container.textContent).toContain('Warning: 20 or fewer emails remain today.')
  })

  it('renders the expired members checkbox and updates the live recipient count', async () => {
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-1',
          name: 'Alpha',
          email: 'alpha@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-2',
          name: 'Beta',
          email: 'beta@example.com',
          status: 'Expired',
        }),
        createMember({
          id: 'member-3',
          name: 'Gamma',
          email: 'gamma@example.com',
          status: 'Suspended',
        }),
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={5} />)
    })

    const expiredMembersCheckbox = container.querySelector('#email-expired-members')

    expect(expiredMembersCheckbox).toBeInstanceOf(HTMLInputElement)
    expect(container.textContent).toContain('0Recipients Selected')

    await clickElement(expiredMembersCheckbox as HTMLInputElement)

    expect(container.textContent).toContain('0Recipients Selected')
    expect(container.textContent).toContain('Membership types')

    await clickElement(getCheckbox(container, `#email-expired-member-type-${GENERAL_MEMBER_TYPE_ID}`))

    expect(container.textContent).toContain('1Recipient Selected')
    expect(container.textContent).toContain('All expired members')
  })

  it('renders status membership type selectors independently and removes the standalone type filter', async () => {
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-1',
          name: 'Active General',
          email: 'active-general@example.com',
          status: 'Active',
          memberTypeId: GENERAL_MEMBER_TYPE_ID,
        }),
        createMember({
          id: 'member-2',
          name: 'Active Student',
          email: 'active-student@example.com',
          status: 'Active',
          memberTypeId: STUDENT_MEMBER_TYPE_ID,
        }),
        createMember({
          id: 'member-3',
          name: 'Expired Student',
          email: 'expired-student@example.com',
          status: 'Expired',
          memberTypeId: STUDENT_MEMBER_TYPE_ID,
        }),
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={10} />)
    })

    expect(container.textContent).not.toContain('By membership type')

    await clickElement(getCheckbox(container, '#email-active-members'))

    expect(container.textContent).toContain('Membership types')
    expect(container.textContent).toContain('0Recipients Selected')

    await clickElement(getCheckbox(container, `#email-active-member-type-${GENERAL_MEMBER_TYPE_ID}`))

    expect(container.textContent).toContain('1Recipient Selected')

    await clickElement(getCheckbox(container, '#email-expired-members'))
    await clickElement(getCheckbox(container, `#email-expired-member-type-${STUDENT_MEMBER_TYPE_ID}`))

    expect(container.textContent).toContain('2Recipients Selected')
    expect(getCheckbox(container, `#email-active-member-type-${STUDENT_MEMBER_TYPE_ID}`).checked).toBe(false)
    expect(getCheckbox(container, `#email-expired-member-type-${GENERAL_MEMBER_TYPE_ID}`).checked).toBe(false)
  })

  it('opens a sorted quota-aware recipients preview', async () => {
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-z',
          name: 'Maya Zebra',
          email: 'zebra@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-b',
          name: 'Avery Brown',
          email: 'brown@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-a',
          name: 'Chris Adams',
          email: 'adams@example.com',
          status: 'Active',
        }),
      ],
      isLoading: false,
      error: null,
    })
    useEmailQuotaMock.mockReturnValue({
      quota: {
        sent: 98,
        limit: 100,
        remaining: 2,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={10} />)
    })

    await selectMemberTypeFilter(container, 'active')
    await clickElement(getButton(container, 'button[aria-label="View 3 recipients selected"]'))

    const dialog = container.querySelector('[role="dialog"]')

    expect(dialog).toBeInstanceOf(HTMLDivElement)
    expect(dialog?.textContent).toContain('3 recipients selected (2 will receive this email)')
    expect(dialog?.textContent).toContain('Will receive this email')
    expect(dialog?.textContent).toContain('Will not receive this email (quota exceeded)')

    const dialogText = dialog?.textContent ?? ''

    expect(dialogText).toContain('Chris Adams')
    expect(dialogText).toContain('Avery Brown')
    expect(dialogText).toContain('Maya Zebra')
    expect(dialogText.indexOf('Chris Adams')).toBeLessThan(dialogText.indexOf('Avery Brown'))
    expect(dialogText.indexOf('Avery Brown')).toBeLessThan(dialogText.indexOf('Maya Zebra'))
  })

  it('deselects recipients from the preview and sends the same sorted filtered list', async () => {
    const sentRecipients: Array<{ name: string; email: string }> = []

    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-z',
          name: 'Maya Zebra',
          email: 'zebra@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-b',
          name: 'Avery Brown',
          email: 'brown@example.com',
          status: 'Active',
        }),
        createMember({
          id: 'member-a',
          name: 'Chris Adams',
          email: 'adams@example.com',
          status: 'Active',
        }),
      ],
      isLoading: false,
      error: null,
    })
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('11111111-1111-4111-8111-111111111111'),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

        if (url.startsWith('/api/email/recipients')) {
          return new Response(
            JSON.stringify({
              ok: true,
              recipients: [
                { id: 'member-z', name: 'Maya Zebra', email: 'zebra@example.com' },
                { id: 'member-b', name: 'Avery Brown', email: 'brown@example.com' },
                { id: 'member-a', name: 'Chris Adams', email: 'adams@example.com' },
              ],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        if (url === '/api/email/send') {
          const formData = init?.body as FormData
          sentRecipients.push(
            ...(JSON.parse(String(formData.get('recipients'))) as Array<{
              name: string
              email: string
            }>),
          )

          return new Response(
            JSON.stringify({
              ok: true,
              sentCount: 2,
              alreadySentCount: 0,
              skippedDueToQuotaCount: 0,
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      }),
    )

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={10} />)
    })

    await selectMemberTypeFilter(container, 'active')
    await clickElement(getButton(container, 'button[aria-label="View 3 recipients selected"]'))
    await clickElement(getButton(container, 'button[aria-label="Remove Avery Brown"]'))

    expect(container.textContent).toContain('2Recipients Selected')

    const subjectInput = container.querySelector('#email-subject')
    const bodyInput = container.querySelector('textarea[aria-label="Email body editor"]')
    const sendButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === 'Send Email',
    )

    expect(subjectInput).toBeInstanceOf(HTMLInputElement)
    expect(bodyInput).toBeInstanceOf(HTMLTextAreaElement)
    expect(sendButton).toBeInstanceOf(HTMLButtonElement)

    await setInputValue(subjectInput as HTMLInputElement, 'Hello members')
    await setInputValue(bodyInput as HTMLTextAreaElement, '<p>Hello team</p>')
    await clickElement(sendButton as HTMLButtonElement)
    await flushAsyncWork()

    expect(sentRecipients).toEqual([
      { name: 'Chris Adams', email: 'adams@example.com' },
      { name: 'Maya Zebra', email: 'zebra@example.com' },
    ])
  })

  it('reuses the idempotency key after a failed send and regenerates it after a draft edit', async () => {
    const randomUUIDMock = vi
      .fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    const sentKeys: string[] = []
    const recipientLookupUrls: string[] = []
    let sendAttemptCount = 0

    vi.stubGlobal('crypto', {
      randomUUID: randomUUIDMock,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

        if (url.startsWith('/api/email/recipients')) {
          recipientLookupUrls.push(url)
          return new Response(
            JSON.stringify({
              ok: true,
              recipients: [
                { id: 'member-1', name: 'Alpha', email: 'alpha@example.com' },
                { id: 'member-2', name: 'Beta', email: 'beta@example.com' },
              ],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        if (url === '/api/email/send') {
          const formData = init?.body as FormData
          sendAttemptCount += 1
          sentKeys.push(String(formData.get('idempotencyKey')))

          if (sendAttemptCount < 3) {
            return new Response(JSON.stringify({ ok: false, error: 'Send failed.' }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
              },
            })
          }

          return new Response(
            JSON.stringify({
              ok: true,
              sentCount: 2,
              alreadySentCount: 0,
              skippedDueToQuotaCount: 0,
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      }),
    )

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={5} />)
    })

    const subjectInput = container.querySelector('#email-subject')
    const bodyInput = container.querySelector('textarea[aria-label="Email body editor"]')
    const sendButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === 'Send Email',
    )

    expect(subjectInput).toBeInstanceOf(HTMLInputElement)
    expect(bodyInput).toBeInstanceOf(HTMLTextAreaElement)
    expect(sendButton).toBeInstanceOf(HTMLButtonElement)

    await selectMemberTypeFilter(container, 'active')
    await selectMemberTypeFilter(container, 'expired')
    await setInputValue(subjectInput as HTMLInputElement, 'Hello members')
    await setInputValue(bodyInput as HTMLTextAreaElement, '<p>Hello team</p>')

    await clickElement(sendButton as HTMLButtonElement)
    await flushAsyncWork()
    await clickElement(sendButton as HTMLButtonElement)
    await flushAsyncWork()

    expect(sentKeys).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ])
    expect(recipientLookupUrls).toEqual([
      '/api/email/recipients?activeMembers=true&expiredMembers=true&activeMemberTypeIds=type-general&expiredMemberTypeIds=type-general',
      '/api/email/recipients?activeMembers=true&expiredMembers=true&activeMemberTypeIds=type-general&expiredMemberTypeIds=type-general',
    ])

    await setInputValue(subjectInput as HTMLInputElement, 'Updated subject')
    await clickElement(sendButton as HTMLButtonElement)
    await flushAsyncWork()

    expect(sentKeys).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(recipientLookupUrls).toEqual([
      '/api/email/recipients?activeMembers=true&expiredMembers=true&activeMemberTypeIds=type-general&expiredMemberTypeIds=type-general',
      '/api/email/recipients?activeMembers=true&expiredMembers=true&activeMemberTypeIds=type-general&expiredMemberTypeIds=type-general',
      '/api/email/recipients?activeMembers=true&expiredMembers=true&activeMemberTypeIds=type-general&expiredMemberTypeIds=type-general',
    ])
    expect(randomUUIDMock).toHaveBeenCalledTimes(2)
  })

  it('refetches the quota counter after a successful send', async () => {
    const refetchQuotaMock = vi.fn()

    useEmailQuotaMock.mockReturnValue({
      quota: {
        sent: 12,
        limit: 100,
        remaining: 88,
      },
      isLoading: false,
      error: null,
      refetch: refetchQuotaMock,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

        if (url.startsWith('/api/email/recipients')) {
          return new Response(
            JSON.stringify({
              ok: true,
              recipients: [{ id: 'member-1', name: 'Alpha', email: 'alpha@example.com' }],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        if (url === '/api/email/send') {
          return new Response(
            JSON.stringify({
              ok: true,
              sentCount: 1,
              alreadySentCount: 0,
              skippedDueToQuotaCount: 0,
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      }),
    )

    await act(async () => {
      root.render(<EmailClient resendDailyLimit={5} />)
    })

    const subjectInput = container.querySelector('#email-subject')
    const bodyInput = container.querySelector('textarea[aria-label="Email body editor"]')
    const sendButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === 'Send Email',
    )

    expect(subjectInput).toBeInstanceOf(HTMLInputElement)
    expect(bodyInput).toBeInstanceOf(HTMLTextAreaElement)
    expect(sendButton).toBeInstanceOf(HTMLButtonElement)

    await selectMemberTypeFilter(container, 'active')
    await setInputValue(subjectInput as HTMLInputElement, 'Hello members')
    await setInputValue(bodyInput as HTMLTextAreaElement, '<p>Hello team</p>')
    await clickElement(sendButton as HTMLButtonElement)
    await flushAsyncWork()

    expect(refetchQuotaMock).toHaveBeenCalledTimes(1)
  })
})
