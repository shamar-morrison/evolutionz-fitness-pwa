import { NextResponse } from 'next/server'
import { beforeEach, vi } from 'vitest'
import type { Profile } from '@/types'

function createUser(overrides: Partial<{ id: string; email: string }> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'admin@evolutionzfitness.com',
  }
}

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Admin User',
    email: overrides.email ?? 'admin@evolutionzfitness.com',
    role: overrides.role ?? 'admin',
    title: overrides.title ?? 'Owner',
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

export const requireAuthenticatedUserMock = vi.fn()
export const requireAdminUserMock = vi.fn()

export function mockAuthenticatedUser(overrides: Partial<{ id: string; email: string }> = {}) {
  requireAuthenticatedUserMock.mockResolvedValue({
    user: createUser(overrides),
  })
}

export function mockAdminUser(
  overrides: {
    user?: Partial<{ id: string; email: string }>
    profile?: Partial<Profile>
  } = {},
) {
  requireAdminUserMock.mockResolvedValue({
    user: createUser(overrides.user),
    profile: createProfile(overrides.profile),
  })
}

export function mockUnauthorized() {
  requireAuthenticatedUserMock.mockResolvedValue({
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
  requireAdminUserMock.mockResolvedValue({
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  })
}

export function mockForbidden() {
  requireAdminUserMock.mockResolvedValue({
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  })
}

export function resetServerAuthMocks() {
  requireAuthenticatedUserMock.mockReset()
  requireAdminUserMock.mockReset()
  mockAuthenticatedUser()
  mockAdminUser()
}

beforeEach(() => {
  resetServerAuthMocks()
})

resetServerAuthMocks()
