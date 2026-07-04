import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock, readStaffProfileMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
  }
})

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

import { GET, POST } from '@/app/api/pt/payments/route'

const memberId = '11111111-1111-4111-8111-111111111111'
const assignmentId = '22222222-2222-4222-8222-222222222222'
const trainerId = '33333333-3333-4333-8333-333333333333'
const adminId = '44444444-4444-4444-8444-444444444444'

function createProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: adminId,
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    titles: ['Owner'],
    isSuspended: false,
    phone: null,
    gender: null,
    remark: null,
    specialties: [],
    photoUrl: null,
    archivedAt: null,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createSupabasePtPaymentsClient(options: {
  assignment?: Record<string, unknown> | null
  payments?: Array<Record<string, unknown>>
  profiles?: Array<Record<string, unknown>>
  insertError?: { message: string } | null
} = {}) {
  const operations: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []
  const assignment = options.assignment === undefined
    ? {
        id: assignmentId,
        member_id: memberId,
        trainer_id: trainerId,
        status: 'active',
      }
    : options.assignment
  const payments = options.payments ?? []
  const profiles = options.profiles ?? [
    { id: trainerId, name: 'Jordan Trainer' },
    { id: adminId, name: 'Admin User' },
  ]

  return {
    operations,
    inserts,
    client: {
      from(table: string) {
        const builder = {
          select(columns: string) {
            operations.push({ table, type: 'select', columns })
            return this
          },
          eq(column: string, value: string) {
            operations.push({ table, type: 'eq', column, value })
            return this
          },
          order(column: string, options?: { ascending?: boolean }) {
            operations.push({ table, type: 'order', column, ascending: options?.ascending ?? true })
            return this
          },
          in(column: string, values: string[]) {
            operations.push({ table, type: 'in', column, values })
            return Promise.resolve({
              data: profiles.filter((profile) => values.includes(String(profile.id))),
              error: null,
            })
          },
          maybeSingle() {
            if (table === 'trainer_clients') {
              return Promise.resolve({ data: assignment, error: null })
            }

            if (table === 'pt_payments') {
              return Promise.resolve({
                data: {
                  id: 'payment-1',
                  member_id: memberId,
                  assignment_id: assignmentId,
                  trainer_id: trainerId,
                  amount: 15000,
                  months_covered: 1,
                  payment_method: 'cash',
                  notes: null,
                  payment_date: '2026-04-10',
                  recorded_by: adminId,
                  created_at: '2026-04-10T12:00:00.000Z',
                },
                error: options.insertError ?? null,
              })
            }

            return Promise.resolve({ data: null, error: null })
          },
          insert(values: Record<string, unknown>) {
            inserts.push(values)
            operations.push({ table, type: 'insert', values })
            return this
          },
          then(resolve: (value: unknown) => void) {
            if (table === 'pt_payments') {
              resolve({ data: payments, error: null })
              return
            }

            resolve({ data: [], error: null })
          },
        }

        return builder
      },
    },
  }
}

describe('/api/pt/payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    readStaffProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the auth response when unauthenticated', async () => {
    mockUnauthorized()
    const { client } = createSupabasePtPaymentsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request(`http://localhost/api/pt/payments?memberId=${memberId}`))

    expect(response.status).toBe(401)
    expect(readStaffProfileMock).not.toHaveBeenCalled()
  })

  it('rejects non-front-desk staff', async () => {
    mockAuthenticatedUser({ id: adminId })
    readStaffProfileMock.mockResolvedValue(createProfile({
      role: 'staff',
      titles: ['Trainer'],
    }))
    const { client } = createSupabasePtPaymentsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request(`http://localhost/api/pt/payments?memberId=${memberId}`))

    expect(response.status).toBe(403)
  })

  it('allows front desk users to list member PT payments', async () => {
    mockAuthenticatedUser({ id: adminId })
    readStaffProfileMock.mockResolvedValue(createProfile({
      role: 'staff',
      titles: ['Administrative Assistant'],
    }))
    const { client } = createSupabasePtPaymentsClient({
      payments: [
        {
          id: 'payment-1',
          member_id: memberId,
          assignment_id: assignmentId,
          trainer_id: trainerId,
          amount: 15000,
          months_covered: 2,
          payment_method: 'cash',
          notes: 'April and May',
          payment_date: '2026-04-10',
          recorded_by: adminId,
          created_at: '2026-04-10T12:00:00.000Z',
        },
        {
          id: 'payment-2',
          member_id: memberId,
          assignment_id: null,
          trainer_id: null,
          amount: 12000,
          months_covered: 1,
          payment_method: 'bank_transfer',
          notes: null,
          payment_date: '2026-04-09',
          recorded_by: adminId,
          created_at: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request(`http://localhost/api/pt/payments?memberId=${memberId}`))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        id: 'payment-1',
        assignmentId,
        trainerName: 'Jordan Trainer',
        amount: 15000,
        monthsCovered: 2,
        paymentMethod: 'cash',
        notes: 'April and May',
        paymentDate: '2026-04-10',
        recordedBy: 'Admin User',
        createdAt: '2026-04-10T12:00:00.000Z',
      },
      {
        id: 'payment-2',
        assignmentId: null,
        trainerName: 'Unassigned',
        amount: 12000,
        monthsCovered: 1,
        paymentMethod: 'bank_transfer',
        notes: null,
        paymentDate: '2026-04-09',
        recordedBy: 'Admin User',
        createdAt: '2026-04-09T12:00:00.000Z',
      },
    ])
  })

  it('returns 400 when the assignment is missing, mismatched, or inactive', async () => {
    mockAuthenticatedUser({ id: adminId })
    readStaffProfileMock.mockResolvedValue(createProfile())
    const { client } = createSupabasePtPaymentsClient({
      assignment: {
        id: assignmentId,
        member_id: '55555555-5555-4555-8555-555555555555',
        trainer_id: trainerId,
        status: 'active',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/pt/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId,
          assignmentId,
          amount: 15000,
          monthsCovered: 1,
          paymentMethod: 'cash',
          paymentDate: '2026-04-10',
        }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 before insert when the payment date is not a real calendar date', async () => {
    mockAuthenticatedUser({ id: adminId })
    readStaffProfileMock.mockResolvedValue(createProfile())
    const { client, inserts } = createSupabasePtPaymentsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    for (const paymentDate of ['2026-02-30', '2026-13-01']) {
      const response = await POST(
        new Request('http://localhost/api/pt/payments', {
          method: 'POST',
          body: JSON.stringify({
            memberId,
            assignmentId,
            amount: 15000,
            monthsCovered: 1,
            paymentMethod: 'cash',
            paymentDate,
          }),
        }),
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
      })
    }

    expect(inserts).toEqual([])
  })

  it('derives trainer_id from the active assignment when recording a payment', async () => {
    mockAuthenticatedUser({ id: adminId })
    readStaffProfileMock.mockResolvedValue(createProfile())
    const { client, inserts } = createSupabasePtPaymentsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/pt/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId,
          assignmentId,
          amount: 15000,
          monthsCovered: 1,
          paymentMethod: 'cash',
          notes: 'April',
          paymentDate: '2026-04-10',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(inserts).toEqual([
      {
        member_id: memberId,
        assignment_id: assignmentId,
        trainer_id: trainerId,
        amount: 15000,
        months_covered: 1,
        payment_method: 'cash',
        notes: 'April',
        payment_date: '2026-04-10',
        recorded_by: adminId,
      },
    ])
  })

  it('records a payment without an assignment lookup when assignmentId is omitted', async () => {
    mockAuthenticatedUser({ id: adminId })
    readStaffProfileMock.mockResolvedValue(createProfile())
    const { client, inserts, operations } = createSupabasePtPaymentsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/pt/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId,
          amount: 12000,
          monthsCovered: 1,
          paymentMethod: 'bank_transfer',
          paymentDate: '2026-04-10',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(operations.some((operation) => operation.table === 'trainer_clients')).toBe(false)
    expect(inserts).toEqual([
      {
        member_id: memberId,
        assignment_id: null,
        trainer_id: null,
        amount: 12000,
        months_covered: 1,
        payment_method: 'bank_transfer',
        notes: null,
        payment_date: '2026-04-10',
        recorded_by: adminId,
      },
    ])
  })
})
