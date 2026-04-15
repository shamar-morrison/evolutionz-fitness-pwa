import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_FEE_AMOUNT_JMD } from '@/lib/business-constants'
import {
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

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

import {
  GET as getCardFeeSettings,
  PATCH as patchCardFeeSettings,
} from '@/app/api/settings/card-fee/route'

type CardFeeSettingsRow = {
  id: number
  amount_jmd: number
  created_at: string
  updated_at: string
}

function createSettingsRow(
  overrides: Partial<CardFeeSettingsRow> = {},
): CardFeeSettingsRow {
  return {
    id: overrides.id ?? 1,
    amount_jmd: overrides.amount_jmd ?? DEFAULT_CARD_FEE_AMOUNT_JMD,
    created_at: overrides.created_at ?? '2026-04-15T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-15T00:00:00.000Z',
  }
}

function createCardFeeSettingsClient(options: {
  row?: CardFeeSettingsRow | null
  readError?: { message: string } | null
  upsertError?: { message: string } | null
} = {}) {
  let row = options.row ?? createSettingsRow()
  const upsertCalls: Array<{
    values: Record<string, unknown>
    options: { onConflict: string }
  }> = []

  return {
    upsertCalls,
    client: {
      from(table: string) {
        expect(table).toBe('card_fee_settings')

        return {
          select(columns: string) {
            expect(columns).toBe('*')

            return {
              eq(column: string, value: number) {
                expect(column).toBe('id')
                expect(value).toBe(1)

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: row,
                      error: options.readError ?? null,
                    })
                  },
                }
              },
            }
          },
          upsert(values: Record<string, unknown>, upsertOptions: { onConflict: string }) {
            upsertCalls.push({
              values,
              options: upsertOptions,
            })

            row = {
              ...(row ?? createSettingsRow()),
              ...(values as Partial<CardFeeSettingsRow>),
            }

            return {
              select(columns: string) {
                expect(columns).toBe('*')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: row,
                      error: options.upsertError ?? null,
                    })
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

describe('card fee settings routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the current card fee settings for admins', async () => {
    const client = createCardFeeSettingsClient({
      row: createSettingsRow({
        amount_jmd: 3200,
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await getCardFeeSettings()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: {
        amountJmd: 3200,
      },
    })
  })

  it('falls back to the default card fee amount when the singleton row is missing', async () => {
    const client = createCardFeeSettingsClient({
      row: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await getCardFeeSettings()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: {
        amountJmd: DEFAULT_CARD_FEE_AMOUNT_JMD,
      },
    })
  })

  it('returns 401 when card fee settings are requested without an admin session', async () => {
    mockUnauthorized()

    const response = await getCardFeeSettings()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('updates the card fee settings for admins', async () => {
    const client = createCardFeeSettingsClient()
    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await patchCardFeeSettings(
      new Request('http://localhost/api/settings/card-fee', {
        method: 'PATCH',
        body: JSON.stringify({
          amountJmd: 3400,
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: {
        amountJmd: 3400,
      },
    })
    expect(client.upsertCalls).toEqual([
      {
        values: {
          id: 1,
          amount_jmd: 3400,
          updated_at: expect.any(String),
        },
        options: {
          onConflict: 'id',
        },
      },
    ])
  })

  it('returns 403 when a non-admin attempts to update the card fee settings', async () => {
    mockForbidden()

    const response = await patchCardFeeSettings(
      new Request('http://localhost/api/settings/card-fee', {
        method: 'PATCH',
        body: JSON.stringify({
          amountJmd: 3400,
        }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('rejects invalid JSON bodies', async () => {
    const response = await patchCardFeeSettings(
      new Request('http://localhost/api/settings/card-fee', {
        method: 'PATCH',
        body: '{',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })

  it('rejects non-integer card fee amounts', async () => {
    const response = await patchCardFeeSettings(
      new Request('http://localhost/api/settings/card-fee', {
        method: 'PATCH',
        body: JSON.stringify({
          amountJmd: 3200.5,
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'amountJmd must be a whole number greater than 0.',
    })
  })

  it('rejects non-positive card fee amounts', async () => {
    const response = await patchCardFeeSettings(
      new Request('http://localhost/api/settings/card-fee', {
        method: 'PATCH',
        body: JSON.stringify({
          amountJmd: 0,
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'amountJmd must be a whole number greater than 0.',
    })
  })
})
