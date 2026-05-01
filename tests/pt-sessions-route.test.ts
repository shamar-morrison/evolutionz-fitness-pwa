import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const { configFeatures, getSupabaseAdminClientMock } = vi.hoisted(() => ({
  configFeatures: {
    showDevRemovePtSessionsButton: true,
  },
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedProfile: mod.requireAuthenticatedProfileMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/config', () => ({
  config: {
    features: {
      get showDevRemovePtSessionsButton() {
        return configFeatures.showDevRemovePtSessionsButton
      },
    },
  },
}))

import { DELETE, GET } from '@/app/api/pt/sessions/route'

type QueryOperation =
  | { type: 'select'; columns: string }
  | { type: 'order'; column: string; ascending: boolean }
  | { type: 'eq'; column: string; value: string }
  | { type: 'in'; column: string; values: string[] }
  | { type: 'gte'; column: string; value: string }
  | { type: 'lt'; column: string; value: string }

function createPtSessionsClient() {
  const operations: QueryOperation[] = []
  const builder = {
    data: [] as Array<Record<string, unknown>>,
    error: null as { message: string } | null,
    select(columns: string) {
      operations.push({ type: 'select', columns })
      return this
    },
    order(column: string, { ascending }: { ascending: boolean }) {
      operations.push({ type: 'order', column, ascending })
      return this
    },
    eq(column: string, value: string) {
      operations.push({ type: 'eq', column, value })
      return this
    },
    in(column: string, values: string[]) {
      operations.push({ type: 'in', column, values })
      return this
    },
    lt(column: string, value: string) {
      operations.push({ type: 'lt', column, value })
      return this
    },
  }

  return {
    operations,
    client: {
      from(table: string) {
        expect(table).toBe('pt_sessions')
        return builder
      },
    },
  }
}

function createHydratedPtSessionsClient() {
  return {
    client: {
      from(table: string) {
        if (table === 'pt_sessions') {
          return {
            select(columns: string) {
              expect(columns).toContain('id')

              return {
                order() {
                  return this
                },
                then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
                  resolve({
                    data: [
                      {
                        id: 'session-1',
                        assignment_id: 'assignment-1',
                        trainer_id: 'trainer-1',
                        member_id: 'member-1',
                        scheduled_at: '2026-04-10T10:00:00.000Z',
                        status: 'scheduled',
                        is_recurring: false,
                        notes: null,
                        created_at: '2026-04-01T00:00:00.000Z',
                        updated_at: '2026-04-01T00:00:00.000Z',
                      },
                    ],
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'pt_reschedule_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe('session_id')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual(['session-1'])

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('pending')

                      return Promise.resolve({
                        data: [{ session_id: 'session-1' }],
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'pt_session_update_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe('session_id')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual(['session-1'])

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('pending')

                      return Promise.resolve({
                        data: [{ session_id: 'session-1' }],
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'profiles') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, name, titles')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('id')
                  expect(values).toEqual(['trainer-1'])

                  return Promise.resolve({
                    data: [
                      {
                        id: 'trainer-1',
                        name: 'Jordan Trainer',
                        titles: ['Trainer'],
                      },
                    ],
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'members') {
          return {
            select(columns: string) {
              if (columns === 'id, name, photo_url') {
                return {
                  in(column: string, values: string[]) {
                    expect(column).toBe('id')
                    expect(values).toEqual(['member-1'])

                    return Promise.resolve({
                      data: [
                        {
                          id: 'member-1',
                          name: 'Client One',
                          photo_url: null,
                        },
                      ],
                      error: null,
                    })
                  },
                }
              }

              expect(columns).toBe('id, name')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('id')
                  expect(values).toEqual(['member-1'])

                  return Promise.resolve({
                    data: [
                      {
                        id: 'member-1',
                        name: 'Client One',
                      },
                    ],
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'training_plan_days') {
          return {
            select(columns: string) {
              expect(columns).toContain('assignment_id')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('assignment_id')
                  expect(values).toEqual(['assignment-1'])

                  return Promise.resolve({
                    data: [],
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    },
  }
}

function createDeletePtSessionsClient(
  rows: Array<{ id: string; assignment_id: string }> = [
    {
      id: 'session-1',
      assignment_id: 'assignment-1',
    },
    {
      id: 'session-2',
      assignment_id: 'assignment-1',
    },
    {
      id: 'session-3',
      assignment_id: 'assignment-2',
    },
  ],
) {
  const sessionSelectFilters: Array<{
    assignmentIds?: string[]
    startInclusive?: string
    endExclusive?: string
  }> = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = []

  return {
    rpcCalls,
    sessionSelectFilters,
    client: {
      rpc(fn: string, args?: Record<string, unknown>) {
        rpcCalls.push({ fn, args })

        return Promise.resolve({
          data: null,
          error: null,
        })
      },
      from(table: string) {
        if (table === 'pt_sessions') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, assignment_id')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('assignment_id')
                  sessionSelectFilters.push({ assignmentIds: values })

                  return {
                    gte(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('scheduled_at')
                      sessionSelectFilters[sessionSelectFilters.length - 1].startInclusive = nextValue

                      return {
                        lt(lastColumn: string, lastValue: string) {
                          expect(lastColumn).toBe('scheduled_at')
                          sessionSelectFilters[sessionSelectFilters.length - 1].endExclusive = lastValue

                          return Promise.resolve({
                            data: rows,
                            error: null,
                          })
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    },
  }
}

describe('GET /api/pt/sessions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    configFeatures.showDevRemovePtSessionsButton = true
    resetServerAuthMocks()
  })

  it('maps status=active to all non-cancelled PT statuses', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/pt/sessions?status=active'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'in',
      column: 'status',
      values: ['scheduled', 'completed', 'missed', 'rescheduled'],
    })
  })

  it('maps past=true to past sessions only and excludes scheduled status', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/pt/sessions?past=true'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'in',
      column: 'status',
      values: ['completed', 'missed', 'rescheduled', 'cancelled'],
    })
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          type: 'lt',
          column: 'scheduled_at',
          value: expect.any(String),
        },
      ]),
    )
  })

  it('composes memberId and past filters in the same PT sessions request', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/pt/sessions?memberId=22222222-2222-4222-8222-222222222222&past=true',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          type: 'eq',
          column: 'member_id',
          value: '22222222-2222-4222-8222-222222222222',
        },
        {
          type: 'in',
          column: 'status',
          values: ['completed', 'missed', 'rescheduled', 'cancelled'],
        },
        {
          type: 'lt',
          column: 'scheduled_at',
          value: expect.any(String),
        },
      ]),
    )
  })

  it('allows front desk staff to read past PT sessions by memberId', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedProfile({
      profile: {
        id: 'assistant-1',
        role: 'staff',
        titles: ['Assistant'],
      },
    })

    const response = await GET(
      new Request(
        'http://localhost/api/pt/sessions?memberId=22222222-2222-4222-8222-222222222222&past=true',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'eq',
      column: 'member_id',
      value: '22222222-2222-4222-8222-222222222222',
    })
    expect(operations).not.toContainEqual({
      type: 'eq',
      column: 'trainer_id',
      value: 'assistant-1',
    })
  })

  it('rejects front desk PT session requests that are not scoped to a member', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: 'assistant-1',
        role: 'staff',
        titles: ['Administrative Assistant'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/sessions?past=true'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('forces trainerId to the authenticated staff profile when staff omit the filter', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedProfile({
      profile: {
        id: '33333333-3333-4333-8333-333333333333',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/sessions'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'eq',
      column: 'trainer_id',
      value: '33333333-3333-4333-8333-333333333333',
    })
  })

  it('rejects staff requests for another trainerId', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: '33333333-3333-4333-8333-333333333333',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(
      new Request(
        'http://localhost/api/pt/sessions?trainerId=44444444-4444-4444-8444-444444444444',
      ),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('includes pendingRequestType on hydrated session responses', async () => {
    const { client } = createHydratedPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/pt/sessions'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      sessions: [
        expect.objectContaining({
          id: 'session-1',
          memberName: 'Client One',
          trainerName: 'Jordan Trainer',
          pendingRequestType: 'reschedule',
        }),
      ],
    })
  })
})

describe('DELETE /api/pt/sessions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    configFeatures.showDevRemovePtSessionsButton = true
    resetServerAuthMocks()
  })

  it('returns 404 when the dev cleanup feature flag is disabled', async () => {
    configFeatures.showDevRemovePtSessionsButton = false
    mockAdminUser()

    const response = await DELETE(
      new Request('http://localhost/api/pt/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: '2026-04',
          assignmentIds: ['assignment-1'],
        }),
      }),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Not found.',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('rejects invalid months and empty assignment selections', async () => {
    mockAdminUser()

    const invalidMonthResponse = await DELETE(
      new Request('http://localhost/api/pt/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: '2026-13',
          assignmentIds: ['assignment-1'],
        }),
      }),
    )

    expect(invalidMonthResponse.status).toBe(400)
    await expect(invalidMonthResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Month filters must use a valid calendar month.',
    })

    const emptyAssignmentsResponse = await DELETE(
      new Request('http://localhost/api/pt/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: '2026-04',
          assignmentIds: [],
        }),
      }),
    )

    expect(emptyAssignmentsResponse.status).toBe(400)
    await expect(emptyAssignmentsResponse.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Select at least one assignment.'),
    })
  })

  it('deletes matching month-scoped sessions across all statuses and archives matching notifications', async () => {
    mockAdminUser()
    const { client, rpcCalls, sessionSelectFilters } = createDeletePtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/pt/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: '2026-04',
          assignmentIds: ['assignment-1', 'assignment-2'],
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedSessions: 3,
      deletedAssignments: 2,
    })
    expect(sessionSelectFilters).toEqual([
      {
        assignmentIds: ['assignment-1', 'assignment-2'],
        startInclusive: '2026-04-01T00:00:00-05:00',
        endExclusive: '2026-05-01T00:00:00-05:00',
      },
    ])
    expect(rpcCalls).toEqual([
      {
        fn: 'delete_pt_sessions_and_archive_notifications',
        args: {
          session_ids: ['session-1', 'session-2', 'session-3'],
          archived_at: expect.any(String),
        },
      },
    ])
  })

  it('only removes the sessions returned for the selected assignments', async () => {
    mockAdminUser()
    const { client, rpcCalls } = createDeletePtSessionsClient([
      {
        id: 'session-1',
        assignment_id: 'assignment-1',
      },
      {
        id: 'session-2',
        assignment_id: 'assignment-1',
      },
    ])
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/pt/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: '2026-04',
          assignmentIds: ['assignment-1'],
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedSessions: 2,
      deletedAssignments: 1,
    })
    expect(rpcCalls).toEqual([
      {
        fn: 'delete_pt_sessions_and_archive_notifications',
        args: {
          session_ids: ['session-1', 'session-2'],
          archived_at: expect.any(String),
        },
      },
    ])
  })
})
