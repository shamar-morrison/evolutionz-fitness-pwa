// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createStaffMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  toastMock,
  uploadStaffPhotoMock,
} = vi.hoisted(() => ({
  createStaffMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  onOpenChangeMock: vi.fn(),
  toastMock: vi.fn(),
  uploadStaffPhotoMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/staff-actions', () => ({
  createStaff: createStaffMock,
  uploadStaffPhoto: uploadStaffPhotoMock,
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
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/staff-form-fields', async () => {
  const actual = await vi.importActual<typeof import('@/components/staff-form-fields')>(
    '@/components/staff-form-fields',
  )

  return {
    ...actual,
    createEmptyStaffFormState: () => ({
      ...actual.createEmptyStaffFormState(),
      title: 'Owner',
    }),
  }
})

import { AddStaffModal } from '@/components/add-staff-modal'

function createProfile() {
  return {
    id: 'staff-1',
    name: 'Jordan Trainer',
    email: 'jordan@evolutionzfitness.com',
    role: 'staff' as const,
    title: 'Owner',
    phone: null,
    gender: null,
    remark: null,
    specialties: [],
    photoUrl: null,
    created_at: '2026-04-03T00:00:00.000Z',
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

describe('AddStaffModal', () => {
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
    vi.clearAllMocks()
  })

  it('shows a destructive toast and blocks staff creation when the passwords do not match', async () => {
    await act(async () => {
      root.render(<AddStaffModal open onOpenChange={onOpenChangeMock} />)
    })

    const nameInput = container.querySelector('#staff-name')
    const emailInput = container.querySelector('#staff-email')
    const passwordInput = container.querySelector('#staff-password')
    const confirmPasswordInput = container.querySelector('#staff-confirm-password')
    const form = container.querySelector('form')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Name input not found.')
    }

    if (!(emailInput instanceof HTMLInputElement)) {
      throw new Error('Email input not found.')
    }

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    if (!(confirmPasswordInput instanceof HTMLInputElement)) {
      throw new Error('Confirm password input not found.')
    }

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Add staff form not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jordan Trainer')
      setInputValue(emailInput, 'jordan@evolutionzfitness.com')
      setInputValue(passwordInput, 'password123')
      setInputValue(confirmPasswordInput, 'password124')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Passwords do not match',
      description: 'Re-enter matching passwords before creating this staff account.',
      variant: 'destructive',
    })
    expect(createStaffMock).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it('creates staff with only the original password field when the confirmation matches', async () => {
    createStaffMock.mockResolvedValue(createProfile())

    await act(async () => {
      root.render(<AddStaffModal open onOpenChange={onOpenChangeMock} />)
    })

    const nameInput = container.querySelector('#staff-name')
    const emailInput = container.querySelector('#staff-email')
    const passwordInput = container.querySelector('#staff-password')
    const confirmPasswordInput = container.querySelector('#staff-confirm-password')
    const form = container.querySelector('form')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Name input not found.')
    }

    if (!(emailInput instanceof HTMLInputElement)) {
      throw new Error('Email input not found.')
    }

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    if (!(confirmPasswordInput instanceof HTMLInputElement)) {
      throw new Error('Confirm password input not found.')
    }

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Add staff form not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jordan Trainer')
      setInputValue(emailInput, 'jordan@evolutionzfitness.com')
      setInputValue(passwordInput, 'password123')
      setInputValue(confirmPasswordInput, 'password123')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await flushAsyncWork()

    expect(createStaffMock).toHaveBeenCalledWith({
      name: 'Jordan Trainer',
      email: 'jordan@evolutionzfitness.com',
      password: 'password123',
      title: 'Owner',
    })
    expect(createStaffMock.mock.calls[0]?.[0]).not.toHaveProperty('confirmPassword')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['staff'],
    })
  })
})
