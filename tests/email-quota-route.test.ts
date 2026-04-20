import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

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

import { GET } from '@/app/api/email/quota/route'

type EmailSendRow = {
  id: string
  status: 'pending' | 'sent'
  sent_at: string | null
}

function createRowsQuery(
  rows: EmailSendRow[],
  error: { message: string } | null = null,
) {
  const filters: Array<(row: EmailSendRow) => boolean> = []

  const builder = {
    eq(column: keyof EmailSendRow, value: unknown) {
      filters.push((row) => row[column] === value)
      return builder
    },
    gte(column: keyof EmailSendRow, value: string) {
      filters.push((row) => typeof row[column] === 'string' && row[column] >= value)
      return builder
    },
    lt(column: keyof EmailSendRow, value: string) {
      filters.push((row) => typeof row[column] === 'string' && row[column] < value)
      return builder
    },
    then(onfulfilled: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) {
      if (error) {
        return Promise.resolve({
          data: null,
          error,
        }).then(onfulfilled, onrejected)
      }

      return Promise.resolve({
        data: rows.filter((row) => filters.every((filter) => filter(row))).map((row) => ({
          id: row.id,
        })),
        error: null,
      }).then(onfulfilled, onrejected)
    },
  }

  return builder
}

function createQuotaAdminClient(options: {
  adminRows?: EmailSendRow[]
  membershipRows?: EmailSendRow[]
  adminError?: { message: string } | null
  membershipError?: { message: string } | null
} = {}) {
  return {
    from(table: string) {
      if (table === 'admin_email_deliveries') {
        return {
          select(columns: string) {
            expect(columns).toBe('id')
            return createRowsQuery(options.adminRows ?? [], options.adminError ?? null)
          },
        }
      }

      if (table === 'membership_expiry_email_sends') {
        return {
          select(columns: string) {
            expect(columns).toBe('id')
            return createRowsQuery(options.membershipRows ?? [], options.membershipError ?? null)
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('GET /api/email/quota', () => {
  afterEach(() => {
    vi.useRealTimers()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
    delete process.env.RESEND_DAILY_EMAIL_LIMIT
  })

  it('returns the aggregated sent counts for the current Jamaica-local day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T17:00:00.000Z'))
    process.env.RESEND_DAILY_EMAIL_LIMIT = '100'
    getSupabaseAdminClientMock.mockReturnValue(
      createQuotaAdminClient({
        adminRows: [
          {
            id: 'delivery-1',
            status: 'sent',
            sent_at: '2026-04-11T00:00:00-05:00',
          },
          {
            id: 'delivery-2',
            status: 'sent',
            sent_at: '2026-04-11T23:59:59-05:00',
          },
          {
            id: 'delivery-3',
            status: 'pending',
            sent_at: '2026-04-11T09:00:00-05:00',
          },
          {
            id: 'delivery-4',
            status: 'sent',
            sent_at: '2026-04-10T23:59:59-05:00',
          },
        ],
        membershipRows: [
          {
            id: 'reminder-1',
            status: 'sent',
            sent_at: '2026-04-11T10:15:00-05:00',
          },
          {
            id: 'reminder-2',
            status: 'pending',
            sent_at: '2026-04-11T10:30:00-05:00',
          },
          {
            id: 'reminder-3',
            status: 'sent',
            sent_at: '2026-04-12T00:00:00-05:00',
          },
        ],
      }),
    )

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      sent: 3,
      limit: 100,
      remaining: 97,
    })
  })

  it('returns zero remaining when sends exceed the configured limit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T17:00:00.000Z'))
    process.env.RESEND_DAILY_EMAIL_LIMIT = '3'
    getSupabaseAdminClientMock.mockReturnValue(
      createQuotaAdminClient({
        adminRows: [
          { id: 'delivery-1', status: 'sent', sent_at: '2026-04-11T08:00:00-05:00' },
          { id: 'delivery-2', status: 'sent', sent_at: '2026-04-11T09:00:00-05:00' },
        ],
        membershipRows: [
          { id: 'reminder-1', status: 'sent', sent_at: '2026-04-11T10:00:00-05:00' },
          { id: 'reminder-2', status: 'sent', sent_at: '2026-04-11T11:00:00-05:00' },
        ],
      }),
    )

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      sent: 4,
      limit: 3,
      remaining: 0,
    })
  })

  it('returns the auth failure response unchanged', async () => {
    mockUnauthorized()

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 when one of the quota queries fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T17:00:00.000Z'))
    getSupabaseAdminClientMock.mockReturnValue(
      createQuotaAdminClient({
        adminError: { message: 'query exploded' },
      }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read admin email quota: query exploded',
    })
  })
})
