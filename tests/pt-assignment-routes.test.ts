import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetServerAuthMocks } from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  hasStaffTitleMock,
  readStaffProfileMock,
  readTrainerClientByIdMock,
  readTrainerClientRowByIdMock,
  readTrainerClientsMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  hasStaffTitleMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  readTrainerClientByIdMock: vi.fn(),
  readTrainerClientRowByIdMock: vi.fn(),
  readTrainerClientsMock: vi.fn(),
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

vi.mock('@/lib/pt-scheduling-server', () => ({
  readTrainerClientById: readTrainerClientByIdMock,
  readTrainerClientRowById: readTrainerClientRowByIdMock,
  readTrainerClients: readTrainerClientsMock,
}))

import { POST } from '@/app/api/pt/assignments/route'
import {
  DELETE,
  PATCH,
} from '@/app/api/pt/assignments/[id]/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  const scheduledDays = (overrides.scheduledDays as string[] | undefined) ?? ['Monday', 'Wednesday', 'Friday']
  const sessionTime = (overrides.sessionTime as string | undefined) ?? '07:00'
  const trainingPlan =
    (overrides.trainingPlan as Array<{ day: string; trainingTypeName: string; isCustom: boolean }> | undefined) ?? []

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

function createPostClient() {
  const insertValues: Array<Record<string, unknown>> = []
  const scheduleDayInserts: Array<Array<Record<string, unknown>>> = []

  return {
    insertValues,
    scheduleDayInserts,
    client: {
      from(table: string) {
        if (table === 'trainer_clients') {
          return {
            select(columns: string) {
              if (columns === 'id') {
                return {
                  eq(column: string, value: string) {
                    if (column === 'member_id') {
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
                    }

                    throw new Error(`Unexpected select eq column: ${column}`)
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

              throw new Error(`Unexpected select columns: ${columns}`)
            },
            insert(values: Record<string, unknown>) {
              insertValues.push(values)

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
        }

        if (table === 'training_plan_days') {
          return {
            insert(values: Array<Record<string, unknown>>) {
              scheduleDayInserts.push(values)

              return Promise.resolve({
                data: null,
                error: null,
              } satisfies QueryResult<null>)
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

function createPatchClient() {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('trainer_clients')

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
            updateValues.push(values)

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
      },
    },
  }
}

function createDeleteClient(cancelledIds: string[] = []) {
  const trainerClientUpdates: Array<Record<string, unknown>> = []
  const sessionUpdates: Array<Record<string, unknown>> = []
  const sessionFilters: Array<{ assignmentId?: string; status?: string; scheduledAfter?: string }> = []

  return {
    trainerClientUpdates,
    sessionUpdates,
    sessionFilters,
    client: {
      from(table: string) {
        if (table === 'trainer_clients') {
          return {
            update(values: Record<string, unknown>) {
              trainerClientUpdates.push(values)

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

        if (table === 'pt_sessions') {
          return {
            update(values: Record<string, unknown>) {
              sessionUpdates.push(values)

              return {
                eq(column: string, value: string) {
                  if (column === 'assignment_id') {
                    sessionFilters.push({ assignmentId: value })

                    return {
                      eq(nextColumn: string, nextValue: string) {
                        expect(nextColumn).toBe('status')
                        expect(nextValue).toBe('scheduled')
                        sessionFilters[sessionFilters.length - 1].status = nextValue

                        return {
                          gt(gtColumn: string, gtValue: string) {
                            expect(gtColumn).toBe('scheduled_at')
                            sessionFilters[sessionFilters.length - 1].scheduledAfter = gtValue

                            return {
                              select(columns: string) {
                                expect(columns).toBe('id')

                                return Promise.resolve({
                                  data: cancelledIds.map((id) => ({ id })),
                                  error: null,
                                } satisfies QueryResult<Array<{ id: string }>>)
                              },
                            }
                          },
                        }
                      },
                    }
                  }

                  throw new Error(`Unexpected pt_sessions eq column: ${column}`)
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

describe('PT assignment routes', () => {
  afterEach(() => {
    vi.clearAllMocks()
    resetServerAuthMocks()
  })

  it('POST accepts notes and inserts no trainer payout', async () => {
    const { client, insertValues } = createPostClient()
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
          notes: '  Client has a prior knee injury.  ',
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.ok).toBe(true)
    expect(insertValues[0]).toEqual({
      trainer_id: '11111111-1111-1111-1111-111111111111',
      member_id: '22222222-2222-2222-2222-222222222222',
      pt_fee: 15000,
      sessions_per_week: 3,
      scheduled_days: ['Monday', 'Wednesday', 'Friday'],
      session_time: '07:00:00',
      notes: 'Client has a prior knee injury.',
    })
    expect('trainer_payout' in insertValues[0]).toBe(false)
  })

  it('POST rejects stale trainer payout input', async () => {
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
          trainerPayout: 10500,
          sessionsPerWeek: 3,
          scheduledSessions: [
            { day: 'Monday', sessionTime: '07:00' },
            { day: 'Wednesday', sessionTime: '07:00' },
            { day: 'Friday', sessionTime: '07:00' },
          ],
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('Unrecognized key')
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('POST rejects sessionsPerWeek values above seven', async () => {
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
          sessionsPerWeek: 8,
          scheduledSessions: Array.from({ length: 7 }, (_, index) => ({
            day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index],
            sessionTime: '07:00',
          })),
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('Number must be less than or equal to 7')
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('POST rejects duplicate scheduled session days', async () => {
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
          sessionsPerWeek: 2,
          scheduledSessions: [
            { day: 'Monday', sessionTime: '07:00' },
            { day: 'Monday', sessionTime: '08:00' },
          ],
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Scheduled days must be unique.')
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('PATCH updates notes and rejects stale trainer payout input', async () => {
    const { client, updateValues } = createPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        notes: 'Updated notes',
      }),
    )

    const patchResponse = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ptFee: 15500,
          notes: '  Updated notes  ',
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const patchPayload = await patchResponse.json()

    expect(patchResponse.status).toBe(200)
    expect(patchPayload.ok).toBe(true)
    expect(updateValues[0]).toEqual({
      updated_at: expect.any(String),
      pt_fee: 15500,
      notes: 'Updated notes',
    })
    expect('trainer_payout' in updateValues[0]).toBe(false)

    const staleResponse = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainerPayout: 10500,
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const stalePayload = await staleResponse.json()

    expect(staleResponse.status).toBe(400)
    expect(stalePayload.error).toContain('Unrecognized key')
  })

  it('PATCH rejects scheduled session times that are not valid HH:MM values', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduledSessions: [
            {
              day: 'Monday',
              sessionTime: '7:00',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('Session time must use HH:MM format.')
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('DELETE without cancelling future sessions only marks the assignment inactive', async () => {
    const { client, sessionUpdates, trainerClientUpdates } = createDeleteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())

    const response = await DELETE(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancelFutureSessions: false,
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      cancelledSessions: 0,
    })
    expect(trainerClientUpdates[0]).toEqual({
      status: 'inactive',
      updated_at: expect.any(String),
    })
    expect(sessionUpdates).toEqual([])
  })

  it('DELETE with future-session cancellation only targets future scheduled sessions', async () => {
    const { client, sessionFilters, sessionUpdates } = createDeleteClient(['session-1', 'session-2'])
    getSupabaseAdminClientMock.mockReturnValue(client)
    readTrainerClientRowByIdMock.mockResolvedValue(buildAssignmentRow())

    const response = await DELETE(
      new Request('http://localhost/api/pt/assignments/assignment-1', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancelFutureSessions: true,
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      cancelledSessions: 2,
    })
    expect(sessionUpdates[0]).toEqual({
      status: 'cancelled',
      updated_at: expect.any(String),
    })
    expect(sessionFilters[0]).toEqual({
      assignmentId: 'assignment-1',
      status: 'scheduled',
      scheduledAfter: expect.any(String),
    })
  })
})
