import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'
import type { Profile } from '@/types'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

const { readStaffProfileMock } = vi.hoisted(() => ({
  readStaffProfileMock: vi.fn(),
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
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { POST } from '@/app/api/staff/[id]/suspend/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Jordan Trainer',
    email: overrides.email ?? 'jordan@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Trainer'],
    isSuspended: overrides.isSuspended ?? false,
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function createSuspendAdminClient({
  updateResults = [
    {
      data: { id: 'staff-1' },
      error: null,
    } satisfies QueryResult<{ id: string }>,
  ],
  rpcResult = {
    data: null,
    error: null,
  } satisfies QueryResult<null>,
}: {
  updateResults?: Array<QueryResult<{ id: string }>>
  rpcResult?: QueryResult<null>
} = {}) {
  const updateCalls: Array<{ id: string; values: { is_suspended: boolean } }> = []
  const rpcCalls: Array<{ p_user_id: string }> = []
  let updateIndex = 0

  return {
    client: {
      from(table: string) {
        expect(table).toBe('profiles')

        return {
          update(values: { is_suspended: boolean }) {
            return {
              eq(column: 'id', value: string) {
                expect(column).toBe('id')
                updateCalls.push({
                  id: value,
                  values,
                })

                return {
                  select(columns: 'id') {
                    expect(columns).toBe('id')

                    return {
                      maybeSingle() {
                        const result =
                          updateResults[Math.min(updateIndex, updateResults.length - 1)]

                        updateIndex += 1

                        return Promise.resolve(result)
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
      rpc(fn: 'revoke_user_sessions', args: { p_user_id: string }) {
        expect(fn).toBe('revoke_user_sessions')
        rpcCalls.push(args)
        return Promise.resolve(rpcResult)
      },
    },
    rpcCalls,
    updateCalls,
  }
}

describe('POST /api/staff/[id]/suspend', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    readStaffProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('requires an authenticated admin user', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(401)
  })

  it('returns 403 for non-admin callers', async () => {
    mockForbidden()

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(403)
  })

  it('returns 400 when the request body is malformed JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid JSON body.',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
    expect(readStaffProfileMock).not.toHaveBeenCalled()
  })

  it('suspends a staff account and revokes active sessions', async () => {
    const { client, rpcCalls, updateCalls } = createSuspendAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(createProfile())

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateCalls).toEqual([
      {
        id: 'staff-1',
        values: {
          is_suspended: true,
        },
      },
    ])
    expect(rpcCalls).toEqual([{ p_user_id: 'staff-1' }])
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('restores access without revoking sessions again', async () => {
    const { client, rpcCalls, updateCalls } = createSuspendAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        isSuspended: true,
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: false,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateCalls).toEqual([
      {
        id: 'staff-1',
        values: {
          is_suspended: false,
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('returns success without writing when the requested suspension state is unchanged', async () => {
    const { client, rpcCalls, updateCalls } = createSuspendAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        isSuspended: true,
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateCalls).toEqual([])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('rejects self-suspension', async () => {
    mockAdminUser({
      profile: {
        id: 'staff-1',
      },
    })

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'You cannot suspend your own account.',
    })
    expect(readStaffProfileMock).not.toHaveBeenCalled()
  })

  it('rejects admin owner targets', async () => {
    const { client } = createSuspendAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        id: 'owner-1',
        role: 'admin',
        titles: ['Owner'],
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/staff/owner-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'owner-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Admin accounts cannot be suspended.',
    })
  })

  it('rejects archived staff accounts', async () => {
    const { client } = createSuspendAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        archivedAt: '2026-04-10T00:00:00.000Z',
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Archived staff accounts are read-only.',
    })
  })

  it('preserves archived guard errors even when the requested state already matches', async () => {
    const { client, rpcCalls, updateCalls } = createSuspendAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        archivedAt: '2026-04-10T00:00:00.000Z',
        isSuspended: true,
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(409)
    expect(updateCalls).toEqual([])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toMatchObject({
      error: 'Archived staff accounts are read-only.',
    })
  })

  it('rolls back the suspension flag when session invalidation fails', async () => {
    const { client, rpcCalls, updateCalls } = createSuspendAdminClient({
      updateResults: [
        {
          data: { id: 'staff-1' },
          error: null,
        },
        {
          data: { id: 'staff-1' },
          error: null,
        },
      ],
      rpcResult: {
        data: null,
        error: { message: 'session revoke failed' },
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(createProfile())

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(updateCalls).toEqual([
      {
        id: 'staff-1',
        values: {
          is_suspended: true,
        },
      },
      {
        id: 'staff-1',
        values: {
          is_suspended: false,
        },
      },
    ])
    expect(rpcCalls).toEqual([{ p_user_id: 'staff-1' }])
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to invalidate active sessions for this account.',
    })
  })

  it('logs and returns a manual verification error when rollback also fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, updateCalls } = createSuspendAdminClient({
      updateResults: [
        {
          data: { id: 'staff-1' },
          error: null,
        },
        {
          data: null,
          error: { message: 'rollback failed' },
        },
      ],
      rpcResult: {
        data: null,
        error: { message: 'session revoke failed' },
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(createProfile())

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suspended: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(updateCalls).toHaveLength(2)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to roll back suspension for profile staff-1 after session invalidation failure: rollback failed',
    )
    await expect(response.json()).resolves.toMatchObject({
      error:
        'Failed to invalidate active sessions and failed to roll back the suspension state. Please manually verify the account state in the dashboard.',
    })
  })
})
