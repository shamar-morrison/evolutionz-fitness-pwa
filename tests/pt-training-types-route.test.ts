import { afterEach, describe, expect, it, vi } from 'vitest'
import { PREDEFINED_TRAINING_TYPES } from '@/lib/pt-scheduling'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/pt/training-types/route'

describe('PT training types route', () => {
  afterEach(() => {
    vi.clearAllMocks()
    resetServerAuthMocks()
  })

  it('returns the predefined training type list for authenticated users', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=60, stale-while-revalidate=300',
    )
    expect(payload).toEqual({
      types: [...PREDEFINED_TRAINING_TYPES],
    })
  })

  it('requires authentication', async () => {
    mockUnauthorized()

    const response = await GET()

    expect(response.status).toBe(401)
  })
})
