import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  provisionMemberAccessMock,
  readMemberWithCardCodeMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  provisionMemberAccessMock: vi.fn(),
  readMemberWithCardCodeMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/member-provisioning-server', () => ({
  provisionMemberAccess: provisionMemberAccessMock,
}))

vi.mock('@/lib/members', async () => {
  const actual = await vi.importActual<typeof import('@/lib/members')>('@/lib/members')

  return {
    ...actual,
    readMemberWithCardCode: readMemberWithCardCodeMock,
  }
})

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { MEMBER_JOIN_DATE_WARNING, POST } from '@/app/api/members/route'

const MEMBER_TYPE_ID_GENERAL = '11111111-1111-4111-8111-111111111111'

const VALID_MEMBER_REQUEST = {
  name: 'Jane Doe',
  type: 'General',
  member_type_id: MEMBER_TYPE_ID_GENERAL,
  gender: 'Female',
  email: 'jane@example.com',
  phone: '876-555-1212',
  remark: 'Prefers mornings',
  beginTime: '2026-04-01T00:00:00',
  endTime: '2026-05-01T23:59:59',
  cardNo: '0102857149',
  cardCode: 'A18',
} as const

function createMember(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'member-1',
    employeeNo: '000611',
    name: 'Jane Doe',
    cardNo: '0102857149',
    cardCode: 'A18',
    cardStatus: 'assigned',
    cardLostAt: null,
    type: 'General',
    memberTypeId: MEMBER_TYPE_ID_GENERAL,
    status: 'Active',
    deviceAccessState: 'ready',
    gender: 'Female',
    email: 'jane@example.com',
    phone: '876-555-1212',
    remark: 'Prefers mornings',
    photoUrl: null,
    joinedAt: null,
    beginTime: '2026-04-01T00:00:00.000Z',
    endTime: '2026-05-01T23:59:59.000Z',
    ...overrides,
  }
}

function createMembersRouteClient(options: {
  joinedAtUpdateError?: { message: string } | null
} = {}) {
  const joinedAtUpdates: Array<{ memberId: string; joinedAt: string | null }> = []

  return {
    joinedAtUpdates,
    client: {
      from(table: string) {
        if (table !== 'members') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          update(values: { joined_at: string | null }) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')

                return {
                  select(columns: string) {
                    expect(columns).toBe('id')

                    return {
                      maybeSingle() {
                        joinedAtUpdates.push({
                          memberId: value,
                          joinedAt: values.joined_at,
                        })

                        return Promise.resolve({
                          data: options.joinedAtUpdateError ? null : { id: value },
                          error: options.joinedAtUpdateError ?? null,
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

describe('POST /api/members', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    provisionMemberAccessMock.mockReset()
    readMemberWithCardCodeMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates a member, persists joined_at, and returns the refreshed member', async () => {
    const { client, joinedAtUpdates } = createMembersRouteClient()
    const provisionedMember = createMember()
    const refreshedMember = createMember({
      joinedAt: '2026-04-12',
      name: 'Refreshed Jane Doe',
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: provisionedMember,
    })
    readMemberWithCardCodeMock.mockResolvedValue(refreshedMember)
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_MEMBER_REQUEST,
          joined_at: '2026-04-12',
        }),
      }),
    )

    expect(provisionMemberAccessMock).toHaveBeenCalledWith({
      name: 'Jane Doe',
      type: 'General',
      memberTypeId: MEMBER_TYPE_ID_GENERAL,
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers mornings',
      beginTime: '2026-04-01T00:00:00',
      endTime: '2026-05-01T23:59:59',
      cardNo: '0102857149',
      cardCode: 'A18',
    })
    expect(joinedAtUpdates).toEqual([
      {
        memberId: 'member-1',
        joinedAt: '2026-04-12',
      },
    ])
    expect(readMemberWithCardCodeMock).toHaveBeenCalledWith(client, 'member-1')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: refreshedMember,
    })
  })

  it('returns the provisioned member when joined_at is omitted', async () => {
    const { client, joinedAtUpdates } = createMembersRouteClient()
    const provisionedMember = createMember()
    getSupabaseAdminClientMock.mockReturnValue(client)
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: provisionedMember,
    })
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_MEMBER_REQUEST),
      }),
    )

    expect(joinedAtUpdates).toEqual([])
    expect(readMemberWithCardCodeMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: provisionedMember,
    })
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the request is made by a non-admin user', async () => {
    mockForbidden()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns 400 for an invalid JSON body', async () => {
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"name"',
      }),
    )

    expect(provisionMemberAccessMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })

  it('returns 400 when required fields are invalid or missing', async () => {
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_MEMBER_REQUEST,
          name: '',
        }),
      }),
    )
    const body = await response.json()

    expect(provisionMemberAccessMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Name is required.')
  })

  it('propagates provisionMemberAccess failures using the current error path', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createMembersRouteClient().client)
    provisionMemberAccessMock.mockResolvedValue({
      ok: false,
      error: 'Failed to issue card 0102857149: Add card job failed.',
      status: 502,
    })
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_MEMBER_REQUEST),
      }),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to issue card 0102857149: Add card job failed.',
    })
  })

  it('returns success with a warning when joined_at update fails after member creation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, joinedAtUpdates } = createMembersRouteClient({
      joinedAtUpdateError: {
        message: 'update failed',
      },
    })
    const provisionedMember = createMember()
    getSupabaseAdminClientMock.mockReturnValue(client)
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: provisionedMember,
    })
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_MEMBER_REQUEST,
          joined_at: '2026-04-12',
        }),
      }),
    )

    expect(joinedAtUpdates).toEqual([
      {
        memberId: 'member-1',
        joinedAt: '2026-04-12',
      },
    ])
    expect(readMemberWithCardCodeMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: provisionedMember,
      warning: MEMBER_JOIN_DATE_WARNING,
    })
  })

  it('returns success with a warning when the member reread is unavailable after joined_at persists', async () => {
    const { client } = createMembersRouteClient()
    const provisionedMember = createMember()
    getSupabaseAdminClientMock.mockReturnValue(client)
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: provisionedMember,
    })
    readMemberWithCardCodeMock.mockResolvedValue(null)
    mockAdminUser()

    const response = await POST(
      new Request('http://localhost/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_MEMBER_REQUEST,
          joined_at: '2026-04-12',
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: provisionedMember,
      warning: MEMBER_JOIN_DATE_WARNING,
    })
  })
})
