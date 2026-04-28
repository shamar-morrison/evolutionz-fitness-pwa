import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  clearFutureRegistrationAttendanceMock,
  getSupabaseAdminClientMock,
  readClassRegistrationByIdMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  clearFutureRegistrationAttendanceMock: vi.fn().mockResolvedValue(undefined),
  getSupabaseAdminClientMock: vi.fn(),
  readClassRegistrationByIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
}))

vi.mock('@/app/api/classes/_registration-attendance', () => ({
  clearFutureRegistrationAttendance: clearFutureRegistrationAttendanceMock,
}))

vi.mock('@/lib/classes-server', () => ({
  readClassRegistrationById: readClassRegistrationByIdMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { PATCH } from '@/app/api/classes/registration-removal-requests/[requestId]/route'
import { CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT } from '@/lib/class-registration-request-records'

function buildRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'registration-1',
    class_id: 'class-1',
    member_id: 'member-1',
    guest_profile_id: null,
    month_start: '2026-04-01',
    status: 'approved',
    fee_type: 'monthly',
    amount_paid: 12000,
    payment_recorded_at: '2026-04-12T12:00:00.000Z',
    notes: null,
    receipt_number: null,
    receipt_sent_at: null,
    reviewed_by: 'admin-1',
    reviewed_at: '2026-04-12T12:00:00.000Z',
    review_note: null,
    created_at: '2026-04-10T12:00:00.000Z',
    registrant_name: 'Jane Doe',
    registrant_type: 'member',
    registrant_email: 'jane@example.com',
    ...overrides,
  }
}

function buildRemovalRequestRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'request-1',
    registration_id: 'registration-1',
    class_id: 'class-1',
    requested_by: 'staff-1',
    amount_paid_at_request: 12000,
    status: 'pending',
    reviewed_by: null,
    review_timestamp: null,
    created_at: '2026-04-12T12:00:00.000Z',
    class: {
      name: 'Weight Loss Club',
    },
    registration: {
      id: 'registration-1',
      member_id: 'member-1',
      guest_profile_id: null,
    },
    requestedByProfile: {
      name: 'Jordan Staff',
    },
    reviewedByProfile: null,
    ...overrides,
  }
}

function createRemovalRequestReviewClient(options: {
  existingRequest?: Record<string, unknown> | null
  deletedRegistration?: { id: string } | null
  operations?: string[]
} = {}) {
  const requestUpdates: Array<Record<string, unknown>> = []
  const operations = options.operations ?? []

  return {
    requestUpdates,
    operations,
    client: {
      from(table: string) {
        if (table === 'class_registration_removal_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data:
                        options.existingRequest === undefined
                          ? buildRemovalRequestRecord()
                          : options.existingRequest,
                      error: null,
                    }),
                  }
                },
              }
            },
            update(values: Record<string, unknown>) {
              requestUpdates.push(values)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(['pending', 'approved']).toContain(nextValue)

                      if (nextValue === 'approved') {
                        return Promise.resolve({
                          data: null,
                          error: null,
                        })
                      }

                      return {
                        select(columns: string) {
                          expect(columns).toBe('id')

                          return Promise.resolve({
                            data: [{ id: 'request-1' }],
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

        if (table === 'class_registrations') {
          return {
            delete() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('registration-1')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('approved')
                      operations.push('deleteRegistration')

                      return {
                        select(columns: string) {
                          expect(columns).toBe('id')

                          return {
                            maybeSingle: vi.fn().mockResolvedValue({
                              data:
                                'deletedRegistration' in options
                                  ? options.deletedRegistration
                                  : { id: 'registration-1' },
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

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('PATCH /api/classes/registration-removal-requests/[requestId]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    clearFutureRegistrationAttendanceMock.mockReset()
    clearFutureRegistrationAttendanceMock.mockResolvedValue(undefined)
    getSupabaseAdminClientMock.mockReset()
    readClassRegistrationByIdMock.mockReset()
    resetServerAuthMocks()
  })

  it('approves a removal request after deleting the registration and clearing attendance', async () => {
    const operations: string[] = []
    const { client } = createRemovalRequestReviewClient({
      operations,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    clearFutureRegistrationAttendanceMock.mockImplementation(async () => {
      operations.push('clearAttendance')
    })
    archiveResolvedRequestNotificationsMock.mockImplementation(async () => {
      operations.push('archiveNotifications')
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(operations).toEqual([
      'deleteRegistration',
      'clearAttendance',
      'archiveNotifications',
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      classId: 'class-1',
      amountPaid: 12000,
    })
  })

  it('rejects a removal request on the happy path', async () => {
    const { client, requestUpdates } = createRemovalRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reviewed_by: 'admin-1',
      }),
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mockUnauthorized()

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the request is forbidden', async () => {
    mockForbidden()

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns 404 when the removal request is not found', async () => {
    const { client } = createRemovalRequestReviewClient({
      existingRequest: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Class registration removal request not found.',
    })
  })

  it('returns 400 when the removal request was already reviewed', async () => {
    const { client } = createRemovalRequestReviewClient({
      existingRequest: buildRemovalRequestRecord({
        status: 'approved',
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('reverts the request to pending when the registration delete no longer matches', async () => {
    const { client, requestUpdates } = createRemovalRequestReviewClient({
      deletedRegistration: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-removal-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
      }),
      expect.objectContaining({
        status: 'pending',
        reviewed_by: null,
        review_timestamp: null,
      }),
    ])
    expect(clearFutureRegistrationAttendanceMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This registration can no longer be removed.',
    })
  })
})
