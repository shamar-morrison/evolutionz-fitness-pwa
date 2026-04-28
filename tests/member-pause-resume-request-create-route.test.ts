import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  createClientMock,
  getSupabaseAdminClientMock,
  notifyAdminsOfRequestMock,
  readActivePauseByIdMock,
  readPendingEarlyResumeRequestForPauseMock,
  readStaffProfileMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  notifyAdminsOfRequestMock: vi.fn().mockResolvedValue(undefined),
  readActivePauseByIdMock: vi.fn(),
  readPendingEarlyResumeRequestForPauseMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  resolvePermissionsForProfileMock: vi.fn(),
}))

vi.mock('@/lib/member-pause-records', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-pause-records')>(
    '@/lib/member-pause-records',
  )

  return {
    ...actual,
    readActivePauseById: readActivePauseByIdMock,
    readPendingEarlyResumeRequestForPause: readPendingEarlyResumeRequestForPauseMock,
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

import { POST } from '@/app/api/members/pauses/[pauseId]/resume-requests/route'
import { MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR } from '@/lib/member-pause'

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

function createPauseResumeRequestClient(options: {
  insertError?: { message: string; code?: string | null; details?: string | null } | null
} = {}) {
  const inserts: Array<Record<string, unknown>> = []

  return {
    inserts,
    client: {
      from(table: string) {
        if (table !== 'member_pause_resume_requests') {
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
                      data: options.insertError ? null : { id: 'resume-request-1' },
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

describe('POST /api/members/pauses/[pauseId]/resume-requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    notifyAdminsOfRequestMock.mockReset()
    notifyAdminsOfRequestMock.mockResolvedValue(undefined)
    readActivePauseByIdMock.mockReset()
    readPendingEarlyResumeRequestForPauseMock.mockReset()
    readStaffProfileMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates a staff early resume request and notifies admins', async () => {
    const { client, inserts } = createPauseResumeRequestClient()
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
      member: {
        name: 'Jane Doe',
      },
    })
    readPendingEarlyResumeRequestForPauseMock.mockResolvedValue(null)
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(inserts).toEqual([
      {
        pause_id: 'pause-1',
        member_id: 'member-1',
        requested_by: 'staff-1',
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
      id: 'resume-request-1',
    })
  })

  it('returns 401 when the user is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when an admin tries to create an early resume request', async () => {
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
      new Request('http://localhost/api/members/pauses/pause-1/resume-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(readActivePauseByIdMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Admins should end pauses directly.',
    })
  })

  it('returns 404 when there is no active pause for the request', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(createPauseResumeRequestClient().client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readActivePauseByIdMock.mockResolvedValue(null)
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Active pause not found.',
    })
  })

  it('returns 400 for a duplicate pending early resume request using the current behavior', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(createPauseResumeRequestClient().client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions())
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
      member: {
        name: 'Jane Doe',
      },
    })
    readPendingEarlyResumeRequestForPauseMock.mockResolvedValue({
      id: 'resume-request-1',
    })
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR,
    })
  })
})
