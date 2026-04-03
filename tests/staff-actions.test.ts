import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateStaff } from '@/lib/staff-actions'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('staff actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('updates a staff profile through the PATCH route using only editable fields', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          profile: {
            id: 'staff-1',
            name: 'Jordan Trainer',
            email: 'jordan@evolutionzfitness.com',
            role: 'staff',
            title: 'Trainer',
            phone: '876-555-0100',
            gender: 'male',
            remark: 'Updated remark',
            photoUrl: null,
            created_at: '2026-04-03T00:00:00.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const profile = await updateStaff('staff-1', {
      name: 'Jordan Trainer',
      phone: '876-555-0100',
      gender: 'male',
      remark: 'Updated remark',
      title: 'Trainer',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/staff/staff-1')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      name: 'Jordan Trainer',
      phone: '876-555-0100',
      gender: 'male',
      remark: 'Updated remark',
      title: 'Trainer',
    })
    expect(profile.title).toBe('Trainer')
    expect(profile.email).toBe('jordan@evolutionzfitness.com')
  })

  it('omits gender from the PATCH payload when it is unchanged in the edit flow', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          profile: {
            id: 'staff-1',
            name: 'Jordan Trainer',
            email: 'jordan@evolutionzfitness.com',
            role: 'staff',
            title: 'Trainer',
            phone: '876-555-0100',
            gender: 'other',
            remark: 'Updated remark',
            photoUrl: null,
            created_at: '2026-04-03T00:00:00.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await updateStaff('staff-1', {
      name: 'Jordan Trainer',
      phone: '876-555-0100',
      remark: 'Updated remark',
      title: 'Trainer',
    })

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      name: 'Jordan Trainer',
      phone: '876-555-0100',
      remark: 'Updated remark',
      title: 'Trainer',
    })
  })
})
