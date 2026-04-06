// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createPtAssignmentMock,
  onOpenChangeMock,
  toastMock,
  updatePtAssignmentMock,
} = vi.hoisted(() => ({
  createPtAssignmentMock: vi.fn(),
  onOpenChangeMock: vi.fn(),
  toastMock: vi.fn(),
  updatePtAssignmentMock: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/components/searchable-select', () => ({
  SearchableSelect: ({
    value,
    onValueChange,
    options,
    placeholder,
    disabled,
  }: {
    value: string | null
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
    disabled?: boolean
  }) => (
    <select
      aria-label="Trainer"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">{placeholder ?? 'Select an option'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
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

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    createPtAssignment: createPtAssignmentMock,
    updatePtAssignment: updatePtAssignmentMock,
  }
})

import { PtAssignmentDialog } from '@/components/pt-assignment-dialog'
import type { TrainerClient } from '@/lib/pt-scheduling'
import type { Profile } from '@/types'

function createTrainer(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
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

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? '11111111-1111-1111-1111-111111111111',
    memberId: overrides.memberId ?? '22222222-2222-2222-2222-222222222222',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 14000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? 1,
    scheduledDays: overrides.scheduledDays ?? ['Monday'],
    sessionTime: overrides.sessionTime ?? '07:00',
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2026-04-03T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-03T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    trainerTitles: overrides.trainerTitles ?? ['Trainer'],
    memberName: overrides.memberName ?? 'Client One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
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

describe('PtAssignmentDialog', () => {
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

  it('blocks over-selection with a toast and shows inline error after deselection', async () => {
    await act(async () => {
      root.render(
        <PtAssignmentDialog
          open
          onOpenChange={onOpenChangeMock}
          mode="edit"
          memberId="22222222-2222-2222-2222-222222222222"
          assignment={createAssignment({
            sessionsPerWeek: 3,
            scheduledDays: ['Monday', 'Tuesday', 'Wednesday'],
          })}
          trainers={[createTrainer()]}
        />,
      )
    })

    expect(container.textContent?.match(/Select exactly 3 days\./g)).toHaveLength(1)

    await clickButton(container, 'Thursday')

    expect(container.textContent?.match(/Select exactly 3 days\./g)).toHaveLength(1)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Too many days selected',
      description: 'Select exactly 3 days.',
      variant: 'destructive',
    })

    await clickButton(container, 'Tuesday')

    expect(container.querySelector('.text-destructive')?.textContent).toBe('Select exactly 3 days.')
    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('blocks over-selection with a toast and renders only one scheduled-days message', async () => {
    await act(async () => {
      root.render(
        <PtAssignmentDialog
          open
          onOpenChange={onOpenChangeMock}
          mode="edit"
          memberId="22222222-2222-2222-2222-222222222222"
          assignment={createAssignment()}
          trainers={[createTrainer()]}
        />,
      )
    })

    expect(container.textContent?.match(/Select exactly 1 day\./g)).toHaveLength(1)

    await clickButton(container, 'Tuesday')

    expect(container.textContent?.match(/Select exactly 1 day\./g)).toHaveLength(1)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Too many days selected',
      description: 'Select exactly 1 day.',
      variant: 'destructive',
    })
  })

  it('submits notes in the assignment payload and omits trainer payout', async () => {
    createPtAssignmentMock.mockResolvedValue(
      createAssignment({
        sessionsPerWeek: 3,
        scheduledDays: ['Monday', 'Wednesday', 'Friday'],
        notes: 'Client has a prior knee injury.',
      }),
    )

    await act(async () => {
      root.render(
        <PtAssignmentDialog
          open
          onOpenChange={onOpenChangeMock}
          mode="create"
          memberId="22222222-2222-2222-2222-222222222222"
          trainers={[createTrainer()]}
        />,
      )
    })

    const trainerSelect = container.querySelector('select[aria-label="Trainer"]')
    const ptFeeInput = container.querySelector('#create-pt-fee')
    const notesInput = container.querySelector('#create-pt-notes')

    if (
      !(trainerSelect instanceof HTMLSelectElement) ||
      !(ptFeeInput instanceof HTMLInputElement) ||
      !(notesInput instanceof HTMLTextAreaElement)
    ) {
      throw new Error('Assignment form inputs not found.')
    }

    await act(async () => {
      setInputValue(trainerSelect, '11111111-1111-1111-1111-111111111111')
      setInputValue(ptFeeInput, '15000')
      setInputValue(notesInput, 'Client has a prior knee injury.')
    })

    await clickButton(container, 'Monday')
    await clickButton(container, 'Wednesday')
    await clickButton(container, 'Friday')
    await clickButton(container, 'Assign Trainer')
    await flushAsyncWork()

    expect(createPtAssignmentMock).toHaveBeenCalledWith({
      trainerId: '11111111-1111-1111-1111-111111111111',
      memberId: '22222222-2222-2222-2222-222222222222',
      ptFee: 15000,
      sessionsPerWeek: 3,
      scheduledDays: ['Monday', 'Wednesday', 'Friday'],
      sessionTime: '07:00',
      notes: 'Client has a prior knee injury.',
    })
    expect(createPtAssignmentMock).toHaveBeenCalledTimes(1)
    expect('trainerPayout' in createPtAssignmentMock.mock.calls[0][0]).toBe(false)
  })
})
