import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  readTrainerClientsMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readTrainerClientsMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedProfile: mod.requireAuthenticatedProfileMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/pt-scheduling-server', () => ({
  readTrainerClients: readTrainerClientsMock,
}))

import { GET } from '@/app/api/trainer/commission/route'

describe('GET /api/trainer/commission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    readTrainerClientsMock.mockReset()
    resetServerAuthMocks()
  })

  it('allows staff with Trainer title to read their commission', async () => {
    const supabase = { from: vi.fn() }
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    readTrainerClientsMock.mockResolvedValue([
      {
        id: 'assignment-1',
        memberName: 'John Doe',
        commissionOverride: 12000,
      },
      {
        id: 'assignment-2',
        memberName: 'Jane Smith',
        commissionOverride: null,
      },
    ])

    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-uuid-123',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(readTrainerClientsMock).toHaveBeenCalledWith(supabase, {
      trainerId: 'trainer-uuid-123',
      status: 'active',
    })

    const body = await response.json()
    expect(body).toEqual({
      assignments: [
        {
          id: 'assignment-1',
          memberName: 'John Doe',
          commissionRate: 12000,
        },
        {
          id: 'assignment-2',
          memberName: 'Jane Smith',
          commissionRate: 10500,
        },
      ],
    })
  })

  it('allows admins to read their own commission context', async () => {
    const supabase = { from: vi.fn() }
    getSupabaseAdminClientMock.mockReturnValue(supabase)
    readTrainerClientsMock.mockResolvedValue([])

    mockAuthenticatedProfile({
      profile: {
        id: 'admin-uuid-456',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(readTrainerClientsMock).toHaveBeenCalledWith(supabase, {
      trainerId: 'admin-uuid-456',
      status: 'active',
    })

    const body = await response.json()
    expect(body).toEqual({ assignments: [] })
  })

  it('rejects administrative assistants with a 403 Forbidden', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: 'assistant-uuid-789',
        role: 'staff',
        titles: ['Administrative Assistant'],
      },
    })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(readTrainerClientsMock).not.toHaveBeenCalled()

    const body = await response.json()
    expect(body).toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('rejects non-trainer staff with a 403 Forbidden', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: 'assistant-uuid-789',
        role: 'staff',
        titles: ['Assistant'],
      },
    })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(readTrainerClientsMock).not.toHaveBeenCalled()

    const body = await response.json()
    expect(body).toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })
})
