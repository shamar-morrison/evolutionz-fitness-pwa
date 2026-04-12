import { afterEach, describe, expect, it, vi } from 'vitest'
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

import { DELETE, POST } from '@/app/api/members/[id]/photo/route'
import { MEMBER_RECORD_SELECT } from '@/lib/members'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function buildMemberRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'member-1',
    employee_no: '000611',
    name: 'Jane Doe',
    card_no: null,
    type: 'General',
    status: 'Active',
    gender: null,
    email: null,
    phone: null,
    remark: null,
    photo_url: null,
    begin_time: '2026-03-30T00:00:00Z',
    end_time: '2026-07-15T23:59:59Z',
    updated_at: '2026-03-30T14:15:16Z',
    ...overrides,
  }
}

function createMemberPhotoAdminClient({
  memberReads = [buildMemberRow()],
  updateResult = {
    data: { id: 'member-1' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
  uploadResult = {
    data: { path: 'member-1.jpg' },
    error: null,
  },
  removeResult = {
    data: [],
    error: null,
  },
  publicUrl = 'https://public.example.com/member-photos/member-1.jpg',
}: {
  memberReads?: Array<Record<string, unknown> | null>
  updateResult?: QueryResult<{ id: string }>
  uploadResult?: { data: { path?: string } | null; error: { message: string } | null }
  removeResult?: { data: unknown; error: { message: string } | null }
  publicUrl?: string
} = {}) {
  const uploadCalls: Array<{
    path: string
    contentType: string
    upsert: boolean
    body: ArrayBuffer
  }> = []
  const removeCalls: string[][] = []
  const updateValues: Array<{ photo_url: string | null }> = []
  let memberReadIndex = 0

  return {
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe(MEMBER_RECORD_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-1')

                  return {
                    maybeSingle() {
                      const nextMember = memberReads[Math.min(memberReadIndex, memberReads.length - 1)] ?? null
                      memberReadIndex += 1

                      return Promise.resolve({
                        data: nextMember,
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
                  expect(value).toBe('member-1')

                  return {
                    select(columns: string) {
                      expect(columns).toBe(MEMBER_RECORD_SELECT)

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
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe('member-photos')

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
            getPublicUrl(path: string) {
              expect(path).toBe('member-1.jpg')

              return {
                data: { publicUrl },
              }
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

describe('/api/members/[id]/photo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('uploads the photo, persists the path, and returns the hydrated member', async () => {
    const { client, uploadCalls, updateValues, removeCalls } = createMemberPhotoAdminClient({
      memberReads: [
        buildMemberRow(),
        buildMemberRow({ photo_url: 'member-1.jpg' }),
      ],
    })
    const formData = new FormData()

    formData.append('photo', new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/members/member-1/photo', {
        method: 'POST',
        body: formData,
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]?.path).toBe('member-1.jpg')
    expect(uploadCalls[0]?.contentType).toBe('image/jpeg')
    expect(uploadCalls[0]?.upsert).toBe(true)
    expect(updateValues).toEqual([{ photo_url: 'member-1.jpg' }])
    expect(removeCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: '000611',
        name: 'Jane Doe',
        cardNo: null,
        cardCode: null,
        cardStatus: null,
        cardLostAt: null,
        type: 'General',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: 'https://public.example.com/member-photos/member-1.jpg',
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('returns an error when storage upload fails', async () => {
    const { client, updateValues } = createMemberPhotoAdminClient({
      uploadResult: {
        data: null,
        error: { message: 'Upload failed.' },
      },
    })
    const formData = new FormData()

    formData.append('photo', new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/members/member-1/photo', {
        method: 'POST',
        body: formData,
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to upload member photo: Upload failed.',
    })
  })

  it('cleans up the uploaded object when the database update fails', async () => {
    const { client, removeCalls, updateValues } = createMemberPhotoAdminClient({
      updateResult: {
        data: null,
        error: { message: 'Database write failed.' },
      },
    })
    const formData = new FormData()

    formData.append('photo', new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/members/member-1/photo', {
        method: 'POST',
        body: formData,
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(updateValues).toEqual([{ photo_url: 'member-1.jpg' }])
    expect(removeCalls).toEqual([['member-1.jpg']])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to update member member-1: Database write failed.',
    })
  })

  it('deletes the member photo and clears the stored path', async () => {
    const { client, removeCalls, updateValues } = createMemberPhotoAdminClient({
      memberReads: [
        buildMemberRow({ photo_url: 'member-1.jpg' }),
        buildMemberRow({ photo_url: null }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/members/member-1/photo', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(removeCalls).toEqual([['member-1.jpg']])
    expect(updateValues).toEqual([{ photo_url: null }])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: '000611',
        name: 'Jane Doe',
        cardNo: null,
        cardCode: null,
        cardStatus: null,
        cardLostAt: null,
        type: 'General',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: null,
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('returns 404 when deleting a photo for a missing member', async () => {
    const { client, removeCalls, updateValues } = createMemberPhotoAdminClient({
      memberReads: [null],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/members/missing/photo', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(404)
    expect(removeCalls).toEqual([])
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member not found.',
    })
  })

  it('returns 400 when deleting a photo for a member without one', async () => {
    const { client, removeCalls, updateValues } = createMemberPhotoAdminClient({
      memberReads: [buildMemberRow({ photo_url: null })],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(
      new Request('http://localhost/api/members/member-1/photo', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(removeCalls).toEqual([])
    expect(updateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member photo not found.',
    })
  })
})
