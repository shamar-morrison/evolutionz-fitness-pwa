import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockAdminUser, resetServerAuthMocks } from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  readTrainerClientByIdMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readTrainerClientByIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/pt-scheduling-server', () => ({
  readTrainerClientById: readTrainerClientByIdMock,
}))

import { POST } from '@/app/api/pt/assignments/[id]/generate-sessions/route'
import type { DayOfWeek, TrainerClient } from '@/lib/pt-scheduling'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function buildAssignment(overrides: Partial<TrainerClient> = {}): TrainerClient {
  const scheduledDays = overrides.scheduledDays ?? ['Monday', 'Wednesday']
  const scheduledSessions =
    overrides.scheduledSessions ??
    scheduledDays.map((day) => ({
      day,
      sessionTime: '07:00',
      trainingTypeName: null,
      isCustom: false,
    }))

  return {
    id: overrides.id ?? 'assignment-1',
    trainerId: overrides.trainerId ?? 'trainer-1',
    memberId: overrides.memberId ?? 'member-1',
    status: overrides.status ?? 'active',
    ptFee: overrides.ptFee ?? 15000,
    sessionsPerWeek: overrides.sessionsPerWeek ?? scheduledSessions.length,
    scheduledSessions,
    scheduledDays,
    trainingPlan: overrides.trainingPlan ?? [],
    sessionTime: overrides.sessionTime ?? scheduledSessions[0]?.sessionTime ?? '07:00',
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    trainerName: overrides.trainerName ?? 'Jordan Trainer',
    trainerTitles: overrides.trainerTitles ?? ['Trainer'],
    memberName: overrides.memberName ?? 'Client One',
    memberPhotoUrl: overrides.memberPhotoUrl ?? null,
  }
}

function createPtSessionsClient(options: {
  existingAssignmentSessions?: Array<{ scheduled_at: string }>
  existingPairSessions?: Array<{ id: string; scheduled_at: string }>
} = {}) {
  const insertedRows: Array<Array<Record<string, unknown>>> = []

  return {
    insertedRows,
    client: {
      from(table: string) {
        expect(table).toBe('pt_sessions')

        return {
          select(columns: string) {
            if (columns === 'scheduled_at') {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('assignment_id')
                  expect(value).toBe('assignment-1')

                  return {
                    gte(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('scheduled_at')
                      expect(nextValue).toContain('2026-04-01T00:00:00')

                      return {
                        lt(lastColumn: string, lastValue: string) {
                          expect(lastColumn).toBe('scheduled_at')
                          expect(lastValue).toContain('2026-05-01T00:00:00')

                          return Promise.resolve({
                            data: options.existingAssignmentSessions ?? [],
                            error: null,
                          } satisfies QueryResult<Array<{ scheduled_at: string }>>)
                        },
                      }
                    },
                  }
                },
              }
            }

            if (columns === 'id, scheduled_at') {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('trainer_id')
                  expect(value).toBe('trainer-1')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('member_id')
                      expect(nextValue).toBe('member-1')

                      return {
                        gte(gteColumn: string, _gteValue: string) {
                          expect(gteColumn).toBe('scheduled_at')

                          return {
                            lt(ltColumn: string, _ltValue: string) {
                              expect(ltColumn).toBe('scheduled_at')

                              return Promise.resolve({
                                data: options.existingPairSessions ?? [],
                                error: null,
                              } satisfies QueryResult<Array<{ id: string; scheduled_at: string }>>)
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
          insert(values: Array<Record<string, unknown>>) {
            insertedRows.push(values)

            return Promise.resolve({
              data: null,
              error: null,
            } satisfies QueryResult<null>)
          },
        }
      },
    },
  }
}

function buildScheduledSessions(days: DayOfWeek[], sessionTime = '07:00') {
  return days.map((day) => ({
    day,
    sessionTime,
    trainingTypeName: null,
    isCustom: false,
  }))
}

describe('PT assignment generate sessions route', () => {
  afterEach(() => {
    vi.clearAllMocks()
    resetServerAuthMocks()
  })

  it('builds generated timestamps from each scheduled day time', async () => {
    const { client, insertedRows } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        scheduledDays: ['Monday', 'Wednesday'],
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
            trainingTypeName: 'Upper Body',
            isCustom: false,
          },
        ],
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/pt/assignments/assignment-1/generate-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: 4,
          year: 2026,
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      generated: 9,
      skipped: 0,
    })
    expect(insertedRows[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scheduled_at: '2026-04-01T07:15:00-05:00',
        }),
        expect.objectContaining({
          scheduled_at: '2026-04-06T06:30:00-05:00',
        }),
      ]),
    )
  })

  it('allows seven sessions in a week without returning a limit warning', async () => {
    const { client, insertedRows } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        scheduledDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        scheduledSessions: buildScheduledSessions(
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        ),
        sessionsPerWeek: 7,
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/pt/assignments/assignment-1/generate-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: 4,
          year: 2026,
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.generated).toBeGreaterThan(0)
    expect(insertedRows[0]).toHaveLength(30)
  })

  it('returns WEEK_LIMIT_EXCEEDED only when a week would exceed seven sessions', async () => {
    const { client, insertedRows } = createPtSessionsClient({
      existingPairSessions: [
        {
          id: 'session-existing',
          scheduled_at: '2026-04-06T06:00:00-05:00',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()
    readTrainerClientByIdMock.mockResolvedValue(
      buildAssignment({
        scheduledDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        scheduledSessions: buildScheduledSessions(
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        ),
        sessionsPerWeek: 7,
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/pt/assignments/assignment-1/generate-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: 4,
          year: 2026,
        }),
      }),
      { params: Promise.resolve({ id: 'assignment-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: false,
      code: 'WEEK_LIMIT_EXCEEDED',
      weeks: ['2026-W15'],
    })
    expect(insertedRows).toEqual([])
  })
})
