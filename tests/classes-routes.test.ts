import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockForbidden,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'
import type { Profile } from '@/types'

const {
  getSupabaseAdminClientMock,
  readClassByIdMock,
  readClassesMock,
  readClassRegistrationByIdMock,
  readClassRegistrationsMock,
  readStaffProfileMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readClassByIdMock: vi.fn(),
  readClassesMock: vi.fn(),
  readClassRegistrationByIdMock: vi.fn(),
  readClassRegistrationsMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/classes-server', () => ({
  readClasses: readClassesMock,
  readClassById: readClassByIdMock,
  readClassRegistrations: readClassRegistrationsMock,
  readClassRegistrationById: readClassRegistrationByIdMock,
}))

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET as getClasses } from '@/app/api/classes/route'
import { GET as getClass, PATCH as patchClass } from '@/app/api/classes/[id]/route'
import {
  GET as getClassRegistrations,
  POST as postClassRegistration,
} from '@/app/api/classes/[id]/registrations/route'
import { PATCH as patchClassRegistration } from '@/app/api/classes/[id]/registrations/[registrationId]/route'

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Admin User',
    email: overrides.email ?? 'admin@evolutionzfitness.com',
    role: overrides.role ?? 'admin',
    titles: overrides.titles ?? ['Owner'],
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-08T00:00:00.000Z',
  }
}

function buildClass(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'class-1',
    name: 'Weight Loss Club',
    schedule_description: '3 times per week',
    per_session_fee: null,
    monthly_fee: 15500,
    trainer_compensation_pct: 30,
    current_period_start: '2026-04-01',
    created_at: '2026-04-01T00:00:00.000Z',
    trainers: [
      {
        id: 'trainer-1',
        name: 'Jordan Trainer',
        titles: ['Trainer'],
      },
    ],
    ...overrides,
  }
}

function buildRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'registration-1',
    class_id: 'class-1',
    member_id: 'member-1',
    guest_profile_id: null,
    month_start: '2026-04-10',
    status: 'approved',
    amount_paid: 15500,
    payment_recorded_at: '2026-04-08T12:00:00.000Z',
    reviewed_by: 'user-1',
    reviewed_at: '2026-04-08T12:05:00.000Z',
    review_note: null,
    created_at: '2026-04-08T12:00:00.000Z',
    registrant_name: 'Client One',
    registrant_type: 'member',
    ...overrides,
  }
}

function createClassPatchClient() {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('classes')

        return {
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('class-1')

                return {
                  select(columns: string) {
                    expect(columns).toBe('id')

                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: 'class-1' },
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
    },
  }
}

function createRegistrationPostClient(options: {
  registrationError?: { message: string; code?: string } | null
} = {}) {
  const memberId = '11111111-1111-1111-1111-111111111111'
  const registrationValues: Array<Record<string, unknown>> = []
  const guestDeletes: string[] = []
  const guestInserts: Array<Record<string, unknown>> = []

  return {
    registrationValues,
    guestDeletes,
    guestInserts,
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, status')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(memberId)

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: memberId, status: 'Active' },
                      error: null,
                    }),
                  }
                },
              }
            },
          }
        }

        if (table === 'guest_profiles') {
          return {
            insert(values: Record<string, unknown>) {
              guestInserts.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe('id')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'guest-1' },
                      error: null,
                    }),
                  }
                },
              }
            },
            delete() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  guestDeletes.push(value)

                  return Promise.resolve({
                    error: null,
                  })
                },
              }
            },
          }
        }

        expect(table).toBe('class_registrations')

        return {
          insert(values: Record<string, unknown>) {
            registrationValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: options.registrationError ? null : { id: 'registration-1' },
                    error: options.registrationError ?? null,
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

function createRegistrationReviewClient(options: {
  reviewState?: { id: string; class_id: string; status: string } | null
} = {}) {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('class_registrations')

        return {
          select(columns: string) {
            expect(columns).toBe('id, class_id, status')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('registration-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('class_id')
                    expect(nextValue).toBe('class-1')

                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data:
                          options.reviewState ?? {
                            id: 'registration-1',
                            class_id: 'class-1',
                            status: 'pending',
                          },
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('registration-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('class_id')
                    expect(nextValue).toBe('class-1')

                    return Promise.resolve({
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      },
    },
  }
}

describe('classes routes', () => {
  afterEach(() => {
    resetServerAuthMocks()
    vi.clearAllMocks()
  })

  it('returns the classes list for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassesMock.mockResolvedValue([buildClass()])

    const response = await getClasses()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.classes).toHaveLength(1)
    expect(readClassesMock).toHaveBeenCalled()
  })

  it('returns a single class detail for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())

    const response = await getClass(new Request('http://localhost/api/classes/class-1'), {
      params: Promise.resolve({ id: 'class-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.class.name).toBe('Weight Loss Club')
  })

  it('blocks period-start updates for non-admin users', async () => {
    mockForbidden()

    const response = await patchClass(
      new Request('http://localhost/api/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ current_period_start: '2026-04-08' }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(403)
  })

  it('updates the current period start for admins', async () => {
    mockAdminUser()
    const { client, updateValues } = createClassPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass({ current_period_start: '2026-04-08' }))

    const response = await patchClass(
      new Request('http://localhost/api/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ current_period_start: '2026-04-08' }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([{ current_period_start: '2026-04-08' }])
    expect(body.class.current_period_start).toBe('2026-04-08')
  })

  it('uses the requested status filter for admin registration reads', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile())
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationsMock.mockResolvedValue([buildRegistration({ status: 'pending' })])

    const response = await getClassRegistrations(
      new Request('http://localhost/api/classes/class-1/registrations?status=pending'),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(readClassRegistrationsMock).toHaveBeenCalledWith({}, 'class-1', {
      status: 'pending',
    })
  })

  it('forces approved-only registration reads for staff users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationsMock.mockResolvedValue([buildRegistration()])

    const response = await getClassRegistrations(
      new Request('http://localhost/api/classes/class-1/registrations?status=denied'),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(readClassRegistrationsMock).toHaveBeenCalledWith({}, 'class-1', {
      status: 'approved',
    })
  })

  it('forces pending status when staff create registrations', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration({ status: 'pending' }))
    const { client, registrationValues } = createRegistrationPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'member',
          member_id: '11111111-1111-1111-1111-111111111111',
          month_start: '2026-04-10',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(registrationValues[0]?.status).toBe('pending')
    expect(body.registration.status).toBe('pending')
  })

  it('forces approved status when admins create registrations', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'admin', titles: ['Owner'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration({ status: 'approved' }))
    const { client, registrationValues } = createRegistrationPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'member',
          member_id: '11111111-1111-1111-1111-111111111111',
          month_start: '2026-04-10',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(registrationValues[0]?.status).toBe('approved')
    expect(body.registration.status).toBe('approved')
  })

  it('rolls back a guest profile if registration creation fails after the guest insert', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile())
    readClassByIdMock.mockResolvedValue(buildClass())
    const { client, guestDeletes } = createRegistrationPostClient({
      registrationError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'guest',
          guest: {
            name: 'Guest One',
          },
          month_start: '2026-04-10',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(guestDeletes).toEqual(['guest-1'])
    expect(body.error).toContain('A registration already exists')
  })

  it('requires a denial reason when denying a registration', async () => {
    mockAdminUser()

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'denied',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(400)
  })

  it('updates review metadata when approving a registration', async () => {
    mockAdminUser({
      profile: {
        id: 'admin-1',
      },
    })
    readClassRegistrationByIdMock.mockResolvedValue(
      buildRegistration({
        status: 'approved',
        amount_paid: 3200,
        review_note: 'Paid at the desk.',
      }),
    )
    const { client, updateValues } = createRegistrationReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          amount_paid: 3200,
          review_note: 'Paid at the desk.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues[0]).toMatchObject({
      status: 'approved',
      amount_paid: 3200,
      review_note: 'Paid at the desk.',
      reviewed_by: 'admin-1',
    })
    expect(body.registration.amount_paid).toBe(3200)
  })
})
