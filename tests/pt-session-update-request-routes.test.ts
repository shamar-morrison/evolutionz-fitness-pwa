import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  formatPtSessionDateTimeMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  readAdminNotificationRecipientsMock,
  readPtSessionRowByIdMock,
  readPtSessionsMock,
  readPtSessionUpdateRequestRowByIdMock,
  readPtSessionUpdateRequestsMock,
} = vi.hoisted(() => ({
  formatPtSessionDateTimeMock: vi.fn((value: string) => `formatted:${value}`),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
  readAdminNotificationRecipientsMock: vi.fn(),
  readPtSessionRowByIdMock: vi.fn(),
  readPtSessionsMock: vi.fn(),
  readPtSessionUpdateRequestRowByIdMock: vi.fn(),
  readPtSessionUpdateRequestsMock: vi.fn(),
}))

vi.mock('@/lib/pt-scheduling', () => ({
  formatPtSessionDateTime: formatPtSessionDateTimeMock,
}))

vi.mock('@/lib/pt-scheduling-server', () => ({
  readPtSessionRowById: readPtSessionRowByIdMock,
  readPtSessions: readPtSessionsMock,
  readPtSessionUpdateRequestRowById: readPtSessionUpdateRequestRowByIdMock,
  readPtSessionUpdateRequests: readPtSessionUpdateRequestsMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
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

import { GET } from '@/app/api/pt/session-update-requests/route'
import { PATCH } from '@/app/api/pt/session-update-requests/[id]/route'
import { POST } from '@/app/api/pt/sessions/[id]/mark/route'

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

function createSessionUpdateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'update-1',
    session_id: 'session-1',
    requested_by: 'trainer-1',
    requested_status: 'completed',
    note: 'Client completed the workout.',
    status: 'pending',
    reviewed_by: null,
    review_note: null,
    reviewed_at: null,
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    ...overrides,
  }
}

function createMarkPostClient() {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
    client: {
      from(table: string) {
        expect(table).toBe('pt_session_update_requests')

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
                            data: null,
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
                    data: { id: 'update-1' },
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

function createReviewClient() {
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

        if (table === 'pt_session_update_requests') {
          return {
            update(values: Record<string, unknown>) {
              updates.push({ table, values })

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('update-1')

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

describe('PT session update request routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    formatPtSessionDateTimeMock.mockClear()
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockClear()
    readAdminNotificationRecipientsMock.mockReset()
    readPtSessionRowByIdMock.mockReset()
    readPtSessionsMock.mockReset()
    readPtSessionUpdateRequestRowByIdMock.mockReset()
    readPtSessionUpdateRequestsMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates a trainer session update request and notifies admins', async () => {
    const { client, insertValues } = createMarkPostClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtSessionsMock.mockResolvedValue([{ memberName: 'Client One' }])
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
      new Request('http://localhost/api/pt/sessions/session-1/mark', {
        method: 'POST',
        body: JSON.stringify({
          status: 'completed',
          note: 'Client completed the workout.',
        }),
      }),
      { params: Promise.resolve({ id: 'session-1' }) },
    )

    expect(response.status).toBe(200)
    expect(insertValues).toEqual([
      {
        session_id: 'session-1',
        requested_by: 'trainer-1',
        requested_status: 'completed',
        note: 'Client completed the workout.',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        recipientId: 'admin-1',
        type: 'status_change_request',
        metadata: {
          requestId: 'update-1',
          sessionId: 'session-1',
          requestedStatus: 'completed',
          trainerId: 'trainer-1',
          memberId: 'member-1',
        },
      }),
      expect.objectContaining({
        recipientId: 'admin-2',
        type: 'status_change_request',
      }),
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      pending: true,
    })
  })

  it('passes the optional status filter through the admin session update list route', async () => {
    getSupabaseAdminClientMock.mockReturnValue({})
    readPtSessionUpdateRequestsMock.mockResolvedValue([])
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/pt/session-update-requests?status=pending'),
    )

    expect(response.status).toBe(200)
    expect(readPtSessionUpdateRequestsMock).toHaveBeenCalledWith({}, { status: 'pending' })
    await expect(response.json()).resolves.toEqual({ requests: [] })
  })

  it('approves a session update request, updates the session, and notifies the trainer', async () => {
    const { client, updates, changeInserts } = createReviewClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readPtSessionUpdateRequestRowByIdMock.mockResolvedValue(createSessionUpdateRow())
    readPtSessionRowByIdMock.mockResolvedValue(createSessionRow())
    readPtSessionUpdateRequestsMock.mockResolvedValue([
      {
        id: 'update-1',
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
      new Request('http://localhost/api/pt/session-update-requests/update-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'Confirmed from attendance log.',
        }),
      }),
      { params: Promise.resolve({ id: 'update-1' }) },
    )

    expect(response.status).toBe(200)
    expect(updates).toEqual([
      {
        table: 'pt_sessions',
        values: expect.objectContaining({
          status: 'completed',
        }),
      },
      {
        table: 'pt_session_update_requests',
        values: expect.objectContaining({
          status: 'approved',
          reviewed_by: 'admin-1',
          review_note: 'Confirmed from attendance log.',
        }),
      },
    ])
    expect(changeInserts).toEqual([
      expect.objectContaining({
        session_id: 'session-1',
        changed_by: 'admin-1',
        change_type: 'status_change',
        new_value: {
          status: 'completed',
        },
      }),
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        recipientId: 'trainer-1',
        type: 'status_change_request',
        metadata: expect.objectContaining({
          sessionId: 'session-1',
          requestId: 'update-1',
          requestedStatus: 'completed',
          reviewNote: 'Confirmed from attendance log.',
          status: 'approved',
        }),
      }),
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: {
        id: 'update-1',
        status: 'approved',
      },
    })
  })
})
