import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  getSupabaseAdminClientMock,
  readClassByIdMock,
  readClassRegistrationByIdMock,
  reconcileRegistrationAttendanceMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  getSupabaseAdminClientMock: vi.fn(),
  readClassByIdMock: vi.fn(),
  readClassRegistrationByIdMock: vi.fn(),
  reconcileRegistrationAttendanceMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
}))

vi.mock('@/lib/classes-server', () => ({
  readClassById: readClassByIdMock,
  readClassRegistrationById: readClassRegistrationByIdMock,
}))

vi.mock('@/app/api/classes/_registration-attendance', () => ({
  reconcileRegistrationAttendance: reconcileRegistrationAttendanceMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { PATCH } from '@/app/api/classes/registration-edit-requests/[requestId]/route'
import { CLASS_REGISTRATION_EDIT_REQUEST_SELECT } from '@/lib/class-registration-request-records'

function buildClass() {
  return {
    id: 'class-1',
    name: 'Weight Loss Club',
    schedule_description: '3 times per week',
    per_session_fee: 1500,
    monthly_fee: 12000,
    trainer_compensation_pct: 30,
    current_period_start: '2026-04-01',
    created_at: '2026-04-01T00:00:00.000Z',
    trainers: [],
  }
}

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

function buildEditRequestRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'request-1',
    registration_id: 'registration-1',
    class_id: 'class-1',
    requested_by: 'staff-1',
    proposed_fee_type: 'custom',
    proposed_amount_paid: 3200,
    proposed_period_start: '2026-04-15',
    proposed_payment_received: true,
    proposed_notes: 'Updated',
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
      month_start: '2026-04-01',
      fee_type: 'monthly',
      amount_paid: 12000,
      notes: null,
    },
    requestedByProfile: {
      name: 'Jordan Staff',
    },
    reviewedByProfile: null,
    ...overrides,
  }
}

function createEditRequestReviewClient(options: {
  existingRequest?: Record<string, unknown> | null
  updatedRegistrationResult?: { id: string } | null
} = {}) {
  const requestUpdates: Array<Record<string, unknown>> = []
  const registrationUpdates: Array<Record<string, unknown>> = []

  return {
    requestUpdates,
    registrationUpdates,
    client: {
      from(table: string) {
        if (table === 'class_registration_edit_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(CLASS_REGISTRATION_EDIT_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data:
                        options.existingRequest === undefined
                          ? buildEditRequestRecord()
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
            update(values: Record<string, unknown>) {
              registrationUpdates.push(values)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('registration-1')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('approved')

                      return {
                        select(columns: string) {
                          expect(columns).toBe('id')

                          return {
                            maybeSingle: vi.fn().mockResolvedValue({
                              data:
                                'updatedRegistrationResult' in options
                                  ? options.updatedRegistrationResult
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

describe('PATCH /api/classes/registration-edit-requests/[requestId]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    getSupabaseAdminClientMock.mockReset()
    readClassByIdMock.mockReset()
    readClassRegistrationByIdMock.mockReset()
    reconcileRegistrationAttendanceMock.mockReset()
    reconcileRegistrationAttendanceMock.mockResolvedValue(undefined)
    resetServerAuthMocks()
  })

  it('approves an edit request and returns the updated registration', async () => {
    const { client, requestUpdates, registrationUpdates } = createEditRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock
      .mockResolvedValueOnce(buildRegistration())
      .mockResolvedValueOnce(buildRegistration({ fee_type: 'custom', amount_paid: 3200 }))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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
        reviewed_by: 'admin-1',
      }),
    ])
    expect(registrationUpdates[0]).toMatchObject({
      month_start: '2026-04-15',
      fee_type: 'custom',
      amount_paid: 3200,
      notes: 'Updated',
    })
    expect(reconcileRegistrationAttendanceMock).toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      registration: buildRegistration({ fee_type: 'custom', amount_paid: 3200 }),
      amountChanged: true,
    })
  })

  it('rejects an edit request on the happy path', async () => {
    const { client, requestUpdates } = createEditRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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

  it('returns 404 when the edit request is not found', async () => {
    const { client } = createEditRequestReviewClient({
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
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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
      error: 'Class registration edit request not found.',
    })
  })

  it('returns 400 when the edit request was already reviewed', async () => {
    const { client } = createEditRequestReviewClient({
      existingRequest: buildEditRequestRecord({
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
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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

  it('reverts the request to pending when the registration update no longer matches', async () => {
    const { client, requestUpdates } = createEditRequestReviewClient({
      updatedRegistrationResult: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/classes/registration-edit-requests/request-1', {
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
    expect(reconcileRegistrationAttendanceMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This registration can no longer be edited.',
    })
  })
})
