import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  clearFutureRegistrationAttendanceMock,
  getSupabaseAdminClientMock,
  notifyAdminsOfRequestMock,
  readClassByIdMock,
  readClassRegistrationByIdMock,
  readStaffProfileMock,
  reconcileRegistrationAttendanceMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  clearFutureRegistrationAttendanceMock: vi.fn().mockResolvedValue(undefined),
  getSupabaseAdminClientMock: vi.fn(),
  notifyAdminsOfRequestMock: vi.fn().mockResolvedValue(undefined),
  readClassByIdMock: vi.fn(),
  readClassRegistrationByIdMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  reconcileRegistrationAttendanceMock: vi.fn().mockResolvedValue(undefined),
  resolvePermissionsForProfileMock: vi.fn((profile: { role: 'admin' | 'staff' }) => ({
    role: profile.role,
    can: (permission: string) => permission === 'classes.register',
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
}))

vi.mock('@/lib/notify-admins-of-request', () => ({
  notifyAdminsOfRequest: notifyAdminsOfRequestMock,
}))

vi.mock('@/lib/classes-server', () => ({
  readClassById: readClassByIdMock,
  readClassRegistrationById: readClassRegistrationByIdMock,
}))

vi.mock('@/lib/staff', () => ({
  readStaffProfile: readStaffProfileMock,
}))

vi.mock('@/lib/server-permissions', () => ({
  resolvePermissionsForProfile: resolvePermissionsForProfileMock,
}))

vi.mock('@/app/api/classes/_registration-attendance', () => ({
  clearFutureRegistrationAttendance: clearFutureRegistrationAttendanceMock,
  reconcileRegistrationAttendance: reconcileRegistrationAttendanceMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
  }
})

import { PATCH as patchEditRequest } from '@/app/api/classes/registration-edit-requests/[requestId]/route'
import { PATCH as patchRemovalRequest } from '@/app/api/classes/registration-removal-requests/[requestId]/route'
import { POST as postEditRequest } from '@/app/api/classes/registrations/[registrationId]/edit-requests/route'
import { POST as postRemovalRequest } from '@/app/api/classes/registrations/[registrationId]/removal-requests/route'

function buildClass() {
  return {
    id: 'class-1',
    name: 'Weight Loss Club',
    schedule_description: '3 times per week',
    per_session_fee: null,
    monthly_fee: 15500,
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
    registrant_name: 'Client One',
    registrant_type: 'member',
    registrant_email: 'client.one@example.com',
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
    ...overrides,
  }
}

function createEditRequestCreateClient() {
  return {
    client: {
      from(table: string) {
        if (table === 'class_registration_edit_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('registration_id')
                  expect(value).toBe('registration-1')

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
          }
        }

        if (table === 'class_registrations') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, class_id, status')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('registration-1')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'registration-1',
                        class_id: 'class-1',
                        status: 'approved',
                      },
                      error: null,
                    }),
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

function createRemovalRequestCreateClient(options: {
  insertError?: { message: string; code?: string } | null
} = {}) {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
    client: {
      from(table: string) {
        if (table === 'class_registration_removal_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('registration_id')
                  expect(value).toBe('registration-1')

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
                      data: null,
                      error: options.insertError ?? null,
                    }),
                  }
                },
              }
            },
          }
        }

        if (table === 'class_registrations') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, class_id, status, amount_paid')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('registration-1')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'registration-1',
                        class_id: 'class-1',
                        status: 'approved',
                        amount_paid: 12000,
                      },
                      error: null,
                    }),
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
            select() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: options.existingRequest ?? buildEditRequestRecord(),
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

function createRemovalRequestReviewClient(options: {
  existingRequest?: Record<string, unknown> | null
  deletedRegistration?: { id: string } | null
} = {}) {
  const operations: string[] = []
  const requestUpdates: Array<Record<string, unknown>> = []

  return {
    operations,
    requestUpdates,
    client: {
      from(table: string) {
        if (table === 'class_registration_removal_requests') {
          return {
            select() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: options.existingRequest ?? buildRemovalRequestRecord(),
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
                        operations.push('revertRequest')
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

describe('class registration request routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    clearFutureRegistrationAttendanceMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    notifyAdminsOfRequestMock.mockReset()
    readClassByIdMock.mockReset()
    readClassRegistrationByIdMock.mockReset()
    readStaffProfileMock.mockReset()
    reconcileRegistrationAttendanceMock.mockReset()
    resolvePermissionsForProfileMock.mockClear()
    resetServerAuthMocks()
  })

  it('returns 400 when a custom edit request amount is zero', async () => {
    const { client } = createEditRequestCreateClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAuthenticatedUser({
      id: 'user-1',
    })

    const response = await postEditRequest(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-04-15',
          fee_type: 'custom',
          amount_paid: 0,
          payment_received: true,
          notes: null,
        }),
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Custom class fee must be a whole-number JMD amount of at least 1.',
    })
  })

  it('returns 409 when creating a duplicate pending removal request hits the unique index', async () => {
    const removalRequestClient = createRemovalRequestCreateClient({
      insertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(removalRequestClient.client)
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAuthenticatedUser({
      id: 'user-1',
    })

    const response = await postRemovalRequest(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'A pending removal request already exists for this registration.',
    })
    expect(notifyAdminsOfRequestMock).not.toHaveBeenCalled()
  })

  it('uses the effective custom fee type when approving an edit request with a null proposed fee type', async () => {
    const reviewClient = createEditRequestReviewClient({
      existingRequest: buildEditRequestRecord({
        proposed_fee_type: null,
        proposed_amount_paid: 4500,
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(reviewClient.client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock
      .mockResolvedValueOnce(buildRegistration())
      .mockResolvedValueOnce(buildRegistration({ fee_type: 'custom', amount_paid: 4500 }))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchEditRequest(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(reviewClient.registrationUpdates[0]).toMatchObject({
      fee_type: 'custom',
      amount_paid: 4500,
    })
    expect(reviewClient.requestUpdates).toHaveLength(1)
  })

  it('reverts an approved edit request to pending when the registration update no longer matches', async () => {
    const reviewClient = createEditRequestReviewClient({
      updatedRegistrationResult: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(reviewClient.client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchEditRequest(
      new Request('http://localhost', {
        method: 'PATCH',
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
      error: 'This registration can no longer be edited.',
    })
    expect(reviewClient.requestUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
      }),
      expect.objectContaining({
        status: 'pending',
      }),
    ])
    expect(reconcileRegistrationAttendanceMock).not.toHaveBeenCalled()
  })

  it('reverts a removal request to pending when the registration delete no longer matches', async () => {
    const reviewClient = createRemovalRequestReviewClient({
      deletedRegistration: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(reviewClient.client)
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchRemovalRequest(
      new Request('http://localhost', {
        method: 'PATCH',
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
      error: 'This registration can no longer be removed.',
    })
    expect(reviewClient.requestUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
      }),
      expect.objectContaining({
        status: 'pending',
      }),
    ])
    expect(clearFutureRegistrationAttendanceMock).not.toHaveBeenCalled()
  })

  it('clears attendance only after a registration delete succeeds', async () => {
    const reviewClient = createRemovalRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(reviewClient.client)
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    clearFutureRegistrationAttendanceMock.mockImplementation(async () => {
      reviewClient.operations.push('clearAttendance')
    })
    archiveResolvedRequestNotificationsMock.mockImplementation(async () => {
      reviewClient.operations.push('archiveNotifications')
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchRemovalRequest(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'request-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(reviewClient.operations).toEqual([
      'deleteRegistration',
      'clearAttendance',
      'archiveNotifications',
    ])
  })
})
