import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'
import { PATCH } from '@/app/api/cards/[cardNo]/decommission/route'
import type { CardStatus } from '@/types'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

function createCardsDecommissionAdminClient({
  existingCard = {
    card_no: '0102857149',
    status: 'available' as CardStatus,
  },
  existingCardError = null,
  updateResult = {
    data: {
      card_no: '0102857149',
    },
    error: null,
  },
}: {
  existingCard?: { card_no: string | null; status: CardStatus | null } | null
  existingCardError?: { message: string } | null
  updateResult?: {
    data: { card_no: string | null } | null
    error: { message: string } | null
  }
} = {}) {
  const updateCalls: Array<{ status: 'decommissioned' }> = []

  return {
    updateCalls,
    client: {
      from(table: string) {
        expect(table).toBe('cards')

        return {
          select(columns: string) {
            expect(columns).toBe('card_no, status')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('card_no')
                expect(value).toBe('0102857149')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: existingCard,
                      error: existingCardError,
                    })
                  },
                }
              },
            }
          },
          update(values: { status: 'decommissioned' }) {
            updateCalls.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('card_no')
                expect(value).toBe('0102857149')

                return {
                  eq(statusColumn: string, statusValue: 'available') {
                    expect(statusColumn).toBe('status')
                    expect(statusValue).toBe('available')

                    return {
                      select(columns: string) {
                        expect(columns).toBe('card_no')

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
        }
      },
    },
  }
}

describe('PATCH /api/cards/[cardNo]/decommission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('decommissions available cards for admins', async () => {
    const { client, updateCalls } = createCardsDecommissionAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await PATCH(new Request('http://localhost/api/cards/0102857149/decommission'), {
      params: Promise.resolve({ cardNo: '0102857149' }),
    })

    expect(response.status).toBe(200)
    expect(updateCalls).toEqual([{ status: 'decommissioned' }])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns 404 when the card does not exist', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createCardsDecommissionAdminClient({
        existingCard: null,
      }).client,
    )

    const response = await PATCH(new Request('http://localhost/api/cards/missing/decommission'), {
      params: Promise.resolve({ cardNo: '0102857149' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Card not found.',
    })
  })

  it.each(['assigned', 'decommissioned', 'disabled', 'suspended_lost'] as const)(
    'returns 400 when the current card status is %s',
    async (status) => {
      const { client, updateCalls } = createCardsDecommissionAdminClient({
        existingCard: {
          card_no: '0102857149',
          status,
        },
      })
      getSupabaseAdminClientMock.mockReturnValue(client)

      const response = await PATCH(
        new Request('http://localhost/api/cards/0102857149/decommission'),
        {
          params: Promise.resolve({ cardNo: '0102857149' }),
        },
      )

      expect(response.status).toBe(400)
      expect(updateCalls).toEqual([])
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'Only available cards can be decommissioned.',
      })
    },
  )

  it('returns 500 when reading the existing card fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getSupabaseAdminClientMock.mockReturnValue(
      createCardsDecommissionAdminClient({
        existingCardError: {
          message: 'select exploded',
        },
      }).client,
    )

    const response = await PATCH(new Request('http://localhost/api/cards/0102857149/decommission'), {
      params: Promise.resolve({ cardNo: '0102857149' }),
    })

    expect(response.status).toBe(500)
    expect(consoleErrorSpy).toHaveBeenCalledOnce()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to read card before decommissioning:', {
      normalizedCardNo: '0102857149',
      error: {
        message: 'select exploded',
      },
    })
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to decommission card',
    })
  })

  it('returns 500 when decommissioning the card fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getSupabaseAdminClientMock.mockReturnValue(
      createCardsDecommissionAdminClient({
        updateResult: {
          data: null,
          error: {
            message: 'update exploded',
          },
        },
      }).client,
    )

    const response = await PATCH(new Request('http://localhost/api/cards/0102857149/decommission'), {
      params: Promise.resolve({ cardNo: '0102857149' }),
    })

    expect(response.status).toBe(500)
    expect(consoleErrorSpy).toHaveBeenCalledOnce()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to decommission card:', {
      normalizedCardNo: '0102857149',
      error: {
        message: 'update exploded',
      },
    })
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to decommission card',
    })
  })

  it('passes through auth failures', async () => {
    mockUnauthorized()

    const response = await PATCH(new Request('http://localhost/api/cards/0102857149/decommission'), {
      params: Promise.resolve({ cardNo: '0102857149' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })
})
