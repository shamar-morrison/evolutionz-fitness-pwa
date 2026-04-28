import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  buildJamaicaScheduledAtFromLocalInputMock,
  getSupabaseAdminClientMock,
  readPtSessionDetailMock,
  readPtSessionRowByIdMock,
} = vi.hoisted(() => ({
  buildJamaicaScheduledAtFromLocalInputMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  readPtSessionDetailMock: vi.fn(),
  readPtSessionRowByIdMock: vi.fn(),
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>(
    '@/lib/pt-scheduling',
  )

  return {
    ...actual,
    buildJamaicaScheduledAtFromLocalInput: buildJamaicaScheduledAtFromLocalInputMock,
  }
})

vi.mock('@/lib/pt-scheduling-server', () => ({
  readPtSessionDetail: readPtSessionDetailMock,
  readPtSessionRowById: readPtSessionRowByIdMock,
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

import { GET, PATCH } from '@/app/api/pt/sessions/[id]/route'

function createSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-1',
    assignment_id: 'assignment-1',
    trainer_id: 'trainer-1',
    member_id: 'member-1',
    scheduled_at: '2026-04-15T12:00:00.000Z',
    status: 'scheduled',
    is_recurring: false,
    notes: 'Original note',
    created_at: '2026-04-01T12:00:00.000Z',
    updated_at: '2026-04-01T12:00:00.000Z',
    ...overrides,
  }
}

function createSessionDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session: {
      id: 'session-1',
      assignmentId: 'assignment-1',
      trainerId: 'trainer-1',
      memberId: 'member-1',
      scheduledAt: '2026-04-15T12:00:00.000Z',
      status: 'scheduled',
      isRecurring: false,
      notes: 'Original note',
      trainingTypeName: null,
      createdAt: '2026-04-01T12:00:00.000Z',
      updatedAt: '2026-04-01T12:00:00.000Z',
      trainerName: 'Jordan Trainer',
      memberName: 'Jane Doe',
      memberPhotoUrl: null,
      pendingRequestType: null,
    },
    changes: [
      {
        id: 'change-1',
        sessionId: 'session-1',
        changedBy: 'admin-1',
        changeType: 'status_change',
        oldValue: {
          status: 'scheduled',
        },
        newValue: {
          status: 'completed',
        },
        createdAt: '2026-04-12T12:00:00.000Z',
        changedByName: 'Admin User',
      },
    ],
    ...overrides,
  }
}

function createPtSessionRouteClient(options: {
  updateResult?: { id: string } | null
  updateError?: { message: string } | null
  auditError?: { message: string } | null
} = {}) {
  const sessionUpdates: Array<Record<string, unknown>> = []
  const auditInserts: Array<Array<Record<string, unknown>>> = []

  return {
    sessionUpdates,
    auditInserts,
    client: {
      from(table: string) {
        if (table === 'pt_sessions') {
          return {
            update(values: Record<string, unknown>) {
              sessionUpdates.push(values)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('session-1')

                  return {
                    select(columns: string) {
                      expect(columns).toBe('id')

                      return {
                        maybeSingle: vi.fn().mockResolvedValue({
                          data:
                            'updateResult' in options
                              ? options.updateResult
                              : { id: 'session-1' },
                          error: options.updateError ?? null,
                        }),
                      }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'pt_session_changes') {
          return {
            insert(values: Array<Record<string, unknown>>) {
              auditInserts.push(values)

              return Promise.resolve({
                error: options.auditError ?? null,
              })
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('PT session detail route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    buildJamaicaScheduledAtFromLocalInputMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    readPtSessionDetailMock.mockReset()
    readPtSessionRowByIdMock.mockReset()
    resetServerAuthMocks()
  })

  it('GET returns the PT session detail with change history', async () => {
    const detail = createSessionDetail()
    getSupabaseAdminClientMock.mockReturnValue(createPtSessionRouteClient().client)
    readPtSessionDetailMock.mockResolvedValue(detail)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      session: detail.session,
      changes: detail.changes,
    })
  })

  it('GET returns 404 when the PT session is not found', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createPtSessionRouteClient().client)
    readPtSessionDetailMock.mockResolvedValue(null)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'PT session not found.',
    })
  })

  it('GET returns 401 when unauthenticated', async () => {
    mockUnauthorized()

    const response = await GET(new Request('http://localhost/api/pt/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('GET returns 403 when forbidden', async () => {
    mockForbidden()

    const response = await GET(new Request('http://localhost/api/pt/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('PATCH supports a note-only edit without writing session history', async () => {
    const { client, sessionUpdates, auditInserts } = createPtSessionRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtSessionDetailMock.mockResolvedValue(
      createSessionDetail({
        session: {
          ...createSessionDetail().session,
          notes: 'Updated admin note',
        },
      }),
    )
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'Updated admin note',
        }),
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(sessionUpdates[0]).toMatchObject({
      notes: 'Updated admin note',
      updated_at: expect.any(String),
    })
    expect(auditInserts).toEqual([])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      session: expect.objectContaining({
        notes: 'Updated admin note',
      }),
    })
  })

  it('PATCH reschedules the session using a valid Jamaica-local time', async () => {
    const { client, sessionUpdates, auditInserts } = createPtSessionRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtSessionDetailMock.mockResolvedValue(
      createSessionDetail({
        session: {
          ...createSessionDetail().session,
          scheduledAt: '2026-04-16T14:00:00.000Z',
        },
      }),
    )
    buildJamaicaScheduledAtFromLocalInputMock.mockReturnValue('2026-04-16T14:00:00.000Z')
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduledAt: '2026-04-16T09:00',
        }),
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(sessionUpdates[0]).toMatchObject({
      scheduled_at: '2026-04-16T14:00:00.000Z',
      updated_at: expect.any(String),
    })
    expect(auditInserts).toEqual([
      [
        {
          session_id: 'session-1',
          changed_by: 'admin-1',
          change_type: 'reschedule',
          old_value: {
            scheduledAt: '2026-04-15T12:00:00.000Z',
          },
          new_value: {
            scheduledAt: '2026-04-16T14:00:00.000Z',
          },
        },
      ],
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      session: expect.objectContaining({
        scheduledAt: '2026-04-16T14:00:00.000Z',
      }),
    })
  })

  it('PATCH updates the session status and records status history', async () => {
    const { client, sessionUpdates, auditInserts } = createPtSessionRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtSessionDetailMock.mockResolvedValue(
      createSessionDetail({
        session: {
          ...createSessionDetail().session,
          status: 'completed',
        },
      }),
    )
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'completed',
        }),
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(sessionUpdates[0]).toMatchObject({
      status: 'completed',
      updated_at: expect.any(String),
    })
    expect(auditInserts).toEqual([
      [
        {
          session_id: 'session-1',
          changed_by: 'admin-1',
          change_type: 'status_change',
          old_value: {
            status: 'scheduled',
          },
          new_value: {
            status: 'completed',
          },
        },
      ],
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      session: expect.objectContaining({
        status: 'completed',
      }),
    })
  })

  it('PATCH returns 400 when scheduledAt is invalid', async () => {
    const { client } = createPtSessionRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    buildJamaicaScheduledAtFromLocalInputMock.mockReturnValue(null)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduledAt: 'invalid-local-time',
        }),
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Scheduled date and time must be valid.',
    })
  })

  it('PATCH returns 401 when unauthenticated', async () => {
    mockUnauthorized()

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('PATCH returns 403 when forbidden', async () => {
    mockForbidden()

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('PATCH returns 404 when the PT session is not found', async () => {
    const { client, sessionUpdates } = createPtSessionRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionRowByIdMock.mockResolvedValue(null)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/sessions/session-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'Updated admin note',
        }),
      }),
      {
        params: Promise.resolve({ id: 'session-1' }),
      },
    )

    expect(sessionUpdates).toEqual([])
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'PT session not found.',
    })
  })
})
