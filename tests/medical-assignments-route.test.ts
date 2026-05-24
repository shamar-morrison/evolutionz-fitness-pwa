import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockAdminUser, resetServerAuthMocks } from '@/tests/support/server-auth'

const ADMIN_ID = '10000000-0000-4000-8000-000000000001'
const MEDICAL_ID = '10000000-0000-4000-8000-000000000002'
const OTHER_MEDICAL_ID = '10000000-0000-4000-8000-000000000003'
const MEMBER_ID = '10000000-0000-4000-8000-000000000004'
const ASSIGNMENT_ID = '10000000-0000-4000-8000-000000000005'

const {
  getSupabaseAdminClientMock,
  readAuthorizedMedicalProfileMock,
  readMedicalAssignmentByIdMock,
  readMedicalAssignmentsMock,
  readStaffProfileMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readAuthorizedMedicalProfileMock: vi.fn(),
  readMedicalAssignmentByIdMock: vi.fn(),
  readMedicalAssignmentsMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
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

vi.mock('@/lib/medical-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/medical-server')>(
    '@/lib/medical-server',
  )

  return {
    ...actual,
    readAuthorizedMedicalProfile: readAuthorizedMedicalProfileMock,
    readMedicalAssignments: readMedicalAssignmentsMock,
    readMedicalAssignmentById: readMedicalAssignmentByIdMock,
  }
})

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

import { GET, POST } from '@/app/api/medical/assignments/route'

function createMedicalAuthResult(
  overrides: Partial<{
    id: string
    role: 'admin' | 'staff'
    can: (permission: string) => boolean
  }> = {},
) {
  const role = overrides.role ?? 'staff'

  return {
    user: {
      id: overrides.id ?? MEDICAL_ID,
      email: 'medical@evolutionzfitness.com',
    },
    profile: {
      id: overrides.id ?? MEDICAL_ID,
      name: 'Morgan Medical',
      email: 'medical@evolutionzfitness.com',
      role,
      titles: role === 'admin' ? ['Owner'] : ['Medical/Consultant'],
      isSuspended: false,
      phone: null,
      gender: null,
      remark: null,
      specialties: [],
      photoUrl: null,
      archivedAt: null,
      created_at: '2026-05-23T00:00:00.000Z',
    },
    permissions: {
      role,
      can:
        overrides.can ??
        ((permission: string) =>
          role === 'admin' || permission === 'medical.viewAssignments'),
    },
  }
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGNMENT_ID,
    memberId: MEMBER_ID,
    memberName: 'Client One',
    memberType: 'Monthly',
    memberStatus: 'Active',
    memberPhotoUrl: null,
    staffId: MEDICAL_ID,
    staffName: 'Morgan Medical',
    status: 'active',
    followUpDate: '2026-05-30',
    completedAt: null,
    completedBy: null,
    createdBy: ADMIN_ID,
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function createPostClient() {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
    client: {
      from(table: string) {
        if (table !== 'medical_assignments') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            if (columns !== 'id') {
              throw new Error(`Unexpected select columns: ${columns}`)
            }

            return {
              eq(column: string, value: string) {
                expect(column).toBe('member_id')
                expect(value).toBe(MEMBER_ID)

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('staff_id')
                    expect(nextValue).toBe(MEDICAL_ID)

                    return {
                      eq(statusColumn: string, statusValue: string) {
                        expect(statusColumn).toBe('status')
                        expect(statusValue).toBe('active')

                        return {
                          limit(limitValue: number) {
                            expect(limitValue).toBe(1)

                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: null,
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
              },
            }
          },
          insert(values: Record<string, unknown>) {
            insertValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: { id: 'assignment-1' },
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

describe('medical assignments route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    readAuthorizedMedicalProfileMock.mockReset()
    readMedicalAssignmentByIdMock.mockReset()
    readMedicalAssignmentsMock.mockReset()
    readStaffProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('defaults GET requests to active assignments scoped to the authenticated medical staff member', async () => {
    const supabase = { from: vi.fn() }

    getSupabaseAdminClientMock.mockReturnValue(supabase)
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentsMock.mockResolvedValue([])

    const response = await GET(new Request('http://localhost/api/medical/assignments'))

    expect(response.status).toBe(200)
    expect(readMedicalAssignmentsMock).toHaveBeenCalledWith(supabase, {
      staffId: MEDICAL_ID,
      status: 'active',
    })
    await expect(response.json()).resolves.toEqual({ assignments: [] })
  })

  it('allows admins to request completed assignments for any medical staff member', async () => {
    const supabase = { from: vi.fn() }
    const assignments = [buildAssignment({ status: 'completed', staffId: OTHER_MEDICAL_ID })]

    getSupabaseAdminClientMock.mockReturnValue(supabase)
    readAuthorizedMedicalProfileMock.mockResolvedValue(
      createMedicalAuthResult({
        id: ADMIN_ID,
        role: 'admin',
      }),
    )
    readMedicalAssignmentsMock.mockResolvedValue(assignments)

    const response = await GET(
      new Request(
        `http://localhost/api/medical/assignments?staffId=${OTHER_MEDICAL_ID}&status=completed`,
      ),
    )

    expect(response.status).toBe(200)
    expect(readMedicalAssignmentsMock).toHaveBeenCalledWith(supabase, {
      staffId: OTHER_MEDICAL_ID,
      status: 'completed',
    })
    await expect(response.json()).resolves.toEqual({ assignments })
  })

  it('rejects GET requests that try to read another staff member’s assignments', async () => {
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())

    const response = await GET(
      new Request(
        `http://localhost/api/medical/assignments?staffId=${OTHER_MEDICAL_ID}&status=completed`,
      ),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
    expect(readMedicalAssignmentsMock).not.toHaveBeenCalled()
  })

  it('rejects GET requests from staff profiles without medical assignment access', async () => {
    readAuthorizedMedicalProfileMock.mockResolvedValue(
      createMedicalAuthResult({
        can: () => false,
      }),
    )

    const response = await GET(new Request('http://localhost/api/medical/assignments'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('rejects POST requests when the selected staff member is not medical staff', async () => {
    const { client } = createPostClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      user: { id: ADMIN_ID },
      profile: { id: ADMIN_ID, role: 'admin', titles: ['Owner'] },
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'assistant-1',
      name: 'Avery Assistant',
      email: 'assistant@evolutionzfitness.com',
      role: 'staff',
      titles: ['Assistant'],
      isSuspended: false,
      phone: null,
      gender: null,
      remark: null,
      specialties: [],
      photoUrl: null,
      archivedAt: null,
      created_at: '2026-05-23T00:00:00.000Z',
    })

    const response = await POST(
      new Request('http://localhost/api/medical/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: MEMBER_ID,
          staffId: OTHER_MEDICAL_ID,
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'The selected staff member is not assigned the Medical/Consultant title.',
    })
  })

  it('creates a medical assignment for admins', async () => {
    const { client, insertValues } = createPostClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      user: { id: ADMIN_ID },
      profile: { id: ADMIN_ID, role: 'admin', titles: ['Owner'] },
    })
    readStaffProfileMock.mockResolvedValue({
      id: MEDICAL_ID,
      name: 'Morgan Medical',
      email: 'medical@evolutionzfitness.com',
      role: 'staff',
      titles: ['Medical/Consultant'],
      isSuspended: false,
      phone: null,
      gender: null,
      remark: null,
      specialties: [],
      photoUrl: null,
      archivedAt: null,
      created_at: '2026-05-23T00:00:00.000Z',
    })
    readMedicalAssignmentByIdMock.mockResolvedValue(buildAssignment({ followUpDate: null }))

    const response = await POST(
      new Request('http://localhost/api/medical/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: MEMBER_ID,
          staffId: MEDICAL_ID,
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(insertValues).toEqual([
      {
        member_id: MEMBER_ID,
        staff_id: MEDICAL_ID,
        status: 'active',
        follow_up_date: null,
        created_by: ADMIN_ID,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assignment: buildAssignment({ followUpDate: null }),
    })
  })

  it('ignores stale follow-up dates in POST requests', async () => {
    const { client, insertValues } = createPostClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      user: { id: ADMIN_ID },
      profile: { id: ADMIN_ID, role: 'admin', titles: ['Owner'] },
    })
    readStaffProfileMock.mockResolvedValue({
      id: MEDICAL_ID,
      name: 'Morgan Medical',
      email: 'medical@evolutionzfitness.com',
      role: 'staff',
      titles: ['Medical/Consultant'],
      isSuspended: false,
      phone: null,
      gender: null,
      remark: null,
      specialties: [],
      photoUrl: null,
      archivedAt: null,
      created_at: '2026-05-23T00:00:00.000Z',
    })
    readMedicalAssignmentByIdMock.mockResolvedValue(buildAssignment({ followUpDate: null }))

    const response = await POST(
      new Request('http://localhost/api/medical/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: MEMBER_ID,
          staffId: MEDICAL_ID,
          followUpDate: '2026-05-30',
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(insertValues).toEqual([
      {
        member_id: MEMBER_ID,
        staff_id: MEDICAL_ID,
        status: 'active',
        follow_up_date: null,
        created_by: ADMIN_ID,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assignment: buildAssignment({ followUpDate: null }),
    })
  })

  it('rejects duplicate active assignments for the same client and medical staff member', async () => {
    const duplicateCheckClient = {
      from(table: string) {
        expect(table).toBe('medical_assignments')

        return {
          select(columns: string) {
            expect(columns).toBe('id')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('member_id')
                expect(value).toBe(MEMBER_ID)

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('staff_id')
                    expect(nextValue).toBe(MEDICAL_ID)

                    return {
                      eq(statusColumn: string, statusValue: string) {
                        expect(statusColumn).toBe('status')
                        expect(statusValue).toBe('active')

                        return {
                          limit(limitValue: number) {
                            expect(limitValue).toBe(1)

                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: { id: ASSIGNMENT_ID },
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
              },
            }
          },
        }
      },
    }

    getSupabaseAdminClientMock.mockReturnValue(duplicateCheckClient)
    mockAdminUser({
      user: { id: ADMIN_ID },
      profile: { id: ADMIN_ID, role: 'admin', titles: ['Owner'] },
    })
    readStaffProfileMock.mockResolvedValue({
      id: MEDICAL_ID,
      name: 'Morgan Medical',
      email: 'medical@evolutionzfitness.com',
      role: 'staff',
      titles: ['Medical/Consultant'],
      isSuspended: false,
      phone: null,
      gender: null,
      remark: null,
      specialties: [],
      photoUrl: null,
      archivedAt: null,
      created_at: '2026-05-23T00:00:00.000Z',
    })

    const response = await POST(
      new Request('http://localhost/api/medical/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: MEMBER_ID,
          staffId: MEDICAL_ID,
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'This staff member already has an active medical assignment for the selected client.',
    })
    expect(readMedicalAssignmentByIdMock).not.toHaveBeenCalled()
  })
})
