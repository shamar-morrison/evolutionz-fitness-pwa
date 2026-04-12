// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useTrainerPtAssignmentsMock } = vi.hoisted(() => ({
  useTrainerPtAssignmentsMock: vi.fn(),
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useTrainerPtAssignments: useTrainerPtAssignmentsMock,
}))

import { TrainerClientsSection } from '@/components/trainer-clients-section'
import type { TrainerClient } from '@/lib/pt-scheduling'

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  const scheduledDays = overrides.scheduledDays ?? ['Monday']
  const sessionTime = overrides.sessionTime ?? '07:00'
  const trainingPlan = overrides.trainingPlan ?? []

  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
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
    memberName: overrides.memberName ?? 'Member One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
}

describe('TrainerClientsSection', () => {
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

  it('renders the training plan summary for trainer client cards', async () => {
    useTrainerPtAssignmentsMock.mockReturnValue({
      assignments: [
        createAssignment({
          trainingPlan: [
            {
              day: 'Monday',
              trainingTypeName: 'Legs',
              isCustom: false,
            },
            {
              day: 'Friday',
              trainingTypeName: 'Back',
              isCustom: false,
            },
          ],
        }),
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<TrainerClientsSection trainerId="trainer-1" />)
    })

    expect(container.textContent).toContain('Training Plan')
    expect(container.textContent).toContain('Monday → Legs')
    expect(container.textContent).toContain('Friday → Back')
  })
})
