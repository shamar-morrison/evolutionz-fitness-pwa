import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAFF_PROFILE_SELECT } from '@/lib/staff'
import { resetServerAuthMocks } from '@/tests/support/server-auth'

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

import { DELETE, POST } from '@/app/api/staff/[id]/photo/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function buildProfileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'staff-1',
    name: 'Admin User',
    email: 'admin@evolutionzfitness.com',
    role: 'admin',
    titles: ['Owner'],
    phone: null,
    gender: null,
    remark: null,
    specialties: [],
    photoUrl: null,
    archivedAt: null,
    created_at: '2026-04-03T00:00:00.000Z',
    ...overrides,
  }
}

function createStaffPhotoAdminClient({
  profileReads = [buildProfileRow()],
  updateResult = {
    data: { id: 'staff-1' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
  uploadResult = {
    data: { path: 'staff-1.jpg' },
    error: null,
  },
  removeResult = {
    data: [],
    error: null,
  },
}: {
  profileReads?: Array<Record<string, unknown> | null>
  updateResult?: QueryResult<{ id: string }>
  uploadResult?: {
    data: { path?: string } | null
    error: { message: string } | null
  }
  removeResult?: {
    data: unknown
    error: { message: string } | null
  }
} = {}) {
  const uploadCalls: Array<{
    path: string
    contentType: string
    upsert: boolean
    body: ArrayBuffer
  }> = []
  const removeCalls: string[][] = []
  const updateValues: Array<{ photo_url: string | null }> = []
  let profileReadIndex = 0

  return {
    client: {
      from(table: string) {
        expect(table).toBe('profiles')

        return {
          select(columns: string) {
            expect(columns).toBe(STAFF_PROFILE_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('staff-1')

                return {
                  maybeSingle() {
                    const nextProfile =
                      profileReads[Math.min(profileReadIndex, profileReads.length - 1)] ?? null
                    profileReadIndex += 1

                    return Promise.resolve({
                      data: nextProfile,
                      error: null,
                    })
                  },
                }
              },
            }
          },
          update(values: { photo_url: string | null }) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('staff-1')

                return {
                  select(columns: string) {
                    expect(columns).toBe('id')

                    return {
                      maybeSingle() {
                        return Promise.resolve(updateResult)
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe('staff-photos')

          return {
            upload(path: string, body: ArrayBuffer, options: { contentType: string; upsert: boolean }) {
              uploadCalls.push({
                path,
                body,
                contentType: options.contentType,
                upsert: options.upsert,
              })

              return Promise.resolve(uploadResult)
            },
            remove(paths: string[]) {
              removeCalls.push(paths)
              return Promise.resolve(removeResult)
            },
          }
        },
      },
    },
    uploadCalls,
    removeCalls,
    updateValues,
  }
}

describe('/api/staff/[id]/photo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('uploads the photo and persists the storage key', async () => {
    const { client, uploadCalls, updateValues, removeCalls } = createStaffPhotoAdminClient()
    const formData = new FormData()

    formData.append('photo', new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/photo', {
        method: 'POST',
        body: formData,
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]?.path).toBe('staff-1.jpg')
    expect(uploadCalls[0]?.contentType).toBe('image/jpeg')
    expect(uploadCalls[0]?.upsert).toBe(true)
    expect(updateValues).toEqual([{ photo_url: 'staff-1.jpg' }])
    expect(removeCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      photo_url: 'staff-1.jpg',
    })
  })

  it('cleans up the uploaded file when the profile update fails', async () => {
    const { client, removeCalls } = createStaffPhotoAdminClient({
      updateResult: {
        data: null,
        error: {
          message: 'Update failed.',
        },
      },
    })
    const formData = new FormData()

    formData.append('photo', new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/photo', {
        method: 'POST',
        body: formData,
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(removeCalls).toEqual([['staff-1.jpg']])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to update staff profile staff-1: Update failed.',
    })
  })

  it('deletes the stored photo and clears the profile field', async () => {
    const { client, removeCalls, updateValues } = createStaffPhotoAdminClient({
      profileReads: [
        buildProfileRow({
          photoUrl: 'staff-1.jpg',
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/staff/staff-1/photo', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(removeCalls).toEqual([['staff-1.jpg']])
    expect(updateValues).toEqual([{ photo_url: null }])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns an error when deleting a photo from a profile with no photo', async () => {
    const { client, removeCalls, updateValues } = createStaffPhotoAdminClient({
      profileReads: [
        buildProfileRow({
          photoUrl: null,
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/staff/staff-1/photo', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(removeCalls).toEqual([])
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Staff photo not found.',
    })
  })

  it('returns 409 when mutating an archived staff photo', async () => {
    const { client, uploadCalls, removeCalls, updateValues } = createStaffPhotoAdminClient({
      profileReads: [
        buildProfileRow({
          photoUrl: 'staff-1.jpg',
          archivedAt: '2026-04-07T18:00:00.000Z',
        }),
      ],
    })
    const formData = new FormData()

    formData.append('photo', new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/staff/staff-1/photo', {
        method: 'POST',
        body: formData,
      }),
      {
        params: Promise.resolve({ id: 'staff-1' }),
      },
    )

    expect(response.status).toBe(409)
    expect(uploadCalls).toEqual([])
    expect(removeCalls).toEqual([])
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Archived staff accounts are read-only.',
    })
  })
})
