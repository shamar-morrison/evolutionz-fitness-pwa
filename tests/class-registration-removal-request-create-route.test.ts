import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  notifyAdminsOfRequestMock,
  readClassRegistrationByIdMock,
  readStaffProfileMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  notifyAdminsOfRequestMock: vi.fn().mockResolvedValue(undefined),
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

import { POST } from '@/app/api/classes/registrations/[registrationId]/removal-requests/route'

function createPermissions(options: { allowed?: boolean; role?: 'admin' | 'staff' } = {}) {
  return {
    role: options.role ?? 'staff',
    can: (permission: string) => permission === 'classes.register' && (options.allowed ?? true),
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
    ...overrides,
  }
}

function createRemovalRequestCreateClient(options: {
  existingPendingRequest?: { id: string } | null
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
                      data: options.insertError ? null : { id: 'request-1' },
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

describe('POST /api/classes/registrations/[registrationId]/removal-requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    notifyAdminsOfRequestMock.mockReset()
    notifyAdminsOfRequestMock.mockResolvedValue(undefined)
    readClassRegistrationByIdMock.mockReset()
    readStaffProfileMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates a removal request for staff and notifies admins', async () => {
    const { client, insertValues } = createRemovalRequestCreateClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue({
      id: 'staff-1',
      role: 'staff',
    })
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/classes/registrations/registration-1/removal-requests', {
        method: 'POST',
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
        amount_paid_at_request: 12000,
      },
    ])
    expect(notifyAdminsOfRequestMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: 'class_registration_removal_request',
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
      new Request('http://localhost/api/classes/registrations/registration-1/removal-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the staff profile lacks class registration permission', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createRemovalRequestCreateClient().client)
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
      new Request('http://localhost/api/classes/registrations/registration-1/removal-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('returns 409 when a duplicate pending removal request already exists', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createRemovalRequestCreateClient({
        existingPendingRequest: {
          id: 'request-1',
        },
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
      new Request('http://localhost/api/classes/registrations/registration-1/removal-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ registrationId: 'registration-1' }),
      },
    )

    expect(readClassRegistrationByIdMock).not.toHaveBeenCalled()
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'A pending removal request already exists for this registration.',
    })
  })
})
