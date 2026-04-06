import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  readTrainerClientByIdMock,
  readTrainerClientsMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readTrainerClientByIdMock: vi.fn(),
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
  readTrainerClientById: readTrainerClientByIdMock,
  readTrainerClients: readTrainerClientsMock,
}))

import { GET } from '@/app/api/pt/assignments/route'

describe('GET /api/pt/assignments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    readTrainerClientByIdMock.mockReset()
    readTrainerClientsMock.mockReset()
    resetServerAuthMocks()
  })

  it('forces trainerId to the authenticated staff profile', async () => {
    const supabase = { from: vi.fn() }

    getSupabaseAdminClientMock.mockReturnValue(supabase)
    readTrainerClientsMock.mockResolvedValue([])
    mockAuthenticatedProfile({
      profile: {
        id: '55555555-5555-4555-8555-555555555555',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/assignments?status=active'))

    expect(response.status).toBe(200)
    expect(readTrainerClientsMock).toHaveBeenCalledWith(supabase, {
      status: 'active',
      trainerId: '55555555-5555-4555-8555-555555555555',
    })
    await expect(response.json()).resolves.toEqual({ assignments: [] })
  })

  it('rejects staff requests for another trainerId', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: '55555555-5555-4555-8555-555555555555',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(
      new Request(
        'http://localhost/api/pt/assignments?trainerId=66666666-6666-4666-8666-666666666666',
      ),
    )

    expect(response.status).toBe(403)
    expect(readTrainerClientsMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })
})
