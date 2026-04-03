// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { RoleGuard } from '@/components/role-guard'
import type { Profile } from '@/types'

type SessionUser = {
  id: string
  email: string
}

type SessionLike = {
  user: SessionUser
} | null

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Kevin Morrison',
    email: overrides.email ?? 'kevin@evolutionzfitness.com',
    role: overrides.role ?? 'admin',
    title: overrides.title ?? 'Owner',
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function createSupabaseBrowserClient({
  session = null,
  profiles = [],
}: {
  session?: SessionLike
  profiles?: Profile[]
} = {}) {
  let activeSession = session
  let authCallback: ((event: string, nextSession: SessionLike) => void | Promise<void>) | null = null
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))

  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        authCallback = callback
        void Promise.resolve().then(() => authCallback?.('INITIAL_SESSION', activeSession))

        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(() => {
                if (authCallback === callback) {
                  authCallback = null
                }
              }),
            },
          },
        }
      }),
    },
    from: vi.fn((table: string) => {
      expect(table).toBe('profiles')

      return {
        select: vi.fn((columns: string) => {
          expect(columns).toBe(
            'id, name, email, role, title, phone, gender, remark, photoUrl:photo_url, created_at',
          )

          return {
            eq: vi.fn((column: string, value: string) => {
              expect(column).toBe('id')

              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: profileMap.get(value) ?? null,
                  error: null,
                }),
              }
            }),
          }
        }),
      }
    }),
  }

  return {
    client,
    async emitAuthStateChange(event: string, nextSession: SessionLike) {
      activeSession = nextSession
      await authCallback?.(event, nextSession)
    },
  }
}

function AuthHarness() {
  const { user, profile, role, loading } = useAuth()

  return (
    <>
      <output data-testid="auth-state">
        {JSON.stringify({
          userId: user?.id ?? null,
          email: user?.email ?? null,
          name: profile?.name ?? null,
          title: profile?.title ?? null,
          phone: profile?.phone ?? null,
          gender: profile?.gender ?? null,
          remark: profile?.remark ?? null,
          photoUrl: profile?.photoUrl ?? null,
          role,
          loading,
        })}
      </output>
      <RoleGuard role="admin" fallback={<span data-testid="guard">hidden</span>}>
        <span data-testid="guard">visible</span>
      </RoleGuard>
    </>
  )
}

function readAuthState(container: HTMLDivElement) {
  const output = container.querySelector('[data-testid="auth-state"]')

  if (!(output instanceof HTMLOutputElement)) {
    throw new Error('Auth state output not found.')
  }

  return JSON.parse(output.textContent ?? '{}') as {
    userId: string | null
    email: string | null
    name: string | null
    title: string | null
    phone: string | null
    gender: Profile['gender'] | null
    remark: string | null
    photoUrl: string | null
    role: Profile['role'] | null
    loading: boolean
  }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AuthProvider', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.restoreAllMocks()
  })

  it('loads the active session profile and exposes the current role to RoleGuard', async () => {
    const adminProfile = createProfile()
    const supabase = createSupabaseBrowserClient({
      session: {
        user: {
          id: adminProfile.id,
          email: adminProfile.email,
        },
      },
      profiles: [adminProfile],
    })

    createClientMock.mockReturnValue(supabase.client)

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthHarness />
        </AuthProvider>,
      )
    })

    await flushAsyncWork()

    expect(readAuthState(container)).toEqual({
      userId: 'user-1',
      email: 'kevin@evolutionzfitness.com',
      name: 'Kevin Morrison',
      title: 'Owner',
      phone: null,
      gender: null,
      remark: null,
      photoUrl: null,
      role: 'admin',
      loading: false,
    })
    expect(supabase.client.from).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="guard"]')?.textContent).toBe('visible')
  })

  it('keeps the session in sync when Supabase auth state changes', async () => {
    const staffProfile = createProfile({
      id: 'user-2',
      name: 'Front Desk',
      email: 'staff@evolutionzfitness.com',
      role: 'staff',
      title: 'Reception',
    })
    const adminProfile = createProfile()
    const supabase = createSupabaseBrowserClient({
      session: {
        user: {
          id: staffProfile.id,
          email: staffProfile.email,
        },
      },
      profiles: [staffProfile, adminProfile],
    })

    createClientMock.mockReturnValue(supabase.client)

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthHarness />
        </AuthProvider>,
      )
    })

    await flushAsyncWork()

    expect(readAuthState(container)).toMatchObject({
      userId: 'user-2',
      role: 'staff',
      loading: false,
    })
    expect(container.querySelector('[data-testid="guard"]')?.textContent).toBe('hidden')

    await act(async () => {
      await supabase.emitAuthStateChange('SIGNED_IN', {
        user: {
          id: adminProfile.id,
          email: adminProfile.email,
        },
      })
    })

    await flushAsyncWork()

    expect(readAuthState(container)).toMatchObject({
      userId: 'user-1',
      role: 'admin',
      loading: false,
    })
    expect(container.querySelector('[data-testid="guard"]')?.textContent).toBe('visible')
    expect(supabase.client.from).toHaveBeenCalledTimes(2)
  })

  it('does not refetch the profile for repeated auth events from the same user', async () => {
    const adminProfile = createProfile()
    const session = {
      user: {
        id: adminProfile.id,
        email: adminProfile.email,
      },
    }
    const supabase = createSupabaseBrowserClient({
      session,
      profiles: [adminProfile],
    })

    createClientMock.mockReturnValue(supabase.client)

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthHarness />
        </AuthProvider>,
      )
    })

    await flushAsyncWork()

    expect(supabase.client.from).toHaveBeenCalledTimes(1)

    await act(async () => {
      await supabase.emitAuthStateChange('TOKEN_REFRESHED', session)
    })

    await flushAsyncWork()

    expect(readAuthState(container)).toMatchObject({
      userId: 'user-1',
      role: 'admin',
      loading: false,
    })
    expect(supabase.client.from).toHaveBeenCalledTimes(1)
  })
})
