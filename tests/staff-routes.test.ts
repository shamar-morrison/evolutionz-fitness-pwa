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
import { POST as postAddTitle } from '@/app/api/staff/[id]/add-title/route'
import { POST as archiveStaff } from '@/app/api/staff/[id]/archive/route'
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
    titles: ['Owner'],
    phone: null,
    gender: null,
    remark: null,
    specialties: [],
    photoUrl: null,
    archivedAt: null,
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

          let archivedFilter: 'active' | 'archived' | 'all' = 'all'

          const getFilteredListRows = () =>
            listRows.filter((row) =>
              archivedFilter === 'all'
                ? true
                : archivedFilter === 'active'
                  ? !row.archivedAt
                  : Boolean(row.archivedAt),
            )

          const listQuery = {
            is(column: string, value: null) {
              expect(column).toBe('archived_at')
              expect(value).toBeNull()
              archivedFilter = 'active'
              return listQuery
            },
            not(column: string, operator: string, value: null) {
              expect(column).toBe('archived_at')
              expect(operator).toBe('is')
              expect(value).toBeNull()
              archivedFilter = 'archived'
              return listQuery
            },
            order(column: string, options: { ascending: boolean }) {
              expect(column).toBe('created_at')
              expect(options).toEqual({ ascending: true })

              return Promise.resolve({
                data: getFilteredListRows(),
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

          return listQuery
        },
      }
    },
  }
}

function createStaffAdminClient({
  detailReads = [buildProfileRow()],
  trainerClientRows = [],
  ptSessionRows = [],
  ptSessionChangeRows = [],
  ptRescheduleRequestedRows = [],
  ptRescheduleReviewedRows = [],
  ptSessionUpdateRequestedRows = [],
  ptSessionUpdateReviewedRows = [],
  insertResult = {
    data: buildProfileRow(),
    error: null,
  } satisfies QueryResult<Record<string, unknown>>,
  existingEmailResult = {
    data: null,
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
  updateUserResult = {
    data: {},
    error: null,
  },
  removeResult = {
    data: [],
    error: null,
  },
}: {
  detailReads?: Array<Record<string, unknown> | null>
  trainerClientRows?: Array<Record<string, unknown>>
  ptSessionRows?: Array<Record<string, unknown>>
  ptSessionChangeRows?: Array<Record<string, unknown>>
  ptRescheduleRequestedRows?: Array<Record<string, unknown>>
  ptRescheduleReviewedRows?: Array<Record<string, unknown>>
  ptSessionUpdateRequestedRows?: Array<Record<string, unknown>>
  ptSessionUpdateReviewedRows?: Array<Record<string, unknown>>
  insertResult?: QueryResult<Record<string, unknown>>
  existingEmailResult?: QueryResult<Record<string, unknown>>
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
  updateUserResult?: {
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
  const updateUserCalls: Array<{ userId: string; attributes: Record<string, unknown> }> = []
  const insertValues: Array<Record<string, unknown>> = []
  const updateValues: Array<Record<string, unknown>> = []
  const removeCalls: string[][] = []
  const publicUrlCalls: string[] = []
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
          updateUserById(userId: string, attributes: Record<string, unknown>) {
            updateUserCalls.push({ userId, attributes })
            return Promise.resolve(updateUserResult)
          },
        },
      },
      from(table: string) {
        if (table !== 'profiles') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

              const rows =
                table === 'trainer_clients'
                  ? trainerClientRows
                  : table === 'pt_sessions'
                    ? ptSessionRows
                    : table === 'pt_session_changes'
                      ? ptSessionChangeRows
                      : table === 'pt_reschedule_requests'
                        ? [...ptRescheduleRequestedRows, ...ptRescheduleReviewedRows]
                        : table === 'pt_session_update_requests'
                          ? [...ptSessionUpdateRequestedRows, ...ptSessionUpdateReviewedRows]
                          : []
              const filters: Record<string, string> = {}
              const query = {
                eq(column: string, value: string) {
                  filters[column] = value
                  return query
                },
                then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
                  const filteredRows = rows.filter((row) =>
                    Object.entries(filters).every(([column, value]) => row[column] === value),
                  )

                  return Promise.resolve({
                    data: filteredRows,
                    error: null,
                  }).then(resolve, reject)
                },
              }

              return query
            },
          }
        }

        return {
          select(columns: string) {
            if (columns === 'id, name, titles') {
              return {
                ilike(column: string, value: string) {
                  expect(column).toBe('email')
                  expect(value).toBeDefined()

                  return {
                    maybeSingle() {
                      return Promise.resolve(existingEmailResult)
                    },
                  }
                },
              }
            }

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
                    expect([STAFF_PROFILE_SELECT, 'id']).toContain(columns)

                    return {
                      maybeSingle() {
                        if (columns === 'id') {
                          return Promise.resolve({
                            data:
                              updateResult.data && 'id' in updateResult.data
                                ? { id: String(updateResult.data.id) }
                                : { id: String(value) },
                            error: updateResult.error,
                          })
                        }

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
            getPublicUrl(path: string) {
              publicUrlCalls.push(path)

              return {
                data: { publicUrl: `https://public.example.com/staff-photos/${path}` },
              }
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
    updateUserCalls,
    insertValues,
    updateValues,
    removeCalls,
    publicUrlCalls,
  }
}

describe('staff API routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns staff ordered by created_at ascending and hydrates list photos with public URLs', async () => {
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
            titles: ['Trainer'],
            specialties: ['HIIT', 'Strength Training'],
            created_at: '2026-04-02T00:00:00.000Z',
          }),
        ],
      }),
    )
    const { client, publicUrlCalls } = createStaffAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await getStaff(new Request('http://localhost/api/staff'))

    expect(response.status).toBe(200)
    expect(publicUrlCalls).toEqual(['staff-1.jpg'])
    await expect(response.json()).resolves.toEqual({
      staff: [
        {
          id: 'staff-1',
          name: 'Owner One',
          email: 'admin@evolutionzfitness.com',
          role: 'admin',
          titles: ['Owner'],
          phone: null,
          gender: null,
          remark: null,
          specialties: [],
          photoUrl: 'https://public.example.com/staff-photos/staff-1.jpg',
          archivedAt: null,
          created_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'staff-2',
          name: 'Trainer Two',
          email: 'admin@evolutionzfitness.com',
          role: 'staff',
          titles: ['Trainer'],
          phone: null,
          gender: null,
          remark: null,
          specialties: ['Strength Training', 'HIIT'],
          photoUrl: null,
          archivedAt: null,
          created_at: '2026-04-02T00:00:00.000Z',
        },
      ],
    })
  })

  it('returns 401 when the staff list is requested without a session', async () => {
    mockUnauthorized()

    const response = await getStaff(new Request('http://localhost/api/staff'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when a non-admin requests the staff list', async () => {
    mockForbidden()

    const response = await getStaff(new Request('http://localhost/api/staff'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns archived staff when the archived query flag is set', async () => {
    createClientMock.mockResolvedValue(
      createStaffServerClient({
        listRows: [
          buildProfileRow({
            id: 'staff-active',
            name: 'Active Trainer',
            role: 'staff',
            titles: ['Trainer'],
          }),
          buildProfileRow({
            id: 'staff-archived',
            name: 'Archived Trainer',
            role: 'staff',
            titles: ['Trainer'],
            archivedAt: '2026-04-07T18:00:00.000Z',
          }),
        ],
      }),
    )
    getSupabaseAdminClientMock.mockReturnValue(createStaffAdminClient().client)

    const response = await getStaff(new Request('http://localhost/api/staff?archived=1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      staff: [
        {
          id: 'staff-archived',
          name: 'Archived Trainer',
          email: 'admin@evolutionzfitness.com',
          role: 'staff',
          titles: ['Trainer'],
          phone: null,
          gender: null,
          remark: null,
          specialties: [],
          photoUrl: null,
          archivedAt: '2026-04-07T18:00:00.000Z',
          created_at: '2026-04-03T00:00:00.000Z',
        },
      ],
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
          titles: ['Owner'],
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
          titles: ['Owner'],
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
        titles: ['Owner'],
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
        titles: ['Owner'],
        phone: '876-555-0101',
        gender: 'female',
        remark: 'Handles billing',
        specialties: [],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
        titles: ['Trainer'],
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
        titles: ['Trainer'],
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT', 'Recovery Training'],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Owner'],
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
          titles: ['Owner'],
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
        titles: ['Owner'],
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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

  it('returns a typed duplicate-email response before creating a new auth user', async () => {
    const { client, createUserCalls, insertValues } = createStaffAdminClient({
      existingEmailResult: {
        data: {
          id: 'existing-1',
          name: 'Jordan Existing',
          titles: ['Assistant'],
        },
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postStaff(
      new Request('http://localhost/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Jordan Existing',
          email: 'jordan@evolutionzfitness.com',
          password: 'password123',
          titles: ['Trainer'],
          specialties: ['HIIT'],
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(createUserCalls).toEqual([])
    expect(insertValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'EMAIL_EXISTS',
      existingProfile: {
        id: 'existing-1',
        name: 'Jordan Existing',
        titles: ['Assistant'],
      },
    })
  })

  it('merges new titles into an existing profile and derives role from the merged set', async () => {
    const { client, updateValues } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-12',
          name: 'Jordan Existing',
          role: 'staff',
          titles: ['Assistant'],
          specialties: [],
        }),
      ],
      updateResult: {
        data: buildProfileRow({
          id: 'staff-12',
          name: 'Jordan Existing',
          role: 'admin',
          titles: ['Owner', 'Trainer', 'Assistant'],
          specialties: ['Strength Training', 'HIIT'],
        }),
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postAddTitle(
      new Request('http://localhost/api/staff/staff-12/add-title', {
        method: 'POST',
        body: JSON.stringify({
          titles: ['Trainer', 'Owner'],
          specialties: ['HIIT', 'Strength Training'],
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-12' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        role: 'admin',
        titles: ['Owner', 'Trainer', 'Assistant'],
        specialties: ['Strength Training', 'HIIT'],
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        id: 'staff-12',
        name: 'Jordan Existing',
        email: 'admin@evolutionzfitness.com',
        role: 'admin',
        titles: ['Owner', 'Trainer', 'Assistant'],
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT'],
        photoUrl: null,
        archivedAt: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    })
  })

  it('returns 409 when adding titles to an archived profile', async () => {
    const { client, updateValues } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-archived-titles',
          archivedAt: '2026-04-07T18:00:00.000Z',
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postAddTitle(
      new Request('http://localhost/api/staff/staff-archived-titles/add-title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titles: ['Trainer'],
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-archived-titles' }),
      },
    )

    expect(response.status).toBe(409)
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Archived staff accounts are read-only.',
    })
  })

  it('updates a staff profile, derives the role from title, and clears nullable fields', async () => {
    const { client, updateValues } = createStaffAdminClient({
      updateResult: {
        data: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Trainer',
          role: 'staff',
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
        titles: ['Trainer'],
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
        titles: ['Trainer'],
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
        titles: ['Trainer'],
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
        titles: ['Trainer'],
        phone: '876-555-0100',
        gender: 'other',
        remark: 'Keeps legacy gender',
        specialties: ['Strength Training'],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
        titles: ['Trainer'],
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
        titles: ['Trainer'],
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT'],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Owner'],
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
          titles: ['Owner'],
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
        titles: ['Owner'],
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
        titles: ['Owner'],
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        archivedAt: null,
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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
          titles: ['Trainer'],
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

  it('returns 409 when patching an archived staff profile', async () => {
    const { client, updateValues } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-archived',
          archivedAt: '2026-04-07T18:00:00.000Z',
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchStaff(
      new Request('http://localhost/api/staff/staff-archived', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Archived Staff',
          titles: ['Owner'],
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-archived' }),
      },
    )

    expect(response.status).toBe(409)
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Archived staff accounts are read-only.',
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
        titles: ['Owner'],
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
          titles: ['Trainer'],
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

  it('returns a public staff detail profile', async () => {
    createClientMock.mockResolvedValue(
      createStaffServerClient({
        detailRow: buildProfileRow({
          id: 'staff-2',
          name: 'Jordan Trainer',
          role: 'staff',
          titles: ['Trainer'],
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
        titles: ['Trainer'],
        phone: null,
        gender: null,
        remark: null,
        specialties: ['Strength Training', 'HIIT'],
        photoUrl: 'https://public.example.com/staff-photos/staff-2.jpg',
        archivedAt: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
      removal: {
        mode: 'delete',
        activeAssignments: 0,
        history: {
          trainerAssignments: 0,
          ptSessions: 0,
          sessionChanges: 0,
          rescheduleRequestsRequested: 0,
          rescheduleRequestsReviewed: 0,
          sessionUpdateRequestsRequested: 0,
          sessionUpdateRequestsReviewed: 0,
          total: 0,
        },
      },
    })
  })

  it('returns removal guidance for staff with retained history', async () => {
    createClientMock.mockResolvedValue(
      createStaffServerClient({
        detailRow: buildProfileRow({
          id: 'staff-3',
          name: 'History Trainer',
          role: 'staff',
          titles: ['Trainer'],
        }),
      }),
    )
    const { client } = createStaffAdminClient({
      trainerClientRows: [{ id: 'assignment-1', trainer_id: 'staff-3', status: 'inactive' }],
      ptSessionRows: [{ id: 'session-1', trainer_id: 'staff-3' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await getStaffDetail(new Request('http://localhost/api/staff/staff-3'), {
      params: Promise.resolve({ id: 'staff-3' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      profile: {
        id: 'staff-3',
        name: 'History Trainer',
        email: 'admin@evolutionzfitness.com',
        role: 'staff',
        titles: ['Trainer'],
        phone: null,
        gender: null,
        remark: null,
        specialties: [],
        photoUrl: null,
        archivedAt: null,
        created_at: '2026-04-03T00:00:00.000Z',
      },
      removal: {
        mode: 'archive',
        activeAssignments: 0,
        history: {
          trainerAssignments: 1,
          ptSessions: 1,
          sessionChanges: 0,
          rescheduleRequestsRequested: 0,
          rescheduleRequestsReviewed: 0,
          sessionUpdateRequestsRequested: 0,
          sessionUpdateRequestsReviewed: 0,
          total: 2,
        },
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

  it('blocks deletion when the staff account has retained history', async () => {
    const { client } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-history',
          role: 'staff',
          titles: ['Trainer'],
        }),
      ],
      trainerClientRows: [{ id: 'assignment-1', trainer_id: 'staff-history', status: 'inactive' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await deleteStaff(new Request('http://localhost/api/staff/staff-history'), {
      params: Promise.resolve({ id: 'staff-history' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This staff account has retained PT or history records and should be archived instead of deleted.',
      code: 'HAS_HISTORY',
      removal: {
        mode: 'archive',
        activeAssignments: 0,
        history: {
          trainerAssignments: 1,
          ptSessions: 0,
          sessionChanges: 0,
          rescheduleRequestsRequested: 0,
          rescheduleRequestsReviewed: 0,
          sessionUpdateRequestsRequested: 0,
          sessionUpdateRequestsReviewed: 0,
          total: 1,
        },
      },
    })
  })

  it('blocks archiving when the staff account still has active assignments', async () => {
    const { client, updateUserCalls, updateValues } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-active-archive',
          role: 'staff',
          titles: ['Trainer'],
        }),
      ],
      trainerClientRows: [{ id: 'assignment-1', trainer_id: 'staff-active-archive', status: 'active' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await archiveStaff(
      new Request('http://localhost/api/staff/staff-active-archive/archive', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: 'staff-active-archive' }),
      },
    )

    expect(response.status).toBe(409)
    expect(updateValues).toEqual([])
    expect(updateUserCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'This staff account still has active PT assignments. Reassign or inactivate them before archiving this staff account.',
      code: 'HAS_ACTIVE_ASSIGNMENTS',
      removal: {
        mode: 'blocked',
        activeAssignments: 1,
        history: {
          trainerAssignments: 1,
          ptSessions: 0,
          sessionChanges: 0,
          rescheduleRequestsRequested: 0,
          rescheduleRequestsReviewed: 0,
          sessionUpdateRequestsRequested: 0,
          sessionUpdateRequestsReviewed: 0,
          total: 1,
        },
      },
    })
  })

  it('archives a history-only staff account and bans auth login', async () => {
    const { client, updateUserCalls, updateValues } = createStaffAdminClient({
      detailReads: [
        buildProfileRow({
          id: 'staff-archive',
          role: 'staff',
          titles: ['Trainer'],
        }),
      ],
      trainerClientRows: [{ id: 'assignment-1', trainer_id: 'staff-archive', status: 'inactive' }],
      ptSessionRows: [{ id: 'session-1', trainer_id: 'staff-archive' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await archiveStaff(
      new Request('http://localhost/api/staff/staff-archive/archive', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: 'staff-archive' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toHaveLength(1)
    expect(updateValues[0]).toMatchObject({
      archived_at: expect.any(String),
    })
    expect(updateUserCalls).toEqual([
      {
        userId: 'staff-archive',
        attributes: {
          ban_duration: '876000h',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      archivedAt: expect.any(String),
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
