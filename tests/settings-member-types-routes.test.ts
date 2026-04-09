import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'
import type { MemberTypeRecord } from '@/types'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
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

import { GET as getMemberTypes } from '@/app/api/settings/member-types/route'
import { PATCH as patchMemberType } from '@/app/api/settings/member-types/[id]/route'

function createMemberType(overrides: Partial<MemberTypeRecord> = {}): MemberTypeRecord {
  return {
    id: overrides.id ?? 'type-1',
    name: overrides.name ?? 'General',
    monthly_rate: overrides.monthly_rate ?? 12000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

function createMemberTypesReadClient(options: {
  rows?: MemberTypeRecord[]
  error?: { message: string } | null
} = {}) {
  const orderCalls: Array<[string, { ascending: boolean }]> = []

  return {
    orderCalls,
    client: {
      from(table: string) {
        expect(table).toBe('member_types')

        return {
          select(columns: string) {
            expect(columns).toBe('*')

            return {
              order(column: string, orderOptions: { ascending: boolean }) {
                orderCalls.push([column, orderOptions])

                return Promise.resolve({
                  data: options.rows ?? [],
                  error: options.error ?? null,
                })
              },
            }
          },
        }
      },
    },
  }
}

function createMemberTypePatchClient(options: {
  updatedRow?: MemberTypeRecord | null
  error?: { message: string } | null
} = {}) {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('member_types')

        return {
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('type-1')

                return {
                  select(columns: string) {
                    expect(columns).toBe('*')

                    return {
                      maybeSingle() {
                        return Promise.resolve({
                          data:
                            options.updatedRow === undefined
                              ? createMemberType()
                              : options.updatedRow,
                          error: options.error ?? null,
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
    },
  }
}

describe('settings member types routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns membership types ordered by created_at ascending', async () => {
    const client = createMemberTypesReadClient({
      rows: [
        createMemberType(),
        createMemberType({
          id: 'type-2',
          name: 'Civil Servant',
          monthly_rate: 7500,
          created_at: '2026-04-02T00:00:00.000Z',
        }),
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await getMemberTypes()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      memberTypes: [
        createMemberType(),
        createMemberType({
          id: 'type-2',
          name: 'Civil Servant',
          monthly_rate: 7500,
          created_at: '2026-04-02T00:00:00.000Z',
        }),
      ],
    })
    expect(client.orderCalls).toEqual([['created_at', { ascending: true }]])
  })

  it('returns 401 when member types are requested without a session', async () => {
    mockUnauthorized()

    const response = await getMemberTypes()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('updates a membership type rate for admins', async () => {
    const client = createMemberTypePatchClient({
      updatedRow: createMemberType({
        monthly_rate: 13000,
      }),
    })

    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await patchMemberType(
      new Request('http://localhost/api/settings/member-types/type-1', {
        method: 'PATCH',
        body: JSON.stringify({ monthly_rate: 13000 }),
      }),
      {
        params: Promise.resolve({ id: 'type-1' }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      memberType: createMemberType({
        monthly_rate: 13000,
      }),
    })
    expect(client.updateValues).toEqual([{ monthly_rate: 13000 }])
  })

  it('returns 401 when the rate update is requested without a session', async () => {
    mockUnauthorized()

    const response = await patchMemberType(
      new Request('http://localhost/api/settings/member-types/type-1', {
        method: 'PATCH',
        body: JSON.stringify({ monthly_rate: 13000 }),
      }),
      {
        params: Promise.resolve({ id: 'type-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 403 when a non-admin attempts to update a membership type rate', async () => {
    mockForbidden()

    const response = await patchMemberType(
      new Request('http://localhost/api/settings/member-types/type-1', {
        method: 'PATCH',
        body: JSON.stringify({ monthly_rate: 13000 }),
      }),
      {
        params: Promise.resolve({ id: 'type-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON bodies for the rate update route', async () => {
    const response = await patchMemberType(
      new Request('http://localhost/api/settings/member-types/type-1', {
        method: 'PATCH',
        body: '{',
      }),
      {
        params: Promise.resolve({ id: 'type-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })

  it('rejects non-positive monthly rates', async () => {
    const response = await patchMemberType(
      new Request('http://localhost/api/settings/member-types/type-1', {
        method: 'PATCH',
        body: JSON.stringify({ monthly_rate: 0 }),
      }),
      {
        params: Promise.resolve({ id: 'type-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'monthly_rate must be a positive number.',
    })
  })

  it('returns 404 when the membership type does not exist', async () => {
    const client = createMemberTypePatchClient({
      updatedRow: null,
    })

    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await patchMemberType(
      new Request('http://localhost/api/settings/member-types/type-1', {
        method: 'PATCH',
        body: JSON.stringify({ monthly_rate: 13000 }),
      }),
      {
        params: Promise.resolve({ id: 'type-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Membership type not found.',
    })
  })
})
