import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  notifyAdminsOfRequestMock,
  readClassByIdMock,
  readClassRegistrationByIdMock,
  readStaffProfileMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  notifyAdminsOfRequestMock: vi.fn().mockResolvedValue(undefined),
  readClassByIdMock: vi.fn(),
  readClassRegistrationByIdMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  resolvePermissionsForProfileMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
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

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
  }
})

import { POST } from '@/app/api/classes/registrations/[registrationId]/edit-requests/route'

function createPermissions(options: { allowed?: boolean; role?: 'admin' | 'staff' } = {}) {
  return {
    role: options.role ?? 'staff',
    can: (permission: string) => permission === 'classes.register' && (options.allowed ?? true),
  }
}

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
    registrant_name: 'Jane Doe',
    amount_paid_display: '12000',
    ...overrides,
  }
}

function createEditRequestCreateClient(options: {
  existingPendingRequest?: { id: string } | null
  registrationStatus?: 'approved' | 'pending'
} = {}) {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
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
                              data: options.existingPendingRequest ?? null,
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
                        status: options.registrationStatus ?? 'approved',
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

describe('POST /api/classes/registrations/[registrationId]/edit-requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    notifyAdminsOfRequestMock.mockReset()
    notifyAdminsOfRequestMock.mockResolvedValue(undefined)
    readClassByIdMock.mockReset()
    readClassRegistrationByIdMock.mockReset()
    readStaffProfileMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates an edit request for staff and notifies admins', async () => {
    const { client, insertValues } = createEditRequestCreateClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/classes/registrations/registration-1/edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          period_start: '2026-04-15',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: ' Updated ',
        }),
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(insertValues).toEqual([
      {
        registration_id: 'registration-1',
        class_id: 'class-1',
        requested_by: 'staff-1',
        proposed_fee_type: 'custom',
        proposed_amount_paid: 3200,
        proposed_period_start: '2026-04-15',
        proposed_payment_received: true,
        proposed_notes: 'Updated',
      },
    ])
    expect(notifyAdminsOfRequestMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: 'class_registration_edit_request',
        url: '/pending-approvals/class-registration-requests',
      }),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requestId: 'request-1',
    })
  })

  it('returns 401 when the user is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/classes/registrations/registration-1/edit-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(notifyAdminsOfRequestMock).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the staff profile lacks class registration permission', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createEditRequestCreateClient().client)
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    resolvePermissionsForProfileMock.mockReturnValue(
      createPermissions({
        allowed: false,
      }),
    )
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/classes/registrations/registration-1/edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          period_start: '2026-04-15',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: null,
        }),
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(notifyAdminsOfRequestMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('returns 400 when the registration is not approved', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createEditRequestCreateClient({
        registrationStatus: 'pending',
      }).client,
    )
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/classes/registrations/registration-1/edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          period_start: '2026-04-15',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: null,
        }),
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(notifyAdminsOfRequestMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only approved registrations can be edited.',
    })
  })

  it('returns 400 when a custom fee amount is zero', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createEditRequestCreateClient().client)
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/classes/registrations/registration-1/edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

    expect(notifyAdminsOfRequestMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Custom class fee must be a whole-number JMD amount of at least 1.',
    })
  })
})
