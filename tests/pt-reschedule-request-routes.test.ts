import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  buildJamaicaScheduledAtFromLocalInputMock,
  formatPtSessionDateTimeMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  readAdminNotificationRecipientsMock,
  readPtRescheduleRequestRowByIdMock,
  readPtRescheduleRequestsMock,
  readPtSessionRowByIdMock,
  readPtSessionsMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  buildJamaicaScheduledAtFromLocalInputMock: vi.fn(),
  formatPtSessionDateTimeMock: vi.fn((value: string) => `formatted:${value}`),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
  readAdminNotificationRecipientsMock: vi.fn(),
  readPtRescheduleRequestRowByIdMock: vi.fn(),
  readPtRescheduleRequestsMock: vi.fn(),
  readPtSessionRowByIdMock: vi.fn(),
  readPtSessionsMock: vi.fn(),
}))

vi.mock('@/lib/pt-scheduling', () => ({
  buildJamaicaScheduledAtFromLocalInput: buildJamaicaScheduledAtFromLocalInputMock,
  formatPtSessionDateTime: formatPtSessionDateTimeMock,
}))

vi.mock('@/lib/pt-scheduling-server', () => ({
  readPtRescheduleRequestRowById: readPtRescheduleRequestRowByIdMock,
  readPtRescheduleRequests: readPtRescheduleRequestsMock,
  readPtSessionRowById: readPtSessionRowByIdMock,
  readPtSessions: readPtSessionsMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
  insertNotifications: insertNotificationsMock,
  readAdminNotificationRecipients: readAdminNotificationRecipientsMock,
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

import { GET } from '@/app/api/pt/reschedule-requests/route'
import { PATCH } from '@/app/api/pt/reschedule-requests/[id]/route'
import { POST } from '@/app/api/pt/sessions/[id]/reschedule-request/route'

function createSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-1',
    trainer_id: 'trainer-1',
    member_id: 'member-1',
    scheduled_at: '2026-04-10T10:00:00.000Z',
    status: 'scheduled',
    assignment_id: 'assignment-1',
    is_recurring: false,
    notes: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createRescheduleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'request-1',
    session_id: 'session-1',
    requested_by: 'trainer-1',
    proposed_at: '2026-04-12T10:00:00.000Z',
    note: 'Need to move it later.',
    status: 'pending',
    reviewed_by: null,
    review_note: null,
    reviewed_at: null,
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    ...overrides,
  }
}

function createPostClient(
  options: {
    pendingReschedule?: boolean
    pendingStatusChange?: boolean
  } = {},
) {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
    client: {
      from(table: string) {
        if (table === 'pt_session_update_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('session_id')
                  expect(value).toBe('session-1')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('pending')

                      return {
                        limit(limitValue: number) {
                          expect(limitValue).toBe(1)

                          return {
                            maybeSingle: vi.fn().mockResolvedValue({
                              data: options.pendingStatusChange ? { id: 'update-1' } : null,
                              error: null,
                            }),
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        expect(table).toBe('pt_reschedule_requests')

        return {
          select(columns: string) {
            expect(columns).toBe('id')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('session_id')
                expect(value).toBe('session-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('status')
                    expect(nextValue).toBe('pending')

                    return {
                      limit(limitValue: number) {
                        expect(limitValue).toBe(1)

                        return {
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: options.pendingReschedule ? { id: 'request-1' } : null,
                            error: null,
                          }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
          insert(values: Record<string, unknown>) {
            insertValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'request-1' },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      },
    },
  }
}

function createPatchClient() {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []
  const changeInserts: Array<Record<string, unknown>> = []

  return {
    updates,
    changeInserts,
    client: {
      from(table: string) {
        if (table === 'pt_sessions') {
          return {
            update(values: Record<string, unknown>) {
              updates.push({ table, values })

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('session-1')

                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        }

        if (table === 'pt_session_changes') {
          return {
            insert(values: Record<string, unknown>) {
              changeInserts.push(values)

              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'pt_reschedule_requests') {
          return {
            update(values: Record<string, unknown>) {
              updates.push({ table, values })

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return Promise.resolve({ error: null })
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

describe('PT reschedule request routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockClear()
    buildJamaicaScheduledAtFromLocalInputMock.mockReset()
    formatPtSessionDateTimeMock.mockClear()
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockClear()
    readAdminNotificationRecipientsMock.mockReset()
    readPtRescheduleRequestRowByIdMock.mockReset()
    readPtRescheduleRequestsMock.mockReset()
    readPtSessionRowByIdMock.mockReset()
    readPtSessionsMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates a trainer reschedule request and notifies admins', async () => {
    const { client, insertValues } = createPostClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    buildJamaicaScheduledAtFromLocalInputMock.mockReturnValue('2026-04-12T10:00:00.000Z')
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtSessionsMock.mockResolvedValue([{ memberName: 'Client One' }])
    readPtRescheduleRequestsMock.mockResolvedValue([
      {
        id: 'request-1',
        sessionId: 'session-1',
      },
    ])
    readAdminNotificationRecipientsMock.mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ])
    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-1',
        name: 'Jordan Trainer',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/pt/sessions/session-1/reschedule-request', {
        method: 'POST',
        body: JSON.stringify({
          proposedAt: '2026-04-12T05:00',
          note: 'Need to move it later.',
        }),
      }),
      { params: Promise.resolve({ id: 'session-1' }) },
    )

    expect(response.status).toBe(201)
    expect(insertValues).toEqual([
      {
        session_id: 'session-1',
        requested_by: 'trainer-1',
        proposed_at: '2026-04-12T10:00:00.000Z',
        note: 'Need to move it later.',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        recipientId: 'admin-1',
        type: 'reschedule_request',
        metadata: {
          sessionId: 'session-1',
          requestId: 'request-1',
          trainerId: 'trainer-1',
          memberId: 'member-1',
        },
      }),
      expect.objectContaining({
        recipientId: 'admin-2',
        type: 'reschedule_request',
      }),
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: {
        id: 'request-1',
        sessionId: 'session-1',
      },
    })
  })

  it('rejects a trainer reschedule request when the proposed time is in the past', async () => {
    const { client, insertValues } = createPostClient()

    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-12T10:00:00.000Z').getTime())
    getSupabaseAdminClientMock.mockReturnValue(client)
    buildJamaicaScheduledAtFromLocalInputMock.mockReturnValue('2026-04-12T09:00:00.000Z')
    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-1',
        name: 'Jordan Trainer',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/pt/sessions/session-1/reschedule-request', {
        method: 'POST',
        body: JSON.stringify({
          proposedAt: '2026-04-12T04:00',
        }),
      }),
      { params: Promise.resolve({ id: 'session-1' }) },
    )

    expect(response.status).toBe(400)
    expect(insertValues).toEqual([])
    expect(readPtSessionRowByIdMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Proposed date and time must be in the future.',
    })
  })

  it('rejects a trainer reschedule request when a pending session update request already exists', async () => {
    const { client, insertValues } = createPostClient({ pendingStatusChange: true })

    getSupabaseAdminClientMock.mockReturnValue(client)
    buildJamaicaScheduledAtFromLocalInputMock.mockReturnValue('2026-04-12T10:00:00.000Z')
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-1',
        name: 'Jordan Trainer',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/pt/sessions/session-1/reschedule-request', {
        method: 'POST',
        body: JSON.stringify({
          proposedAt: '2026-04-12T10:00',
        }),
      }),
      { params: Promise.resolve({ id: 'session-1' }) },
    )

    expect(response.status).toBe(400)
    expect(insertValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'A pending request already exists for this session.',
    })
  })

  it('passes status and requestedBy=me through the reschedule request list route for staff', async () => {
    getSupabaseAdminClientMock.mockReturnValue({})
    readPtRescheduleRequestsMock.mockResolvedValue([])
    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-1',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(
      new Request('http://localhost/api/pt/reschedule-requests?status=pending&requestedBy=me'),
    )

    expect(response.status).toBe(200)
    expect(readPtRescheduleRequestsMock).toHaveBeenCalledWith({}, {
      status: 'pending',
      requestedBy: 'trainer-1',
    })
    await expect(response.json()).resolves.toEqual({ requests: [] })
  })

  it('forbids staff reschedule list requests without requestedBy=me', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-1',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/reschedule-requests'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
    expect(readPtRescheduleRequestsMock).not.toHaveBeenCalled()
  })

  it('passes the requestedBy=me filter through the admin reschedule request list route', async () => {
    getSupabaseAdminClientMock.mockReturnValue({})
    readPtRescheduleRequestsMock.mockResolvedValue([])
    mockAuthenticatedProfile({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await GET(
      new Request('http://localhost/api/pt/reschedule-requests?status=pending&requestedBy=me'),
    )

    expect(response.status).toBe(200)
    expect(readPtRescheduleRequestsMock).toHaveBeenCalledWith({}, {
      status: 'pending',
      requestedBy: 'admin-1',
    })
    await expect(response.json()).resolves.toEqual({ requests: [] })
  })

  it('approves a reschedule request, updates the session, and notifies the trainer', async () => {
    const { client, updates, changeInserts } = createPatchClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    buildJamaicaScheduledAtFromLocalInputMock.mockReturnValue('2026-04-13T11:00:00.000Z')
    readPtRescheduleRequestRowByIdMock.mockResolvedValue(createRescheduleRow())
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtRescheduleRequestsMock.mockResolvedValue([
      {
        id: 'request-1',
        status: 'approved',
      },
    ])
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/reschedule-requests/request-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          proposedAt: '2026-04-13T06:00',
          reviewNote: 'Approved with a slightly later slot.',
        }),
      }),
      { params: Promise.resolve({ id: 'request-1' }) },
    )

    expect(response.status).toBe(200)
    expect(updates).toEqual([
      {
        table: 'pt_sessions',
        values: expect.objectContaining({
          scheduled_at: '2026-04-13T11:00:00.000Z',
          status: 'rescheduled',
        }),
      },
      {
        table: 'pt_reschedule_requests',
        values: expect.objectContaining({
          proposed_at: '2026-04-13T11:00:00.000Z',
          status: 'approved',
          reviewed_by: 'admin-1',
          review_note: 'Approved with a slightly later slot.',
        }),
      },
    ])
    expect(changeInserts).toEqual([
      expect.objectContaining({
        session_id: 'session-1',
        changed_by: 'admin-1',
        change_type: 'reschedule',
        new_value: {
          scheduledAt: '2026-04-13T11:00:00.000Z',
        },
      }),
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        recipientId: 'trainer-1',
        type: 'reschedule_approved',
        metadata: {
          sessionId: 'session-1',
          requestId: 'request-1',
        },
      }),
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'reschedule_request',
      archivedAt: expect.any(String),
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: {
        id: 'request-1',
        status: 'approved',
      },
    })
  })

  it('archives the matching pending request notification when a reschedule request is denied', async () => {
    const { client } = createPatchClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtRescheduleRequestRowByIdMock.mockResolvedValue(createRescheduleRow())
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtRescheduleRequestsMock.mockResolvedValue([
      {
        id: 'request-1',
        status: 'denied',
      },
    ])
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/pt/reschedule-requests/request-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'denied',
          reviewNote: 'The trainer needs to keep the original time.',
        }),
      }),
      { params: Promise.resolve({ id: 'request-1' }) },
    )

    expect(response.status).toBe(200)
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        recipientId: 'trainer-1',
        type: 'reschedule_denied',
        metadata: {
          sessionId: 'session-1',
          requestId: 'request-1',
          reviewNote: 'The trainer needs to keep the original time.',
        },
      }),
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'reschedule_request',
      archivedAt: expect.any(String),
    })
  })
})
