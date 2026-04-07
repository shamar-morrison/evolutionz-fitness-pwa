// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  archiveStaffMock,
  deleteStaffMock,
  deleteStaffPhotoMock,
  invalidateQueriesMock,
  pushMock,
  replaceMock,
  toastMock,
  useStaffProfileMock,
} = vi.hoisted(() => ({
  archiveStaffMock: vi.fn(),
  deleteStaffMock: vi.fn(),
  deleteStaffPhotoMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  toastMock: vi.fn(),
  useStaffProfileMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'staff-1' }),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}))

vi.mock('@/hooks/use-staff', () => ({
  useStaffProfile: useStaffProfileMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/staff-actions', () => ({
  archiveStaff: archiveStaffMock,
  deleteStaff: deleteStaffMock,
  deleteStaffPhoto: deleteStaffPhotoMock,
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: ({ name }: { name: string }) => <div>{name}</div>,
}))

vi.mock('@/components/trainer-clients-section', () => ({
  TrainerClientsSection: () => <div>Trainer Clients Section</div>,
}))

vi.mock('@/components/edit-staff-modal', () => ({
  EditStaffModal: () => null,
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel?: () => void
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'> & { loading?: boolean }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.ComponentProps<'h2'>) => <h2 {...props}>{children}</h2>,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div {...props} />,
}))

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  AlertDescription: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
}))

import StaffDetailPage from '@/app/(app)/staff/[id]/page'
import type { StaffRemoval } from '@/lib/staff'
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
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function createRemoval(overrides: Partial<StaffRemoval> = {}): StaffRemoval {
  return {
    mode: overrides.mode ?? 'archive',
    activeAssignments: overrides.activeAssignments ?? 0,
    history: {
      trainerAssignments: 1,
      ptSessions: 0,
      sessionChanges: 0,
      rescheduleRequestsRequested: 0,
      rescheduleRequestsReviewed: 0,
      sessionUpdateRequestsRequested: 0,
      sessionUpdateRequestsReviewed: 0,
      total: 1,
      ...overrides.history,
    },
  }
}

function getButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

async function clickButton(container: HTMLDivElement, label: string) {
  await act(async () => {
    getButton(container, label).click()
  })
}

describe('StaffDetailPage', () => {
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

  it('keeps the archive button enabled for blocked trainers and shows an informational modal instead of archiving', async () => {
    useStaffProfileMock.mockReturnValue({
      profile: createProfile(),
      removal: createRemoval({
        mode: 'blocked',
        activeAssignments: 1,
      }),
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<StaffDetailPage />)
    })

    const archiveButton = getButton(container, 'Archive Staff')

    expect(archiveButton.disabled).toBe(false)
    expect(container.textContent).not.toContain(
      'Reassign or inactivate them before archiving this staff account.',
    )

    await clickButton(container, 'Archive Staff')

    expect(archiveStaffMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Unable to archive staff account')
    expect(container.textContent).toContain(
      'This trainer still has 1 active PT assignment. Reassign or inactivate them before archiving this staff account.',
    )
  })

  it('uses the normal archive confirmation dialog when the trainer is archive-eligible', async () => {
    useStaffProfileMock.mockReturnValue({
      profile: createProfile(),
      removal: createRemoval({
        mode: 'archive',
        activeAssignments: 0,
      }),
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<StaffDetailPage />)
    })

    await clickButton(container, 'Archive Staff')

    expect(archiveStaffMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Archive staff account?')
    expect(container.textContent).not.toContain('Unable to archive staff account')
  })
})
