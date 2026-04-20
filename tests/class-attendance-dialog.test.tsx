// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClassAttendanceRow,
  ClassRegistrationListItem,
  ClassSessionListItem,
} from '@/lib/classes'

const {
  createClassAttendanceMock,
  invalidateQueriesMock,
  setQueryDataMock,
  toastMock,
  updateClassAttendanceMock,
  useClassAttendanceMock,
} = vi.hoisted(() => ({
  createClassAttendanceMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  setQueryDataMock: vi.fn(),
  toastMock: vi.fn(),
  updateClassAttendanceMock: vi.fn(),
  useClassAttendanceMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  }),
}))

vi.mock('@/hooks/use-classes', () => ({
  useClassAttendance: useClassAttendanceMock,
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
    open?: boolean
  }) => (open ?? true ? <div>{children}</div> : null),
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
  } & React.ComponentProps<'button'>) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}))

vi.mock('@/lib/classes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/classes')>('@/lib/classes')

  return {
    ...actual,
    createClassAttendance: createClassAttendanceMock,
    updateClassAttendance: updateClassAttendanceMock,
  }
})

import { ClassAttendanceDialog } from '@/components/class-attendance-dialog'

function buildSession(overrides: Partial<ClassSessionListItem> = {}): ClassSessionListItem {
  return {
    id: overrides.id ?? 'session-1',
    class_id: overrides.class_id ?? 'class-1',
    scheduled_at: overrides.scheduled_at ?? '2026-04-14T09:00:00-05:00',
    period_start: overrides.period_start ?? '2026-04-01',
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
    marked_count: overrides.marked_count ?? 1,
    total_count: overrides.total_count ?? 2,
  }
}

function buildRegistration(
  overrides: Partial<ClassRegistrationListItem> = {},
): ClassRegistrationListItem {
  return {
    id: overrides.id ?? 'registration-1',
    class_id: overrides.class_id ?? 'class-1',
    member_id: overrides.member_id ?? 'member-1',
    guest_profile_id: overrides.guest_profile_id ?? null,
    month_start: overrides.month_start ?? '2026-04-01',
    status: overrides.status ?? 'approved',
    fee_type: overrides.fee_type ?? 'monthly',
    amount_paid: overrides.amount_paid ?? 15500,
    payment_recorded_at: overrides.payment_recorded_at ?? '2026-04-08T12:00:00.000Z',
    notes: overrides.notes ?? null,
    receipt_number: overrides.receipt_number ?? null,
    receipt_sent_at: overrides.receipt_sent_at ?? null,
    reviewed_by: overrides.reviewed_by ?? 'user-1',
    reviewed_at: overrides.reviewed_at ?? '2026-04-08T12:00:00.000Z',
    review_note: overrides.review_note ?? null,
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
    registrant_name: overrides.registrant_name ?? 'Client One',
    registrant_type: overrides.registrant_type ?? 'member',
    registrant_email: overrides.registrant_email ?? 'client.one@example.com',
  }
}

function buildAttendance(overrides: Partial<ClassAttendanceRow> = {}): ClassAttendanceRow {
  return {
    id: overrides.id ?? 'attendance-1',
    session_id: overrides.session_id ?? 'session-1',
    member_id: overrides.member_id ?? 'member-1',
    guest_profile_id: overrides.guest_profile_id ?? null,
    marked_by: overrides.marked_by ?? 'user-1',
    marked_at: overrides.marked_at ?? '2026-04-08T12:00:00.000Z',
    created_at: overrides.created_at ?? '2026-04-08T12:00:00.000Z',
    registrant_name: overrides.registrant_name ?? 'Client One',
    registrant_type: overrides.registrant_type ?? 'member',
  }
}

function getCheckbox(container: HTMLDivElement, label: string) {
  const checkbox = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )

  if (!(checkbox instanceof HTMLButtonElement)) {
    throw new Error(`${label} checkbox not found.`)
  }

  return checkbox
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('ClassAttendanceDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useClassAttendanceMock.mockReturnValue({
      attendance: [
        buildAttendance({
          id: 'attendance-1',
          member_id: 'member-1',
          registrant_name: 'Client One',
        }),
      ],
      isLoading: false,
      error: null,
    })
    createClassAttendanceMock.mockResolvedValue(
      buildAttendance({
        id: 'attendance-2',
        member_id: 'member-2',
        registrant_name: 'Client Two',
      }),
    )
    updateClassAttendanceMock.mockResolvedValue(
      buildAttendance({
        id: 'attendance-1',
        member_id: 'member-1',
        registrant_name: 'Client One',
        marked_at: null,
        marked_by: null,
      }),
    )
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

  it('shows row-scoped loading feedback while attendance is toggled', async () => {
    const deferred = createDeferred<ClassAttendanceRow>()

    updateClassAttendanceMock.mockImplementationOnce(() => deferred.promise)

    await act(async () => {
      root.render(
        <ClassAttendanceDialog
          classId="class-1"
          session={buildSession()}
          approvedRegistrations={[
            buildRegistration({
              id: 'registration-1',
              member_id: 'member-1',
              registrant_name: 'Client One',
            }),
            buildRegistration({
              id: 'registration-2',
              member_id: 'member-2',
              registrant_name: 'Client Two',
            }),
          ]}
          open={true}
          readOnly={false}
          profileId="user-1"
          onOpenChange={() => {}}
        />,
      )
    })

    const pendingCheckbox = getCheckbox(container, 'Mark attendance for Client One')
    const idleCheckbox = getCheckbox(container, 'Mark attendance for Client Two')

    await act(async () => {
      pendingCheckbox.click()
    })

    expect(pendingCheckbox.disabled).toBe(true)
    expect(idleCheckbox.disabled).toBe(false)
    expect(container.querySelectorAll('[aria-label="Loading"]')).toHaveLength(1)

    await act(async () => {
      deferred.resolve(
        buildAttendance({
          id: 'attendance-1',
          member_id: 'member-1',
          registrant_name: 'Client One',
          marked_at: null,
          marked_by: null,
        }),
      )
      await deferred.promise
    })

    expect(getCheckbox(container, 'Mark attendance for Client One').disabled).toBe(false)
  })
})
