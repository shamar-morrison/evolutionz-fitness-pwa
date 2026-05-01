import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  createClientMock,
  getSupabaseAdminClientMock,
  readStaffProfileMock,
  readTrainerClientByIdMock,
  readTrainerClientRowByIdMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  readTrainerClientByIdMock: vi.fn(),
  readTrainerClientRowByIdMock: vi.fn(),
  resolvePermissionsForProfileMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
  }
})

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

vi.mock('@/lib/server-permissions', () => ({
  resolvePermissionsForProfile: resolvePermissionsForProfileMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/pt-scheduling-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling-server')>(
    '@/lib/pt-scheduling-server',
  )

  return {
    ...actual,
    readTrainerClientById: readTrainerClientByIdMock,
    readTrainerClientRowById: readTrainerClientRowByIdMock,
  }
})

import { GET, PUT } from '@/app/api/pt/assignments/[id]/schedule/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'trainer-1',
    name: 'Jordan Trainer',
    role: 'staff',
    titles: ['Trainer'],
    isSuspended: false,
    ...overrides,
  }
}

function createPermissions(options: { allowed?: boolean; role?: 'admin' | 'staff' } = {}) {
  return {
    role: options.role ?? 'staff',
    can: (permission: string) =>
      permission === 'pt.manageOwnSchedule' && (options.allowed ?? true),
  }
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  const scheduledDays = (overrides.scheduledDays as string[] | undefined) ?? ['Monday', 'Wednesday']
  const trainingPlan =
    (overrides.trainingPlan as Array<{ day: string; trainingTypeName: string; isCustom: boolean }> | undefined) ??
    [
      {
        day: 'Monday',
        trainingTypeName: 'Legs',
        isCustom: false,
      },
      {
        day: 'Wednesday',
        trainingTypeName: 'Back',
        isCustom: false,
      },
    ]
  const scheduledSessions =
    (overrides.scheduledSessions as
      | Array<{
          day: string
          sessionTime: string
          trainingTypeName: string | null
          isCustom: boolean
        }>
      | undefined) ??
    scheduledDays.map((day) => {
      const trainingPlanEntry = trainingPlan.find((entry) => entry.day === day)

      return {
        day,
        sessionTime: overrides.sessionTime ?? '07:00',
        trainingTypeName: trainingPlanEntry?.trainingTypeName ?? null,
        isCustom: trainingPlanEntry?.isCustom ?? false,
      }
    })

  return {
    id: 'assignment-1',
    trainerId: 'trainer-1',
    memberId: 'member-1',
    status: 'active',
    ptFee: 15000,
    sessionsPerWeek: 2,
    scheduledSessions,
    scheduledDays,
    sessionTime: '07:00',
    notes: null,
    trainingPlan,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    trainerName: 'Jordan Trainer',
    trainerTitles: ['Trainer'],
    memberName: 'Client One',
    memberPhotoUrl: null,
    ...overrides,
  }
}

function buildAssignmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    trainer_id: 'trainer-1',
    member_id: 'member-1',
    status: 'active',
    pt_fee: 15000,
    sessions_per_week: 2,
    scheduled_days: ['Monday', 'Wednesday'],
    session_time: '07:00:00',
    notes: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createPutClient() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  return {
    rpcCalls,
    client: {
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args })

        return Promise.resolve({
          data: 'assignment-1',
          error: null,
        } satisfies QueryResult<string>)
      },
      from(table: string) {
        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('PT assignment schedule route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    readStaffProfileMock.mockReset()
    readTrainerClientByIdMock.mockReset()
    readTrainerClientRowByIdMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('allows the assigned trainer to load the assignment schedule', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(buildAssignment())
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await GET(new Request('http://localhost/api/pt/assignments/assignment-1/schedule'), {
      params: Promise.resolve({ id: 'assignment-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      assignment: buildAssignment(),
    })
  })

  it('allows admins to load another trainer assignment schedule', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        id: 'owner-1',
        role: 'admin',
        titles: ['Owner'],
      }),
    )
    resolvePermissionsForProfileMock.mockReturnValue(
      createPermissions({
        role: 'admin',
      }),
    )
    readTrainerClientRowByIdMock.mockResolvedValue(
      buildAssignmentRow({
        trainer_id: 'trainer-2',
      }),
    )
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        trainerId: 'trainer-2',
      }),
    )
    mockAuthenticatedUser({ id: 'owner-1' })

    const response = await GET(new Request('http://localhost/api/pt/assignments/assignment-1/schedule'), {
      params: Promise.resolve({ id: 'assignment-1' }),
    })

    expect(response.status).toBe(200)
  })

  it('forbids a trainer from loading another trainer assignment schedule', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(
      buildAssignmentRow({
        trainer_id: 'trainer-2',
      }),
    )
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await GET(new Request('http://localhost/api/pt/assignments/assignment-1/schedule'), {
      params: Promise.resolve({ id: 'assignment-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({
      ok: false,
      error: 'Forbidden',
    })
    expect(readTrainerClientByIdMock).not.toHaveBeenCalled()
  })

  it('returns 401 when the schedule route is unauthenticated', async () => {
    mockUnauthorized()

    const response = await GET(new Request('http://localhost/api/pt/assignments/assignment-1/schedule'), {
      params: Promise.resolve({ id: 'assignment-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('updates the assignment schedule and replaces training plan days', async () => {
    const { client, rpcCalls } = createPutClient()

    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        scheduledSessions: [
          {
            day: 'Monday',
            sessionTime: '06:30',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
          {
            day: 'Wednesday',
            sessionTime: '07:00',
            trainingTypeName: null,
            isCustom: false,
          },
        ],
        trainingPlan: [
          {
            day: 'Monday',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
        ],
        sessionTime: '06:30',
      }),
    )
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await PUT(
      new Request('http://localhost/api/pt/assignments/assignment-1/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionsPerWeek: 2,
          scheduledSessions: [
            {
              day: 'Monday',
              sessionTime: '06:30',
            },
            {
              day: 'Wednesday',
              sessionTime: '07:00',
            },
          ],
          trainingPlan: [
            {
              day: 'Monday',
              trainingTypeName: 'Legs',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(rpcCalls).toEqual([
      {
        fn: 'replace_pt_assignment_schedule',
        args: {
          p_assignment_id: 'assignment-1',
          p_sessions_per_week: 2,
          p_scheduled_days: ['Monday', 'Wednesday'],
          p_schedule: [
            {
              day_of_week: 'Monday',
              session_time: '06:30:00',
              training_type_name: 'Legs',
            },
            {
              day_of_week: 'Wednesday',
              session_time: '07:00:00',
              training_type_name: null,
            },
          ],
        },
      },
    ])
    expect(payload.assignment).toEqual(
      buildAssignment({
        scheduledSessions: [
          {
            day: 'Monday',
            sessionTime: '06:30',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
          {
            day: 'Wednesday',
            sessionTime: '07:00',
            trainingTypeName: null,
            isCustom: false,
          },
        ],
        trainingPlan: [
          {
            day: 'Monday',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
        ],
        sessionTime: '06:30',
      }),
    )
  })

  it('forbids a trainer from updating another trainer assignment schedule', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(
      buildAssignmentRow({
        trainer_id: 'trainer-2',
      }),
    )
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await PUT(
      new Request('http://localhost/api/pt/assignments/assignment-1/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionsPerWeek: 2,
          scheduledSessions: [
            {
              day: 'Monday',
              sessionTime: '07:00',
            },
            {
              day: 'Wednesday',
              sessionTime: '07:00',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )

    expect(response.status).toBe(403)
  })

  it('rejects an empty assignment schedule payload', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await PUT(
      new Request('http://localhost/api/pt/assignments/assignment-1/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionsPerWeek: 1,
          scheduledSessions: [],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('At least one scheduled day is required.')
  })

  it('rejects invalid session times', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await PUT(
      new Request('http://localhost/api/pt/assignments/assignment-1/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionsPerWeek: 1,
          scheduledSessions: [
            {
              day: 'Monday',
              sessionTime: '25:00',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Session time for Monday must use HH:MM format.')
  })

  it('rejects training plan days outside the selected schedule', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await PUT(
      new Request('http://localhost/api/pt/assignments/assignment-1/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionsPerWeek: 1,
          scheduledSessions: [
            {
              day: 'Monday',
              sessionTime: '07:00',
            },
          ],
          trainingPlan: [
            {
              day: 'Tuesday',
              trainingTypeName: 'Legs',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Training plan day Tuesday must also be selected in scheduled days.')
  })
})
