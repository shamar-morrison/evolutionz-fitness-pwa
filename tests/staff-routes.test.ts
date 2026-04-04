import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const { createClientMock, getSupabaseAdminClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET as getStaff, POST as postStaff } from '@/app/api/staff/route'
import {
  DELETE as deleteStaff,
  GET as getStaffDetail,
  PATCH as patchStaff,
} from '@/app/api/staff/[id]/route'
import { STAFF_PROFILE_SELECT } from '@/lib/staff'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function buildProfileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'staff-1',
    name: 'Admin User',
    email: 'admin@evolutionzfitness.com',
    role: 'admin',
    title: 'Owner',
    phone: null,
    gender: null,
    remark: null,
    specialties: [],
    photoUrl: null,
    created_at: '2026-04-03T00:00:00.000Z',
    ...overrides,
  }
}

function createStaffServerClient({
  listRows = [],
  listError = null,
  detailRow = null,
  detailError = null,
}: {
  listRows?: Array<Record<string, unknown>>
  listError?: { message: string } | null
  detailRow?: Record<string, unknown> | null
  detailError?: { message: string } | null
} = {}) {
  return {
    from(table: string) {
      expect(table).toBe('profiles')

      return {
        select(columns: string) {
          expect(columns).toBe(STAFF_PROFILE_SELECT)

          return {
            order(column: string, options: { ascending: boolean }) {
              expect(column).toBe('created_at')
              expect(options).toEqual({ ascending: true })

              return Promise.resolve({
                data: listRows,
                error: listError,
              })
            },
            eq(column: string, value: string) {
              expect(column).toBe('id')
              expect(value).toBeDefined()

              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: detailRow,
                    error: detailError,
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

function createStaffAdminClient({
  detailReads = [buildProfileRow()],
  insertResult = {
    data: buildProfileRow(),
    error: null,
  } satisfies QueryResult<Record<string, unknown>>,
  updateResult = {
    data: buildProfileRow(),
    error: null,
  } satisfies QueryResult<Record<string, unknown>>,
  deleteResult = {
    data: buildProfileRow(),
    error: null,
  } satisfies QueryResult<Record<string, unknown>>,
  createUserResult = {
    data: {
      user: {
        id: 'staff-1',
      },
    },
    error: null,
  },
  deleteUserResult = {
    data: {},
    error: null,
  },
  removeResult = {
    data: [],
    error: null,
  },
}: {
  detailReads?: Array<Record<string, unknown> | null>
  insertResult?: QueryResult<Record<string, unknown>>
  updateResult?: QueryResult<Record<string, unknown>>
  deleteResult?: QueryResult<Record<string, unknown>>
  createUserResult?: {
    data: {
      user: {
        id: string
      } | null
    }
    error: { message: string } | null
  }
  deleteUserResult?: {
    data: unknown
    error: { message: string } | null
  }
  removeResult?: {
    data: unknown
    error: { message: string } | null
  }
} = {}) {
  const createUserCalls: Array<{ email: string; password: string; email_confirm: boolean }> = []
  const deleteUserCalls: string[] = []
  const insertValues: Array<Record<string, unknown>> = []
  const updateValues: Array<Record<string, unknown>> = []
  const removeCalls: string[][] = []
  const signedUrlCalls: string[] = []
  let detailReadIndex = 0

  return {
    client: {
      auth: {
        admin: {
          createUser(input: { email: string; password: string; email_confirm: boolean }) {
            createUserCalls.push(input)
            return Promise.resolve(createUserResult)
          },
          deleteUser(userId: string) {
            deleteUserCalls.push(userId)
            return Promise.resolve(deleteUserResult)
          },
        },
      },
      from(table: string) {
        expect(table).toBe('profiles')

        return {
          select(columns: string) {
            expect(columns).toBe(STAFF_PROFILE_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBeDefined()

                return {
                  maybeSingle() {
                    const nextRow =
                      detailReads[Math.min(detailReadIndex, detailReads.length - 1)] ?? null
                    detailReadIndex += 1

                    return Promise.resolve({
                      data: nextRow,
                      error: null,
                    })
                  },
                }
              },
            }
          },
          insert(values: Record<string, unknown>) {
            insertValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe(STAFF_PROFILE_SELECT)

                return {
                  maybeSingle() {
                    return Promise.resolve(insertResult)
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
                expect(value).toBeDefined()

                return {
                  select(columns: string) {
                    expect(columns).toBe(STAFF_PROFILE_SELECT)

                    return {
                      maybeSingle() {
                        return Promise.resolve(updateResult)
                      },
                    }
                  },
                }
              },
            }
          },
          delete() {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBeDefined()

                return {
                  select(columns: string) {
                    expect(columns).toBe(STAFF_PROFILE_SELECT)

                    return {
                      maybeSingle() {
                        return Promise.resolve(deleteResult)
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe('staff-photos')

          return {
            createSignedUrl(path: string, expiresIn: number) {
              signedUrlCalls.push(path)
              expect(expiresIn).toBe(3600)

              return Promise.resolve({
                data: { signedUrl: `https://signed.example.com/${path}` },
                error: null,
              })
            },
            remove(paths: string[]) {
              removeCalls.push(paths)
              return Promise.resolve(removeResult)
            },
          }
        },
      },
    },
    createUserCalls,
    deleteUserCalls,
    insertValues,
    updateValues,
    removeCalls,
    signedUrlCalls,
  }
}

describe('staff API routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns staff ordered by created_at ascending and signs list photos', async () => {
    createClientMock.mockResolvedValue(
      createStaffServerClient({
        listRows: [
          buildProfileRow({
            id: 'staff-1',
            name: 'Owner One',
            photoUrl: 'staff-1.jpg',
            created_at: '2026-04-01T00:00:00.000Z',
          }),
          buildProfileRow({
            id: 'staff-2',
            name: 'Trainer Two',
            role: 'staff',
            title: 'Trainer',
            specialties: ['HIIT', 'Strength Training'],
            created_at: '2026-04-02T00:00:00.000Z',
          }),
        ],
      }),
    )
    const { client, signedUrlCalls } = createStaffAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await getStaff()

    expect(response.status).toBe(200)
    expect(signedUrlCalls).toEqual(['staff-1.jpg'])
    await expect(response.json()).resolves.toEqual({
      staff: [
        {
          id: 'staff-1',
          name: 'Owner One',
          email: 'admin@evolutionzfitness.com',
          role: 'admin',
          title: 'Owner',
          phone: null,
          gender: null,
          remark: null,
          specialties: [],
          photoUrl: 'https://signed.example.com/staff-1.jpg',
          created_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'staff-2',
          name: 'Trainer Two',
          email: 'admin@evolutionzfitness.com',
          role: 'staff',
          title: 'Trainer',
          phone: null,
          gender: null,
          remark: null,
          specialties: ['Strength Training', 'HIIT'],
          photoUrl: null,
          created_at: '2026-04-02T00:00:00.000Z',
        },
      ],
    })
  })

  it('returns 401 when the staff list is requested without a session', async () => {
    mockUnauthorized()

    const response = await getStaff()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when a non-admin requests the staff list', async () => {
    mockForbidden()

    const response = await getStaff()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('creates a staff account, derives the role from title, and confirms email immediately', async () => {
    const { client, createUserCalls, insertValues } = createStaffAdminClient({
      insertResult: {
        data: buildProfileRow({
          id: 'staff-8',
          name: 'Taylor Admin',
          email: 'taylor@evolutionzfitness.com',
          role: 'admin',
          title: 'Owner',
          phone: '876-555-0101',
          gender: 'female',
          remark: 'Handles billing',
          specialties: [],
        }),
        error: null,
      },
      createUserResult: {
        data: {
          user: {
            id: 'staff-8',
          },
        },
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Taylor Admin',
          email: 'taylor@evolutionzfitness.com',
          password: 'password123',
          phone: '876-555-0101',
          gender: 'female',
          remark: 'Handles billing',
          title: 'Owner',
          specialties: ['HIIT'],
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(createUserCalls).toEqual([
      {
        email: 'taylor@evolutionzfitness.com',
        password: 'password123',
        email_confirm: true,
      },
    ])
    expect(insertValues).toEqual([
      {
        id: 'staff-8',
        name: 'Taylor Admin',
        email: 'taylor@evolutionzfitness.com',
        role: 'admin',
        title: 'Owner',
        phone: '876-555-0101',
        gender: 'female',
        remark: 'Handles billing',
        specialties: [],
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-8',
        name: 'Taylor Admin',
        email: 'taylor@evolutionzfitness.com',
        role: 'admin',
        title: 'Owner',
        phone: '876-555-0101',
        gender: 'female',
        remark: 'Handles billing',
        specialties: [],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('creates a trainer with specialties in shared constant order', async () => {
    const { client, insertValues } = createStaffAdminClient({
      insertResult: {
        data: buildProfileRow({
          id: 'staff-10',
          name: 'Coach Kai',
          email: 'kai@evolutionzfitness.com',
          role: 'staff',
          title: 'Trainer',
          specialties: ['Strength Training', 'HIIT', 'Recovery Training'],
        }),
        error: null,
      },
      createUserResult: {
        data: {
          user: {
            id: 'staff-10',
          },
        },
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Coach Kai',
          email: 'kai@evolutionzfitness.com',
          password: 'password123',
          title: 'Trainer',
          specialties: ['HIIT', 'Strength Training', 'Recovery Training'],
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(insertValues).toEqual([
      {
        id: 'staff-10',
        name: 'Coach Kai',
        email: 'kai@evolutionzfitness.com',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT', 'Recovery Training'],
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-10',
        name: 'Coach Kai',
        email: 'kai@evolutionzfitness.com',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT', 'Recovery Training'],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('clears specialties when creating a non-trainer even if the request submits them', async () => {
    const { client, insertValues } = createStaffAdminClient({
      insertResult: {
        data: buildProfileRow({
          id: 'staff-11',
          name: 'Desk Lead',
          email: 'desk@evolutionzfitness.com',
          role: 'admin',
          title: 'Owner',
          specialties: [],
        }),
        error: null,
      },
      createUserResult: {
        data: {
          user: {
            id: 'staff-11',
          },
        },
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Desk Lead',
          email: 'desk@evolutionzfitness.com',
          password: 'password123',
          title: 'Owner',
          specialties: ['Strength Training', 'HIIT'],
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(insertValues[0]?.specialties).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-11',
        name: 'Desk Lead',
        email: 'desk@evolutionzfitness.com',
        role: 'admin',
        title: 'Owner',
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('rejects invalid staff creation payloads', async () => {
    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Invalid User',
          email: 'not-an-email',
          password: 'short',
          title: 'Trainer',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('email'),
    })
  })

  it('rejects other as a writable staff gender during creation', async () => {
    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Invalid Gender',
          email: 'invalid-gender@evolutionzfitness.com',
          password: 'password123',
          gender: 'other',
          title: 'Trainer',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('gender'),
    })
  })

  it('rolls back the auth user when profile insertion fails', async () => {
    const { client, deleteUserCalls } = createStaffAdminClient({
      createUserResult: {
        data: {
          user: {
            id: 'staff-9',
          },
        },
        error: null,
      },
      insertResult: {
        data: null,
        error: {
          message: 'duplicate key value violates unique constraint',
        },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Rollback User',
          email: 'rollback@evolutionzfitness.com',
          password: 'password123',
          title: 'Trainer',
        }),
      }),
    )

    expect(response.status).toBe(500)
    expect(deleteUserCalls).toEqual(['staff-9'])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to create staff profile: duplicate key value violates unique constraint',
    })
  })

  it('updates a staff profile, derives the role from title, and clears nullable fields', async () => {
    const { client, updateValues } = createStaffAdminClient({
      updateResult: {
        data: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Trainer',
          role: 'staff',
          title: 'Trainer',
          phone: null,
          gender: null,
          remark: null,
          specialties: [],
        }),
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '  Jordan Trainer  ',
          phone: '',
          gender: null,
          remark: '   ',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        name: 'Jordan Trainer',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        gender: null,
        remark: null,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-2',
        name: 'Jordan Trainer',
        email: 'admin@evolutionzfitness.com',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('preserves a legacy other gender when the PATCH payload omits gender', async () => {
    const { client, updateValues } = createStaffAdminClient({
      updateResult: {
        data: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Trainer',
          role: 'staff',
          title: 'Trainer',
          phone: '876-555-0100',
          gender: 'other',
          remark: 'Keeps legacy gender',
          specialties: ['Strength Training'],
        }),
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Trainer',
          phone: '876-555-0100',
          remark: 'Keeps legacy gender',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        name: 'Jordan Trainer',
        role: 'staff',
        title: 'Trainer',
        phone: '876-555-0100',
        remark: 'Keeps legacy gender',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-2',
        name: 'Jordan Trainer',
        email: 'admin@evolutionzfitness.com',
        role: 'staff',
        title: 'Trainer',
        phone: '876-555-0100',
        gender: 'other',
        remark: 'Keeps legacy gender',
        specialties: ['Strength Training'],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('updates trainer specialties when the PATCH payload includes them', async () => {
    const { client, updateValues } = createStaffAdminClient({
      updateResult: {
        data: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Trainer',
          role: 'staff',
          title: 'Trainer',
          specialties: ['Strength Training', 'HIIT'],
        }),
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Trainer',
          title: 'Trainer',
          specialties: ['HIIT', 'Strength Training'],
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        name: 'Jordan Trainer',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT'],
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-2',
        name: 'Jordan Trainer',
        email: 'admin@evolutionzfitness.com',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT'],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('clears specialties when a trainer is updated to a non-trainer title', async () => {
    const { client, updateValues } = createStaffAdminClient({
      updateResult: {
        data: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Admin',
          role: 'admin',
          title: 'Owner',
          specialties: [],
        }),
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Admin',
          title: 'Owner',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        name: 'Jordan Admin',
        role: 'admin',
        title: 'Owner',
        phone: null,
        remark: null,
        specialties: [],
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-2',
        name: 'Jordan Admin',
        email: 'admin@evolutionzfitness.com',
        role: 'admin',
        title: 'Owner',
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('returns 400 when the PATCH payload contains non-editable fields', async () => {
    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Trainer',
          title: 'Trainer',
          email: 'jordan@evolutionzfitness.com',
          password: 'password123',
          role: 'admin',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Unrecognized key(s)'),
    })
  })

  it('rejects other as a writable staff gender during updates', async () => {
    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Trainer',
          gender: 'other',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('gender'),
    })
  })

  it('returns 401 when the staff patch route is requested without a session', async () => {
    mockUnauthorized()

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Trainer',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when a non-admin requests the staff patch route', async () => {
    mockForbidden()

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jordan Trainer',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-2' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns 404 when patching a missing staff profile', async () => {
    const { client } = createStaffAdminClient({
      updateResult: {
        data: null,
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/missing', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Missing Staff',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'missing' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Staff profile not found.',
    })
  })

  it('blocks admins from removing their own admin access', async () => {
    mockAdminUser({
      user: {
        id: 'staff-1',
      },
      profile: {
        id: 'staff-1',
        role: 'admin',
        title: 'Owner',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(createStaffAdminClient().client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Admin User',
          title: 'Trainer',
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'You cannot remove your own admin access.',
    })
  })

  it('returns a signed staff detail profile', async () => {
    createClientMock.mockResolvedValue(
      createStaffServerClient({
        detailRow: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Trainer',
          role: 'staff',
          title: 'Trainer',
          photoUrl: 'staff-2.jpg',
          specialties: ['HIIT', 'Strength Training'],
        }),
      }),
    )
    const { client } = createStaffAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await getStaffDetail(new Request('http://localhost/api/staff/staff-2'), {
      params: Promise.resolve({ id: 'staff-2' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      profile: {
        id: 'staff-2',
        name: 'Jordan Trainer',
        email: 'admin@evolutionzfitness.com',
        role: 'staff',
        title: 'Trainer',
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT'],
        photoUrl: 'https://signed.example.com/staff-2.jpg',
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('returns 404 for a missing staff detail profile', async () => {
    createClientMock.mockResolvedValue(
      createStaffServerClient({
        detailRow: null,
      }),
    )
    getSupabaseAdminClientMock.mockReturnValue(createStaffAdminClient().client)

    const response = await getStaffDetail(new Request('http://localhost/api/staff/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Staff profile not found.',
    })
  })

  it('deletes the stored photo, then the profile row, then the auth user', async () => {
    const { client, removeCalls, deleteUserCalls } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-4',
          name: 'Delete Me',
          photoUrl: 'staff-4.jpg',
        }),
      ],
      deleteResult: {
        data: buildProfileRow({
          id: 'staff-4',
          name: 'Delete Me',
          photoUrl: 'staff-4.jpg',
        }),
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await deleteStaff(new Request('http://localhost/api/staff/staff-4'), {
      params: Promise.resolve({ id: 'staff-4' }),
    })

    expect(response.status).toBe(200)
    expect(removeCalls).toEqual([['staff-4.jpg']])
    expect(deleteUserCalls).toEqual(['staff-4'])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('blocks admins from deleting their own account', async () => {
    mockAdminUser({
      user: {
        id: 'staff-1',
      },
      profile: {
        id: 'staff-1',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(createStaffAdminClient().client)

    const response = await deleteStaff(new Request('http://localhost/api/staff/staff-1'), {
      params: Promise.resolve({ id: 'staff-1' }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'You cannot delete your own staff account.',
    })
  })

  it('returns a warning when the auth user cannot be deleted after the profile row is removed', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, deleteUserCalls } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-6',
          photoUrl: null,
        }),
      ],
      deleteResult: {
        data: buildProfileRow({
          id: 'staff-6',
          photoUrl: null,
        }),
        error: null,
      },
      deleteUserResult: {
        data: null,
        error: {
          message: 'Auth delete failed.',
        },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await deleteStaff(new Request('http://localhost/api/staff/staff-6'), {
      params: Promise.resolve({ id: 'staff-6' }),
    })

    expect(response.status).toBe(200)
    expect(deleteUserCalls).toEqual(['staff-6'])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning:
        'The staff profile was deleted, but the auth user could not be removed. Delete the user manually from Supabase Auth.',
    })
    consoleErrorSpy.mockRestore()
  })
})
