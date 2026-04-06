// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtSession, TrainerClient } from '@/lib/pt-scheduling'

const {
  invalidateQueriesMock,
  useQueryMock,
  useTrainerPtAssignmentsMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  useQueryMock: vi.fn(),
  useTrainerPtAssignmentsMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    profile: {
      id: 'trainer-1',
      name: 'Jordan Trainer',
      role: 'staff',
      titles: ['Trainer'],
    },
  }),
}))

vi.mock('@/components/staff-only', () => ({
  StaffOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: ({ name }: { name: string }) => <div>{name}</div>,
}))

vi.mock('@/components/pagination-controls', () => ({
  PaginationControls: () => null,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: React.ComponentProps<'button'>) => <button type="button">{children}</button>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  TabsList: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  TabsTrigger: ({ children }: React.ComponentProps<'button'>) => <button type="button">{children}</button>,
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useTrainerPtAssignments: useTrainerPtAssignmentsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

import TrainerClientsPage from '@/app/(app)/trainer/clients/page'
import TrainerSchedulePage from '@/app/(app)/trainer/schedule/page'

function createSession(overrides: Partial<PtSession> = {}): PtSession {
  return {
    id: overrides.id ?? 'session-1',
    assignmentId: overrides.assignmentId ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    scheduledAt: overrides.scheduledAt ?? '2099-04-12T10:00:00.000Z',
    status: overrides.status ?? 'scheduled',
    isRecurring: overrides.isRecurring ?? false,
    notes: overrides.notes ?? null,
    trainingTypeName: overrides.trainingTypeName ?? 'Strength',
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    memberName: overrides.memberName ?? 'Client One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
}

function createAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 15000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? 2,
    scheduledDays: overrides.scheduledDays ?? ['Monday', 'Wednesday'],
    sessionTime: overrides.sessionTime ?? '07:00',
    notes: overrides.notes ?? null,
    trainingPlan:
      overrides.trainingPlan ??
      [
        { day: 'Monday', trainingTypeName: 'Legs', isCustom: false },
        { day: 'Wednesday', trainingTypeName: 'Back', isCustom: false },
      ],
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    trainerTitles: overrides.trainerTitles ?? ['Trainer'],
    memberName: overrides.memberName ?? 'Client One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
}

describe('Trainer pages', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          'tab' in part &&
          part.tab === 'upcoming',
      )
        ? [createSession()]
        : [],
      isLoading: false,
      error: null,
    }))
    useTrainerPtAssignmentsMock.mockReturnValue({
      assignments: [createAssignment({ notes: null })],
      isLoading: false,
      error: null,
    })
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

  it('renders upcoming trainer sessions with mark and reschedule actions', async () => {
    await act(async () => {
      root.render(<TrainerSchedulePage />)
    })

    expect(container.textContent).toContain('My Schedule')
    expect(container.textContent).toContain('Client One')
    expect(container.textContent).toContain('Strength')
    expect(container.textContent).toContain('Mark Session')
    expect(container.textContent).toContain('Request Reschedule')
  })

  it('renders trainer client cards with the training plan and notes fallback', async () => {
    await act(async () => {
      root.render(<TrainerClientsPage />)
    })

    expect(container.textContent).toContain('My Clients')
    expect(container.textContent).toContain('Monday → Legs')
    expect(container.textContent).toContain('Wednesday → Back')
    expect(container.textContent).toContain('No notes')
    expect(container.querySelector('a[href="/members/member-1"]')?.textContent).toBe('View Details')
  })
})
