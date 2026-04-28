import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  createClientMock,
  getMemberPauseEligibilityErrorMock,
  getSupabaseAdminClientMock,
  notifyAdminsOfRequestMock,
  readStaffProfileMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getMemberPauseEligibilityErrorMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  notifyAdminsOfRequestMock: vi.fn().mockResolvedValue(undefined),
  readStaffProfileMock: vi.fn(),
  resolvePermissionsForProfileMock: vi.fn(),
}))

vi.mock('@/lib/member-pause-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-pause-server')>(
    '@/lib/member-pause-server',
  )

  return {
    ...actual,
    getMemberPauseEligibilityError: getMemberPauseEligibilityErrorMock,
  }
})

vi.mock('@/lib/notify-admins-of-request', () => ({
  notifyAdminsOfRequest: notifyAdminsOfRequestMock,
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

vi.mock('@/lib/server-permissions', () => ({
  resolvePermissionsForProfile: resolvePermissionsForProfileMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/members/[id]/pause-requests/route'
import {
  MEMBER_PAUSE_ACTIVE_ERROR,
  MEMBER_PAUSE_INACTIVE_ERROR,
  MEMBER_PAUSE_REQUEST_PENDING_ERROR,
} from '@/lib/member-pause'

function createProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'staff-1',
    name: 'Jordan Staff',
    role: 'staff',
    isSuspended: false,
    ...overrides,
  }
}

function createPermissions(options: { allowed?: boolean; role?: 'admin' | 'staff' } = {}) {
  return {
    role: options.role ?? 'staff',
    can: (permission: string) => permission === 'members.pauseMembership' && (options.allowed ?? true),
  }
}

function createPauseRequestClient(options: {
  insertError?: { message: string; code?: string | null; details?: string | null } | null
} = {}) {
  const inserts: Array<Record<string, unknown>> = []

  return {
    inserts,
    client: {
      from(table: string) {
        if (table !== 'member_pause_requests') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          insert(values: Record<string, unknown>) {
            inserts.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  single() {
                    return Promise.resolve({
                      data: options.insertError ? null : { id: 'pause-request-1' },
                      error: options.insertError ?? null,
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

describe('POST /api/members/[id]/pause-requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    getMemberPauseEligibilityErrorMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    notifyAdminsOfRequestMock.mockReset()
    notifyAdminsOfRequestMock.mockResolvedValue(undefined)
    readStaffProfileMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates a staff pause request and notifies admins', async () => {
    const { client, inserts } = createPauseRequestClient()
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: {
        id: 'member-1',
        name: 'Jane Doe',
      },
      error: null,
      status: 200,
    })
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(inserts).toEqual([
      {
        member_id: 'member-1',
        requested_by: 'staff-1',
        duration_days: 84,
        status: 'pending',
      },
    ])
    expect(notifyAdminsOfRequestMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: 'member_pause_request',
        url: '/pending-approvals/pause-requests',
      }),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: 'pause-request-1',
    })
  })

  it('returns 401 when the user is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when an admin tries to create a pause request', async () => {
    createClientMock.mockResolvedValue({})
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        role: 'admin',
      }),
    )
    resolvePermissionsForProfileMock.mockReturnValue(
      createPermissions({
        role: 'admin',
      }),
    )
    mockAuthenticatedUser({
      id: 'admin-1',
      email: 'admin@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(getMemberPauseEligibilityErrorMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Admins should pause memberships directly.',
    })
  })

  it('returns 400 when the member has no active membership', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(createPauseRequestClient().client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: {
        id: 'member-1',
        name: 'Jane Doe',
      },
      error: MEMBER_PAUSE_INACTIVE_ERROR,
      status: 400,
    })
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_INACTIVE_ERROR,
    })
  })

  it('returns 400 when the member is already paused', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(createPauseRequestClient().client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: {
        id: 'member-1',
        name: 'Jane Doe',
      },
      error: MEMBER_PAUSE_ACTIVE_ERROR,
      status: 400,
    })
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_ACTIVE_ERROR,
    })
  })

  it('returns 400 for a duplicate pending pause request using the current behavior', async () => {
    const { client, inserts } = createPauseRequestClient({
      insertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: {
        id: 'member-1',
        name: 'Jane Doe',
      },
      error: null,
      status: 200,
    })
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(inserts).toEqual([
      {
        member_id: 'member-1',
        requested_by: 'staff-1',
        duration_days: 84,
        status: 'pending',
      },
    ])
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_REQUEST_PENDING_ERROR,
    })
  })
})
