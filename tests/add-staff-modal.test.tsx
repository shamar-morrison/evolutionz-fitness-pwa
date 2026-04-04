// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  addStaffTitlesMock,
  createStaffMock,
  invalidateQueriesMock,
  onOpenChangeMock,
  toastMock,
  uploadStaffPhotoMock,
} = vi.hoisted(() => ({
  addStaffTitlesMock: vi.fn(),
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
  addStaffTitles: addStaffTitlesMock,
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

import { AddStaffModal } from '@/components/add-staff-modal'
import type { Profile } from '@/types'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Jordan Trainer',
    email: overrides.email ?? 'jordan@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Trainer'],
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value',
  )
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Input value setter is unavailable.')
  }

  setValue.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

async function clickButton(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButton(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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

  it('creates staff after progressing through the three steps', async () => {
    createStaffMock.mockResolvedValue({
      ok: true,
      profile: createProfile({
        role: 'admin',
        titles: ['Owner', 'Trainer'],
        specialties: ['HIIT'],
      }),
    })

    await act(async () => {
      root.render(<AddStaffModal open onOpenChange={onOpenChangeMock} />)
    })

    const nameInput = container.querySelector('#staff-name')
    const emailInput = container.querySelector('#staff-email')
    const passwordInput = container.querySelector('#staff-password')

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Name input not found.')
    }

    if (!(emailInput instanceof HTMLInputElement)) {
      throw new Error('Email input not found.')
    }

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error('Password input not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jordan Trainer')
      setInputValue(emailInput, 'jordan@evolutionzfitness.com')
      setInputValue(passwordInput, 'password123')
    })

    await clickButton(container, 'Next')
    await clickButton(container, 'Owner')
    await clickButton(container, 'Trainer')
    await clickButton(container, 'HIIT')
    await clickButton(container, 'Next')
    await clickButton(container, 'Save Staff')

    await flushAsyncWork()

    expect(createStaffMock).toHaveBeenCalledWith({
      name: 'Jordan Trainer',
      email: 'jordan@evolutionzfitness.com',
      password: 'password123',
      titles: ['Owner', 'Trainer'],
      specialties: ['HIIT'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['staff'],
    })
    expect(uploadStaffPhotoMock).not.toHaveBeenCalled()
  })

  it('shows the duplicate-email confirmation flow and merges titles into the existing profile', async () => {
    createStaffMock.mockResolvedValue({
      ok: false,
      code: 'EMAIL_EXISTS',
      existingProfile: {
        id: 'existing-1',
        name: 'Jordan Existing',
        titles: ['Assistant'],
      },
    })
    addStaffTitlesMock.mockResolvedValue(
      createProfile({
        id: 'existing-1',
        name: 'Jordan Existing',
        titles: ['Trainer', 'Assistant'],
        specialties: ['HIIT'],
      }),
    )

    await act(async () => {
      root.render(<AddStaffModal open onOpenChange={onOpenChangeMock} />)
    })

    const nameInput = container.querySelector('#staff-name')
    const emailInput = container.querySelector('#staff-email')
    const passwordInput = container.querySelector('#staff-password')

    if (
      !(nameInput instanceof HTMLInputElement) ||
      !(emailInput instanceof HTMLInputElement) ||
      !(passwordInput instanceof HTMLInputElement)
    ) {
      throw new Error('Step 1 inputs not found.')
    }

    await act(async () => {
      setInputValue(nameInput, 'Jordan Trainer')
      setInputValue(emailInput, 'jordan@evolutionzfitness.com')
      setInputValue(passwordInput, 'password123')
    })

    await clickButton(container, 'Next')
    await clickButton(container, 'Trainer')
    await clickButton(container, 'HIIT')
    await clickButton(container, 'Next')
    await clickButton(container, 'Save Staff')
    await flushAsyncWork()

    expect(container.textContent).toContain('A staff member with this email already exists')
    expect(container.textContent).toContain('Jordan Existing')
    expect(container.textContent).toContain('Assistant')

    await clickButton(container, 'Confirm')
    await flushAsyncWork()

    expect(addStaffTitlesMock).toHaveBeenCalledWith('existing-1', {
      titles: ['Trainer'],
      specialties: ['HIIT'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['staff'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['staff', 'existing-1'],
    })
  })
})
