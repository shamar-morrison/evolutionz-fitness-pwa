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

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
    disabled?: boolean
  }) => {
    const items = Array.isArray(children) ? children : [children]
    const content = items.find(
      (child) =>
        typeof child === 'object' &&
        child &&
        'type' in child &&
        typeof child.type === 'function' &&
        child.type.name === 'SelectContent',
    ) as
      | {
          props?: {
            children?: React.ReactNode
          }
        }
      | undefined
    const trigger = items.find(
      (child) =>
        typeof child === 'object' &&
        child &&
        'type' in child &&
        typeof child.type === 'function' &&
        child.type.name === 'SelectTrigger',
    ) as
      | {
          props?: {
            'aria-label'?: string
          }
        }
      | undefined
    const options = Array.isArray(content?.props?.children)
      ? content.props.children
      : content?.props?.children
        ? [content.props.children]
        : []

    return (
      <select
        aria-label={trigger?.props?.['aria-label'] ?? 'Training type'}
        value={value ?? ''}
        onChange={(event) => onValueChange?.(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) =>
          typeof option === 'object' &&
          option &&
          'type' in option &&
          typeof option.type === 'function' &&
          option.type.name === 'SelectItem' &&
          'props' in option ? (
            <option key={(option.props as { value: string }).value} value={(option.props as { value: string }).value}>
              {(option.props as { children: React.ReactNode }).children}
            </option>
          ) : null,
        )}
      </select>
    )
  },
  SelectContent: ({ children }: React.ComponentProps<'div'>) => <>{children}</>,
  SelectItem: ({ children }: React.ComponentProps<'div'> & { value: string }) => <>{children}</>,
  SelectTrigger: ({ children }: React.ComponentProps<'button'>) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
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
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  const scheduledDays = overrides.scheduledDays ?? ['Monday']
  const sessionTime = overrides.sessionTime ?? '07:00'
  const trainingPlan = overrides.trainingPlan ?? []

  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? '11111111-1111-1111-1111-111111111111',
    memberId: overrides.memberId ?? '22222222-2222-2222-2222-222222222222',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 14000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? 1,
    scheduledSessions:
      overrides.scheduledSessions ??
      scheduledDays.map((day) => {
        const trainingPlanEntry = trainingPlan.find((entry) => entry.day === day)

        return {
          day,
          sessionTime,
          trainingTypeName: trainingPlanEntry?.trainingTypeName ?? null,
          isCustom: trainingPlanEntry?.isCustom ?? false,
        }
      }),
    scheduledDays,
    trainingPlan,
    sessionTime,
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

function getTrainingTypeSelects(container: HTMLDivElement) {
  return Array.from(container.querySelectorAll('select')).slice(2)
}

function getSessionTimeInput(container: HTMLDivElement, day: string) {
  const input = container.querySelector(`input[aria-label="${day} session time"]`)

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${day} session time input not found.`)
  }

  return input
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
        trainingPlan: [],
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
      scheduledSessions: [
        {
          day: 'Monday',
          sessionTime: '07:00',
        },
        {
          day: 'Wednesday',
          sessionTime: '07:00',
        },
        {
          day: 'Friday',
          sessionTime: '07:00',
        },
      ],
      trainingPlan: [],
      notes: 'Client has a prior knee injury.',
    })
    expect(createPtAssignmentMock).toHaveBeenCalledTimes(1)
    expect('trainerPayout' in createPtAssignmentMock.mock.calls[0][0]).toBe(false)
  })

  it('submits independent session times for each selected day', async () => {
    createPtAssignmentMock.mockResolvedValue(
      createAssignment({
        sessionsPerWeek: 3,
        scheduledDays: ['Monday', 'Wednesday', 'Friday'],
        scheduledSessions: [
          {
            day: 'Monday',
            sessionTime: '06:30',
            trainingTypeName: null,
            isCustom: false,
          },
          {
            day: 'Wednesday',
            sessionTime: '07:15',
            trainingTypeName: null,
            isCustom: false,
          },
          {
            day: 'Friday',
            sessionTime: '08:45',
            trainingTypeName: null,
            isCustom: false,
          },
        ],
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

    if (!(trainerSelect instanceof HTMLSelectElement) || !(ptFeeInput instanceof HTMLInputElement)) {
      throw new Error('Assignment form inputs not found.')
    }

    await act(async () => {
      setInputValue(trainerSelect, '11111111-1111-1111-1111-111111111111')
      setInputValue(ptFeeInput, '15000')
    })

    await clickButton(container, 'Monday')
    await clickButton(container, 'Wednesday')
    await clickButton(container, 'Friday')

    await act(async () => {
      setInputValue(getSessionTimeInput(container, 'Monday'), '06:30')
      setInputValue(getSessionTimeInput(container, 'Wednesday'), '07:15')
      setInputValue(getSessionTimeInput(container, 'Friday'), '08:45')
    })

    await clickButton(container, 'Assign Trainer')
    await flushAsyncWork()

    expect(createPtAssignmentMock).toHaveBeenCalledWith({
      trainerId: '11111111-1111-1111-1111-111111111111',
      memberId: '22222222-2222-2222-2222-222222222222',
      ptFee: 15000,
      sessionsPerWeek: 3,
      scheduledSessions: [
        {
          day: 'Monday',
          sessionTime: '06:30',
        },
        {
          day: 'Wednesday',
          sessionTime: '07:15',
        },
        {
          day: 'Friday',
          sessionTime: '08:45',
        },
      ],
      trainingPlan: [],
      notes: null,
    })
  })

  it('renders sessions-per-week options from 1 through 7', async () => {
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

    const frequencySelect = container.querySelector('select[aria-label="Sessions per week"]')

    if (!(frequencySelect instanceof HTMLSelectElement)) {
      throw new Error('Sessions per week select not found.')
    }

    expect(Array.from(frequencySelect.options).map((option) => option.value)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ])
  })

  it('blocks submission when a custom training type is selected but left empty', async () => {
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
    if (!(trainerSelect instanceof HTMLSelectElement) || !(ptFeeInput instanceof HTMLInputElement)) {
      throw new Error('Assignment form inputs not found.')
    }

    await act(async () => {
      setInputValue(trainerSelect, '11111111-1111-1111-1111-111111111111')
      setInputValue(ptFeeInput, '15000')
    })

    await clickButton(container, 'Monday')
    await clickButton(container, 'Wednesday')
    await clickButton(container, 'Friday')

    const mondayTrainingTypeSelect = getTrainingTypeSelects(container)[0]

    if (!(mondayTrainingTypeSelect instanceof HTMLSelectElement)) {
      throw new Error('Monday training type select not found.')
    }

    await act(async () => {
      setInputValue(mondayTrainingTypeSelect, '__custom__')
    })

    await clickButton(container, 'Assign Trainer')
    await flushAsyncWork()

    expect(createPtAssignmentMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Enter a custom training type.')
  })

  it('blocks submission when any selected day is missing a valid time', async () => {
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

    if (!(trainerSelect instanceof HTMLSelectElement) || !(ptFeeInput instanceof HTMLInputElement)) {
      throw new Error('Assignment form inputs not found.')
    }

    await act(async () => {
      setInputValue(trainerSelect, '11111111-1111-1111-1111-111111111111')
      setInputValue(ptFeeInput, '15000')
    })

    await clickButton(container, 'Monday')
    await clickButton(container, 'Wednesday')
    await clickButton(container, 'Friday')

    await act(async () => {
      setInputValue(getSessionTimeInput(container, 'Wednesday'), '')
    })

    await clickButton(container, 'Assign Trainer')
    await flushAsyncWork()

    expect(createPtAssignmentMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Choose a valid session time.')
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Invalid session time',
      description: 'Choose a valid HH:MM time for each selected day.',
      variant: 'destructive',
    })
  })

  it('removes a deselected day from the submitted training plan entries', async () => {
    createPtAssignmentMock.mockResolvedValue(
      createAssignment({
        sessionsPerWeek: 3,
        scheduledDays: ['Monday', 'Wednesday', 'Thursday'],
        trainingPlan: [
          {
            day: 'Monday',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
          {
            day: 'Thursday',
            trainingTypeName: 'Agility',
            isCustom: true,
          },
        ],
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

    if (!(trainerSelect instanceof HTMLSelectElement) || !(ptFeeInput instanceof HTMLInputElement)) {
      throw new Error('Assignment form inputs not found.')
    }

    await act(async () => {
      setInputValue(trainerSelect, '11111111-1111-1111-1111-111111111111')
      setInputValue(ptFeeInput, '15000')
    })

    await clickButton(container, 'Monday')
    await clickButton(container, 'Wednesday')
    await clickButton(container, 'Friday')

    const [mondayTrainingTypeSelect, , fridayTrainingTypeSelect] = getTrainingTypeSelects(container)

    if (
      !(mondayTrainingTypeSelect instanceof HTMLSelectElement) ||
      !(fridayTrainingTypeSelect instanceof HTMLSelectElement)
    ) {
      throw new Error('Training type selects not found.')
    }

    await act(async () => {
      setInputValue(mondayTrainingTypeSelect, 'Legs')
      setInputValue(fridayTrainingTypeSelect, '__custom__')
    })

    const customTrainingTypeInput = container.querySelector('input[placeholder="Enter custom training type"]')

    if (!(customTrainingTypeInput instanceof HTMLInputElement)) {
      throw new Error('Custom training type input not found.')
    }

    await act(async () => {
      setInputValue(customTrainingTypeInput, 'Agility')
    })

    await clickButton(container, 'Friday')
    await clickButton(container, 'Thursday')

    const [, , thursdayTrainingTypeSelect] = getTrainingTypeSelects(container)

    if (!(thursdayTrainingTypeSelect instanceof HTMLSelectElement)) {
      throw new Error('Thursday training type select not found.')
    }

    await act(async () => {
      setInputValue(thursdayTrainingTypeSelect, '__custom__')
    })

    const replacementCustomTrainingTypeInput = container.querySelector(
      'input[placeholder="Enter custom training type"]',
    )

    if (!(replacementCustomTrainingTypeInput instanceof HTMLInputElement)) {
      throw new Error('Replacement custom training type input not found.')
    }

    await act(async () => {
      setInputValue(replacementCustomTrainingTypeInput, 'Agility')
    })

    const [refreshedMondayTrainingTypeSelect] = getTrainingTypeSelects(container)

    if (!(refreshedMondayTrainingTypeSelect instanceof HTMLSelectElement)) {
      throw new Error('Refreshed Monday training type select not found.')
    }

    await act(async () => {
      setInputValue(refreshedMondayTrainingTypeSelect, 'Legs')
      setInputValue(getSessionTimeInput(container, 'Monday'), '06:30')
    })

    await clickButton(container, 'Assign Trainer')
    await flushAsyncWork()

    expect(createPtAssignmentMock).toHaveBeenCalledWith({
      trainerId: '11111111-1111-1111-1111-111111111111',
      memberId: '22222222-2222-2222-2222-222222222222',
      ptFee: 15000,
      sessionsPerWeek: 3,
      scheduledSessions: [
        {
          day: 'Monday',
          sessionTime: '06:30',
        },
        {
          day: 'Wednesday',
          sessionTime: '07:00',
        },
        {
          day: 'Thursday',
          sessionTime: '07:00',
        },
      ],
      trainingPlan: [
        {
          day: 'Thursday',
          trainingTypeName: 'Agility',
        },
      ],
      notes: null,
    })
  })

  it('prefills existing custom training plan entries in edit mode', async () => {
    await act(async () => {
      root.render(
        <PtAssignmentDialog
          open
          onOpenChange={onOpenChangeMock}
          mode="edit"
          memberId="22222222-2222-2222-2222-222222222222"
          assignment={createAssignment({
            trainingPlan: [
              {
                day: 'Monday',
                trainingTypeName: 'Plyometrics',
                isCustom: true,
              },
            ],
          })}
          trainers={[createTrainer()]}
        />,
      )
    })

    const customTrainingTypeInput = container.querySelector('input[placeholder="Enter custom training type"]')

    if (!(customTrainingTypeInput instanceof HTMLInputElement)) {
      throw new Error('Custom training type input not found.')
    }

    expect(customTrainingTypeInput.value).toBe('Plyometrics')
    expect(getTrainingTypeSelects(container)).toHaveLength(0)
  })
})
