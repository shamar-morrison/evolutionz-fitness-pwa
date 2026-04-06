import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'
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

import { POST } from '@/app/api/access/cards/available/route'

type QueryError = {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

type StoredCardRow = {
  card_no: string
  card_code: string | null
  status: 'available' | 'assigned' | 'suspended_lost' | 'disabled'
  employee_no: string | null
}

type UpdatableStoredCardStatus = 'available' | 'assigned'

function createSyncCardsAdminClient({
  pollResults = [
    {
      data: {
        id: 'job-123',
        status: 'done' as const,
        result: [],
        error: null,
      },
      error: null,
    },
  ],
  existingCards = [],
  selectError = null,
  insertError = null,
  updateErrorsByCardNo = {},
  updateNoRowsByCardNo = {},
}: {
  pollResults?: Array<{
    data: {
      id: string
      status: 'pending' | 'processing' | 'done' | 'failed'
      result: unknown
      error: string | null
    } | null
    error: QueryError | null
  }>
  existingCards?: StoredCardRow[]
  selectError?: QueryError | null
  insertError?: QueryError | null
  updateErrorsByCardNo?: Record<string, QueryError | undefined>
  updateNoRowsByCardNo?: Record<string, boolean | undefined>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const cardsTable = new Map(existingCards.map((card) => [card.card_no, { ...card }]))
  const insertedCardPayloads: Array<
    Array<{
      card_no: string
      card_code: string | null
      status: 'available'
      employee_no: null
    }>
  > = []
  const updatedCardPayloads: Array<{
    cardNo: string
    statusFilter: UpdatableStoredCardStatus
    values: {
      status: 'available'
      employee_no: null
      card_code?: string
    }
  }> = []

  return {
    insertedJobs,
    insertedCardPayloads,
    updatedCardPayloads,
    cardsTable,
    client: {
      from(table: string) {
        if (table === 'access_control_jobs') {
          return accessControlClient.from('access_control_jobs')
        }

        if (table !== 'cards') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            expect(columns).toBe('card_no, card_code, status')

            return {
              in(column: string, values: string[]) {
                expect(column).toBe('card_no')

                return Promise.resolve({
                  data: values
                    .filter((value) => cardsTable.has(value))
                    .map((value) => {
                      const card = cardsTable.get(value)

                      return {
                        card_no: card?.card_no ?? null,
                        card_code: card?.card_code ?? null,
                        status: card?.status ?? null,
                      }
                    }),
                  error: selectError,
                })
              },
            }
          },
          insert(rows: Array<{ card_no: string; card_code: string | null; status: 'available'; employee_no: null }>) {
            insertedCardPayloads.push(rows)

            return {
              select(columns: string) {
                expect(columns).toBe('card_no')

                if (!insertError) {
                  for (const row of rows) {
                    cardsTable.set(row.card_no, {
                      card_no: row.card_no,
                      card_code: row.card_code,
                      status: row.status,
                      employee_no: row.employee_no,
                    })
                  }
                }

                return Promise.resolve({
                  data: insertError ? null : rows.map((row) => ({ card_no: row.card_no })),
                  error: insertError,
                })
              },
            }
          },
          update(values: { status: 'available'; employee_no: null; card_code?: string }) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('card_no')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('status')
                    expect(['available', 'assigned']).toContain(nextValue)
                    const statusFilter = nextValue as UpdatableStoredCardStatus

                    updatedCardPayloads.push({
                      cardNo: value,
                      statusFilter,
                      values,
                    })

                    return {
                      select(columns: string) {
                        expect(columns).toBe('card_no')

                        return {
                          maybeSingle() {
                            const updateError = updateErrorsByCardNo[value] ?? null
                            const shouldReturnNoRow = updateNoRowsByCardNo[value] ?? false
                            const card = cardsTable.get(value)
                            const canUpdate =
                              !updateError && !shouldReturnNoRow && card?.status === statusFilter

                            if (canUpdate) {
                              card.status = values.status
                              card.employee_no = values.employee_no

                              if ('card_code' in values) {
                                card.card_code = values.card_code ?? null
                              }
                            }

                            return Promise.resolve({
                              data: canUpdate ? { card_no: value } : null,
                              error: updateError,
                            })
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

describe('POST /api/access/cards/available', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('queues sync_available_cards and safely persists synced available cards', async () => {
    const { client, insertedJobs, insertedCardPayloads, updatedCardPayloads, cardsTable } =
      createSyncCardsAdminClient({
        pollResults: [
          {
            data: {
              id: 'job-123',
              status: 'done',
              result: [
                { cardNo: '0101', card_code: 'A18' },
                { cardNo: '0101', card_code: null },
                { cardNo: '0102', card_code: 'B2' },
                { cardNo: '0103', card_code: null },
                { cardNo: '0104', card_code: 'C7' },
              ],
              error: null,
            },
            error: null,
          },
        ],
        existingCards: [
          { card_no: '0101', card_code: null, status: 'available', employee_no: 'stale-user' },
          { card_no: '0102', card_code: 'KEEP', status: 'assigned', employee_no: '000611' },
          { card_no: '0103', card_code: 'P42', status: 'available', employee_no: null },
        ],
      })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'sync_available_cards',
        payload: {},
      },
    ])
    expect(insertedCardPayloads).toEqual([
      [
        {
          card_no: '0104',
          card_code: 'C7',
          status: 'available',
          employee_no: null,
        },
      ],
    ])
    expect(updatedCardPayloads).toEqual([
      {
        cardNo: '0101',
        statusFilter: 'available',
        values: {
          status: 'available',
          employee_no: null,
          card_code: 'A18',
        },
      },
      {
        cardNo: '0102',
        statusFilter: 'assigned',
        values: {
          status: 'available',
          employee_no: null,
          card_code: 'B2',
        },
      },
      {
        cardNo: '0103',
        statusFilter: 'available',
        values: {
          status: 'available',
          employee_no: null,
        },
      },
    ])
    expect(cardsTable.get('0101')).toEqual({
      card_no: '0101',
      card_code: 'A18',
      status: 'available',
      employee_no: null,
    })
    expect(cardsTable.get('0102')).toEqual({
      card_no: '0102',
      card_code: 'B2',
      status: 'available',
      employee_no: null,
    })
    expect(cardsTable.get('0103')).toEqual({
      card_no: '0103',
      card_code: 'P42',
      status: 'available',
      employee_no: null,
    })
    expect(cardsTable.get('0104')).toEqual({
      card_no: '0104',
      card_code: 'C7',
      status: 'available',
      employee_no: null,
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      syncedCards: 2,
    })
  })

  it('does not count available-to-available refreshes in syncedCards', async () => {
    const { client, updatedCardPayloads, cardsTable } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: [{ cardNo: '0101', card_code: 'A18' }],
            error: null,
          },
          error: null,
        },
      ],
      existingCards: [
        { card_no: '0101', card_code: null, status: 'available', employee_no: 'stale-user' },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(200)
    expect(updatedCardPayloads).toEqual([
      {
        cardNo: '0101',
        statusFilter: 'available',
        values: {
          status: 'available',
          employee_no: null,
          card_code: 'A18',
        },
      },
    ])
    expect(cardsTable.get('0101')).toEqual({
      card_no: '0101',
      card_code: 'A18',
      status: 'available',
      employee_no: null,
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      syncedCards: 0,
    })
  })

  it('skips suspended_lost and disabled cards during sync persistence', async () => {
    const { client, insertedCardPayloads, updatedCardPayloads, cardsTable } =
      createSyncCardsAdminClient({
        pollResults: [
          {
            data: {
              id: 'job-123',
              status: 'done',
              result: [
                { cardNo: '0105', card_code: 'L5' },
                { cardNo: '0106', card_code: 'D6' },
              ],
              error: null,
            },
            error: null,
          },
        ],
        existingCards: [
          { card_no: '0105', card_code: 'OLD-L5', status: 'suspended_lost', employee_no: '000105' },
          { card_no: '0106', card_code: 'OLD-D6', status: 'disabled', employee_no: '000106' },
        ],
      })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(200)
    expect(insertedCardPayloads).toEqual([])
    expect(updatedCardPayloads).toEqual([])
    expect(cardsTable.get('0105')).toEqual({
      card_no: '0105',
      card_code: 'OLD-L5',
      status: 'suspended_lost',
      employee_no: '000105',
    })
    expect(cardsTable.get('0106')).toEqual({
      card_no: '0106',
      card_code: 'OLD-D6',
      status: 'disabled',
      employee_no: '000106',
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      syncedCards: 0,
    })
  })

  it('returns 502 when sync_available_cards fails', async () => {
    const { client } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Bridge sync failed.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Bridge sync failed.',
    })
  })

  it('returns 504 when sync_available_cards times out', async () => {
    vi.useFakeTimers()

    const { client } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'pending',
            result: null,
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = POST()

    await vi.advanceTimersByTimeAsync(182_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Sync cards request timed out after 180 seconds.',
    })
  })

  it('returns 500 when sync_available_cards polling fails', async () => {
    const { client } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: null,
          error: { message: 'select exploded' },
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read sync available cards job job-123: select exploded',
    })
  })

  it('returns 500 when inserting synced cards fails', async () => {
    const { client } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: [{ cardNo: '0104', card_code: 'C7' }],
            error: null,
          },
          error: null,
        },
      ],
      insertError: {
        message: 'insert exploded',
        code: '23505',
        details: 'duplicate key value violates unique constraint',
        hint: 'Ensure card numbers remain unique.',
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to insert synced cards: insert exploded',
      details: {
        message: 'insert exploded',
        code: '23505',
        details: 'duplicate key value violates unique constraint',
        hint: 'Ensure card numbers remain unique.',
      },
    })
  })

  it('returns 500 when updating synced available cards fails', async () => {
    const { client } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: [{ cardNo: '0101', card_code: 'A18' }],
            error: null,
          },
          error: null,
        },
      ],
      existingCards: [
        { card_no: '0101', card_code: null, status: 'available', employee_no: 'stale-user' },
      ],
      updateErrorsByCardNo: {
        '0101': {
          message: 'update exploded',
          code: '40001',
          details: 'row was updated concurrently',
          hint: 'Retry the transaction.',
        },
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to update synced card 0101: update exploded',
      details: {
        message: 'update exploded',
        code: '40001',
        details: 'row was updated concurrently',
        hint: 'Retry the transaction.',
      },
    })
  })

  it('counts only assigned rows that Supabase confirms were updated', async () => {
    const { client, updatedCardPayloads, cardsTable } = createSyncCardsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: [{ cardNo: '0101', card_code: 'A18' }],
            error: null,
          },
          error: null,
        },
      ],
      existingCards: [
        { card_no: '0101', card_code: null, status: 'assigned', employee_no: 'stale-user' },
      ],
      updateNoRowsByCardNo: {
        '0101': true,
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(200)
    expect(updatedCardPayloads).toEqual([
      {
        cardNo: '0101',
        statusFilter: 'assigned',
        values: {
          status: 'available',
          employee_no: null,
          card_code: 'A18',
        },
      },
    ])
    expect(cardsTable.get('0101')).toEqual({
      card_no: '0101',
      card_code: null,
      status: 'assigned',
      employee_no: 'stale-user',
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      syncedCards: 0,
    })
  })
})
