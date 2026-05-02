import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetServerAuthMocks } from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  hasStaffTitleMock,
  readStaffProfileMock,
  readTrainerClientByIdMock,
  readTrainerClientRowByIdMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  hasStaffTitleMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  readTrainerClientByIdMock: vi.fn(),
  readTrainerClientRowByIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/staff', () => ({
  hasStaffTitle: hasStaffTitleMock,
  readStaffProfile: readStaffProfileMock,
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

import { POST } from '@/app/api/pt/assignments/route'
import { GET, PATCH } from '@/app/api/pt/assignments/[id]/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  const scheduledDays = (overrides.scheduledDays as string[] | undefined) ?? ['Monday', 'Wednesday', 'Friday']
  const sessionTime = (overrides.sessionTime as string | undefined) ?? '07:00'
  const trainingPlan =
    (overrides.trainingPlan as Array<{ day: string; trainingTypeName: string; isCustom: boolean }> | undefined) ??
    [
      {
        day: 'Monday',
        trainingTypeName: 'Legs',
        isCustom: false,
      },
    ]

  return {
    id: 'assignment-1',
    trainerId: '11111111-1111-1111-1111-111111111111',
    memberId: '22222222-2222-2222-2222-222222222222',
    status: 'active',
    ptFee: 15000,
    sessionsPerWeek: 3,
    scheduledSessions: scheduledDays.map((day) => {
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
    notes: 'Client has a prior knee injury.',
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
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
    trainer_id: '11111111-1111-1111-1111-111111111111',
    member_id: '22222222-2222-2222-2222-222222222222',
    status: 'active',
    pt_fee: 15000,
    sessions_per_week: 3,
    scheduled_days: ['Monday', 'Wednesday', 'Friday'],
    session_time: '07:00:00',
    notes: 'Existing notes',
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
    ...overrides,
  }
}

function createPostClient(options: {
  trainingPlanInsertError?: string
  rollbackError?: string
} = {}) {
  const trainerClientInserts: Array<Record<string, unknown>> = []
  const trainingPlanInserts: Array<Array<Record<string, unknown>>> = []
  const assignmentDeletes: string[] = []

  return {
    trainerClientInserts,
    trainingPlanInserts,
    assignmentDeletes,
    client: {
      from(table: string) {
        if (table === 'trainer_clients') {
          return {
            select(columns: string) {
              if (columns === 'id') {
                return {
                  eq(column: string, value: string) {
                    if (column !== 'member_id') {
                      throw new Error(`Unexpected trainer_clients select eq column: ${column}`)
                    }

                    expect(value).toBe('22222222-2222-2222-2222-222222222222')

                    return {
                      eq(nextColumn: string, nextValue: string) {
                        expect(nextColumn).toBe('status')
                        expect(nextValue).toBe('active')

                        return {
                          limit(limitValue: number) {
                            expect(limitValue).toBe(1)

                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: null,
                                  error: null,
                                } satisfies QueryResult<{ id: string }>)
                              },
                            }
                          },
                        }
                      },
                    }
                  },
                }
              }

              if (columns === 'id, status') {
                return {
                  eq(column: string, value: string) {
                    expect(column).toBe('trainer_id')
                    expect(value).toBe('11111111-1111-1111-1111-111111111111')

                    return {
                      eq(nextColumn: string, nextValue: string) {
                        expect(nextColumn).toBe('member_id')
                        expect(nextValue).toBe('22222222-2222-2222-2222-222222222222')

                        return {
                          limit(limitValue: number) {
                            expect(limitValue).toBe(1)

                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: null,
                                  error: null,
                                } satisfies QueryResult<{ id: string; status: string }>)
                              },
                            }
                          },
                        }
                      },
                    }
                  },
                }
              }

              throw new Error(`Unexpected trainer_clients select columns: ${columns}`)
            },
            insert(values: Record<string, unknown>) {
              trainerClientInserts.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe('id')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: { id: 'assignment-1' },
                        error: null,
                      } satisfies QueryResult<{ id: string }>)
                    },
                  }
                },
              }
            },
            delete() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  assignmentDeletes.push(value)

                  return Promise.resolve({
                    data: null,
                    error: options.rollbackError ? { message: options.rollbackError } : null,
                  } satisfies QueryResult<null>)
                },
              }
            },
          }
        }

        if (table === 'training_plan_days') {
          return {
            insert(values: Array<Record<string, unknown>>) {
              trainingPlanInserts.push(values)

              return Promise.resolve({
                data: null,
                error: options.trainingPlanInsertError
                  ? { message: options.trainingPlanInsertError }
                  : null,
              } satisfies QueryResult<null>)
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

function createPatchClient(options: {
  rpcErrors?: Partial<Record<string, string>>
} = {}) {
  const assignmentUpdates: Array<Record<string, unknown>> = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  return {
    assignmentUpdates,
    rpcCalls,
    client: {
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args })
        const rpcError = options.rpcErrors?.[fn]

        return Promise.resolve({
          data: rpcError ? null : 'assignment-1',
          error: rpcError ? { message: rpcError } : null,
        } satisfies QueryResult<string>)
      },
      from(table: string) {
        if (table === 'trainer_clients') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('member_id')
                  expect(value).toBe('22222222-2222-2222-2222-222222222222')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('active')

                      return {
                        neq(neqColumn: string, neqValue: string) {
                          expect(neqColumn).toBe('id')
                          expect(neqValue).toBe('assignment-1')

                          return {
                            limit(limitValue: number) {
                              expect(limitValue).toBe(1)

                              return {
                                maybeSingle() {
                                  return Promise.resolve({
                                    data: null,
                                    error: null,
                                  } satisfies QueryResult<{ id: string }>)
                                },
                              }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
            update(values: Record<string, unknown>) {
              assignmentUpdates.push(values)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('assignment-1')

                  return {
                    select(columns: string) {
                      expect(columns).toBe('id')

                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { id: 'assignment-1' },
                            error: null,
                          } satisfies QueryResult<{ id: string }>)
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('PT assignment training plan routes', () => {
  afterEach(() => {
    vi.clearAllMocks()
    resetServerAuthMocks()
  })

  it('POST inserts training plan days after creating the assignment', async () => {
    const { client, trainerClientInserts, trainingPlanInserts } = createPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      titles: ['Trainer'],
    })
    hasStaffTitleMock.mockReturnValue(true)
    readTrainerClientByIdMock.mockResolvedValue(buildAssignment())

    const response = await POST(
      new Request('http://localhost/api/pt/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainerId: '11111111-1111-1111-1111-111111111111',
          memberId: '22222222-2222-2222-2222-222222222222',
          ptFee: 15000,
          sessionsPerWeek: 3,
          scheduledSessions: [
            { day: 'Monday', sessionTime: '07:00' },
            { day: 'Wednesday', sessionTime: '07:00' },
            { day: 'Friday', sessionTime: '07:00' },
          ],
          trainingPlan: [
            {
              day: 'Monday',
              trainingTypeName: 'Legs',
            },
            {
              day: 'Friday',
              trainingTypeName: 'Agility',
            },
          ],
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.ok).toBe(true)
    expect(trainerClientInserts[0]).toEqual({
      trainer_id: '11111111-1111-1111-1111-111111111111',
      member_id: '22222222-2222-2222-2222-222222222222',
      pt_fee: 15000,
      sessions_per_week: 3,
      scheduled_days: ['Monday', 'Wednesday', 'Friday'],
      session_time: '07:00:00',
      notes: null,
    })
    expect(trainingPlanInserts[0]).toEqual([
      {
        assignment_id: 'assignment-1',
        day_of_week: 'Monday',
        session_time: '07:00:00',
        training_type_name: 'Legs',
      },
      {
        assignment_id: 'assignment-1',
        day_of_week: 'Wednesday',
        session_time: '07:00:00',
        training_type_name: null,
      },
      {
        assignment_id: 'assignment-1',
        day_of_week: 'Friday',
        session_time: '07:00:00',
        training_type_name: 'Agility',
      },
    ])
  })

  it('POST rejects training plan days that are not part of the scheduled days', async () => {
    const response = await POST(
      new Request('http://localhost/api/pt/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainerId: '11111111-1111-1111-1111-111111111111',
          memberId: '22222222-2222-2222-2222-222222222222',
          ptFee: 15000,
          sessionsPerWeek: 3,
          scheduledSessions: [
            { day: 'Monday', sessionTime: '07:00' },
            { day: 'Wednesday', sessionTime: '07:00' },
            { day: 'Friday', sessionTime: '07:00' },
          ],
          trainingPlan: [
            {
              day: 'Tuesday',
              trainingTypeName: 'Legs',
            },
          ],
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Training plan day Tuesday must also be selected in scheduled days.')
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('POST rolls back the assignment when training plan insert fails', async () => {
    const { client, assignmentDeletes } = createPostClient({
      trainingPlanInsertError: 'insert failed',
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      titles: ['Trainer'],
    })
    hasStaffTitleMock.mockReturnValue(true)

    const response = await POST(
      new Request('http://localhost/api/pt/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainerId: '11111111-1111-1111-1111-111111111111',
          memberId: '22222222-2222-2222-2222-222222222222',
          ptFee: 15000,
          sessionsPerWeek: 3,
          scheduledSessions: [
            { day: 'Monday', sessionTime: '07:00' },
            { day: 'Wednesday', sessionTime: '07:00' },
            { day: 'Friday', sessionTime: '07:00' },
          ],
          trainingPlan: [
            {
              day: 'Monday',
              trainingTypeName: 'Legs',
            },
          ],
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('Failed to create the PT assignment training plan: insert failed')
    expect(assignmentDeletes).toEqual(['assignment-1'])
  })

  it('GET returns an assignment with the training plan', async () => {
    getSupabaseAdminClientMock.mockReturnValue({})
    readTrainerClientByIdMock.mockResolvedValue(buildAssignment())

    const response = await GET(new Request('http://localhost/api/pt/assignments/assignment-1'), {
      params: Promise.resolve({ id: 'assignment-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      assignment: buildAssignment(),
    })
  })

  it('PATCH replaces the training plan rows when trainingPlan is provided', async () => {
    const { client, assignmentUpdates, rpcCalls } = createPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        trainingPlan: [
          {
            day: 'Monday',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
          {
            day: 'Wednesday',
            trainingTypeName: 'Chest',
            isCustom: false,
          },
        ],
      }),
    )

    const response = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ptFee: 15500,
          trainingPlan: [
            {
              day: 'Monday',
              trainingTypeName: 'Legs',
            },
            {
              day: 'Wednesday',
              trainingTypeName: 'Chest',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(assignmentUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'update_pt_assignment_with_schedule',
        args: {
          p_assignment_id: 'assignment-1',
          p_sessions_per_week: 3,
          p_scheduled_days: ['Monday', 'Wednesday', 'Friday'],
          p_schedule: [
            {
              day_of_week: 'Monday',
              session_time: '07:00:00',
              training_type_name: 'Legs',
            },
            {
              day_of_week: 'Wednesday',
              session_time: '07:00:00',
              training_type_name: 'Chest',
            },
            {
              day_of_week: 'Friday',
              session_time: '07:00:00',
              training_type_name: null,
            },
          ],
          p_updates: {
            ptFee: 15500,
          },
        },
      },
    ])
    expect(payload.assignment).toEqual(
      buildAssignment({
        trainingPlan: [
          {
            day: 'Monday',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
          {
            day: 'Wednesday',
            trainingTypeName: 'Chest',
            isCustom: false,
          },
        ],
      }),
    )
  })

  it('PATCH sends a null PT fee through the atomic schedule update rpc when the fee is cleared', async () => {
    const { client, assignmentUpdates, rpcCalls } = createPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        ptFee: null,
        trainingPlan: [
          {
            day: 'Monday',
            trainingTypeName: 'Legs',
            isCustom: false,
          },
        ],
      }),
    )

    const response = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ptFee: null,
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
    expect(assignmentUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'update_pt_assignment_with_schedule',
        args: {
          p_assignment_id: 'assignment-1',
          p_sessions_per_week: 3,
          p_scheduled_days: ['Monday', 'Wednesday', 'Friday'],
          p_schedule: [
            {
              day_of_week: 'Monday',
              session_time: '07:00:00',
              training_type_name: 'Legs',
            },
            {
              day_of_week: 'Wednesday',
              session_time: '07:00:00',
              training_type_name: null,
            },
            {
              day_of_week: 'Friday',
              session_time: '07:00:00',
              training_type_name: null,
            },
          ],
          p_updates: {
            ptFee: null,
          },
        },
      },
    ])
  })

  it('PATCH keeps direct-only assignment edits on the trainer_clients update path', async () => {
    const { client, assignmentUpdates, rpcCalls } = createPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(buildAssignment())

    const response = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ptFee: 15500,
          notes: ' Updated notes ',
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(assignmentUpdates).toEqual([
      {
        updated_at: expect.any(String),
        pt_fee: 15500,
        notes: 'Updated notes',
      },
    ])
    expect(rpcCalls).toEqual([])
  })

  it('PATCH returns a single error when the atomic schedule update rpc fails', async () => {
    const { client, assignmentUpdates, rpcCalls } = createPatchClient({
      rpcErrors: {
        update_pt_assignment_with_schedule: 'rpc failed',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(buildAssignment())

    const response = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ptFee: 15500,
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

    expect(response.status).toBe(500)
    expect(payload.error).toBe('Failed to update the PT assignment: rpc failed')
    expect(assignmentUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'update_pt_assignment_with_schedule',
        args: {
          p_assignment_id: 'assignment-1',
          p_sessions_per_week: 3,
          p_scheduled_days: ['Monday', 'Wednesday', 'Friday'],
          p_schedule: [
            {
              day_of_week: 'Monday',
              session_time: '07:00:00',
              training_type_name: 'Legs',
            },
            {
              day_of_week: 'Wednesday',
              session_time: '07:00:00',
              training_type_name: null,
            },
            {
              day_of_week: 'Friday',
              session_time: '07:00:00',
              training_type_name: null,
            },
          ],
          p_updates: {
            ptFee: 15500,
          },
        },
      },
    ])
  })

  it('PATCH rejects training plan days that are outside the updated schedule', async () => {
    getSupabaseAdminClientMock.mockReturnValue({})
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(buildAssignment())

    const response = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduledSessions: [
            { day: 'Monday', sessionTime: '07:00' },
            { day: 'Friday', sessionTime: '07:00' },
          ],
          sessionsPerWeek: 2,
          trainingPlan: [
            {
              day: 'Wednesday',
              trainingTypeName: 'Chest',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Training plan day Wednesday must also be selected in scheduled days.')
  })
})
