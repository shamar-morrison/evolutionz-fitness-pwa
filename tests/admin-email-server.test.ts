import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS,
  AdminEmailSendError,
  createAdminEmailProviderIdempotencyKey,
  createSupabaseAdminEmailDeliveryStore,
  isDefinitiveAdminEmailSendError,
  sendAdminResendEmailToRecipient,
} from '@/lib/admin-email-server'

type AdminEmailDeliveryDbRow = {
  id: string
  sender_profile_id: string
  send_date: string
  idempotency_key: string
  recipient_email: string
  status: 'pending' | 'sent'
  provider_message_id: string | null
  sent_at: string | null
  created_at: string
}

type SupabaseResult = {
  data: unknown
  error: { message: string; code?: string } | null
}

class AdminEmailDeliveryQueryBuilder implements PromiseLike<SupabaseResult> {
  private operation: 'select' | 'insert' | 'update' | 'delete' | null = null
  private selectedColumns: string[] | null = null
  private filters: Array<{ column: string; value: unknown }> = []
  private insertRows: AdminEmailDeliveryDbRow[] = []
  private updateValues: Partial<AdminEmailDeliveryDbRow> = {}

  constructor(private readonly rows: AdminEmailDeliveryDbRow[]) {}

  select(columns: string) {
    if (!this.operation) {
      this.operation = 'select'
    }

    this.selectedColumns = columns.split(',').map((column) => column.trim())
    return this
  }

  insert(input: Partial<AdminEmailDeliveryDbRow> | Array<Partial<AdminEmailDeliveryDbRow>>) {
    this.operation = 'insert'
    const rows = Array.isArray(input) ? input : [input]

    this.insertRows = rows.map((row, index) => ({
      id: row.id ?? `delivery-${this.rows.length + index + 1}`,
      sender_profile_id: String(row.sender_profile_id),
      send_date: String(row.send_date),
      idempotency_key: String(row.idempotency_key),
      recipient_email: String(row.recipient_email),
      status: (row.status ?? 'pending') as 'pending' | 'sent',
      provider_message_id: row.provider_message_id ?? null,
      sent_at: row.sent_at ?? null,
      created_at: row.created_at ?? new Date().toISOString(),
    }))

    return this
  }

  update(values: Partial<AdminEmailDeliveryDbRow>) {
    this.operation = 'update'
    this.updateValues = values
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value })
    return this
  }

  maybeSingle() {
    const result = this.execute()
    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : []

    return Promise.resolve({
      data: rows[0] ?? null,
      error: result.error,
    })
  }

  then<TResult1 = SupabaseResult, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute(): SupabaseResult {
    switch (this.operation) {
      case 'select': {
        return {
          data: this.filterRows().map((row) => this.projectRow(row)),
          error: null,
        }
      }
      case 'insert': {
        const hasConflict = this.insertRows.some((candidate) =>
          this.rows.some(
            (row) =>
              row.idempotency_key === candidate.idempotency_key &&
              row.recipient_email === candidate.recipient_email,
          ),
        )

        if (hasConflict) {
          return {
            data: null,
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "admin_email_deliveries_idempotency_recipient_unique"',
            },
          }
        }

        this.rows.push(...this.insertRows)
        return {
          data:
            this.selectedColumns && this.insertRows[0]
              ? this.projectRow(this.insertRows[0])
              : null,
          error: null,
        }
      }
      case 'update': {
        const rows = this.filterRows()

        for (const row of rows) {
          Object.assign(row, this.updateValues)
        }

        return {
          data: rows[0] ? this.projectRow(rows[0]) : null,
          error: null,
        }
      }
      case 'delete': {
        const matchingIds = new Set(this.filterRows().map((row) => row.id))

        for (let index = this.rows.length - 1; index >= 0; index -= 1) {
          if (matchingIds.has(this.rows[index]?.id ?? '')) {
            this.rows.splice(index, 1)
          }
        }

        return {
          data: null,
          error: null,
        }
      }
      default:
        return {
          data: null,
          error: {
            message: 'Unsupported operation.',
          },
        }
    }
  }

  private filterRows() {
    return this.rows.filter((row) =>
      this.filters.every(({ column, value }) => row[column as keyof AdminEmailDeliveryDbRow] === value),
    )
  }

  private projectRow(row: AdminEmailDeliveryDbRow) {
    if (!this.selectedColumns) {
      return row
    }

    return this.selectedColumns.reduce<Record<string, unknown>>((result, column) => {
      result[column] = row[column as keyof AdminEmailDeliveryDbRow]
      return result
    }, {})
  }
}

function createFakeSupabase(initialRows: AdminEmailDeliveryDbRow[] = []) {
  const rows = initialRows.map((row) => ({ ...row }))

  return {
    rows,
    from(table: string) {
      expect(table).toBe('admin_email_deliveries')
      return new AdminEmailDeliveryQueryBuilder(rows)
    },
  }
}

function createDeliveryRow(
  overrides: Partial<AdminEmailDeliveryDbRow> = {},
): AdminEmailDeliveryDbRow {
  return {
    id: overrides.id ?? 'delivery-1',
    sender_profile_id: overrides.sender_profile_id ?? 'sender-1',
    send_date: overrides.send_date ?? '2026-04-11',
    idempotency_key: overrides.idempotency_key ?? '11111111-1111-4111-8111-111111111111',
    recipient_email: overrides.recipient_email ?? 'alpha@example.com',
    status: overrides.status ?? 'pending',
    provider_message_id: overrides.provider_message_id ?? null,
    sent_at: overrides.sent_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
  }
}

function createSuccessResponse(id = 'resend-1') {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function createProviderErrorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('admin email server', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('derives a stable provider idempotency key from the draft id and normalized email', () => {
    const firstKey = createAdminEmailProviderIdempotencyKey({
      draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
      recipientEmail: ' ALPHA@example.com ',
    })
    const secondKey = createAdminEmailProviderIdempotencyKey({
      draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
      recipientEmail: 'alpha@example.com',
    })

    expect(firstKey).toBe(secondKey)
    expect(firstKey.length).toBeLessThanOrEqual(256)
  })

  it('sends Resend requests with the derived provider idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse('resend-header'))

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendAdminResendEmailToRecipient({
        apiKey: 'resend-key',
        from: 'Evolutionz Fitness <reminders@example.com>',
        draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
        subject: 'Hello members',
        body: '<p>Hello team</p>',
      }),
    ).resolves.toBe('resend-header')

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>

    expect(headers['Idempotency-Key']).toBe(
      createAdminEmailProviderIdempotencyKey({
        draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
      }),
    )
  })

  it('classifies non-2xx provider responses as definitive send failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createProviderErrorResponse('Resend exploded')))

    let thrownError: unknown = null

    try {
      await sendAdminResendEmailToRecipient({
        apiKey: 'resend-key',
        from: 'Evolutionz Fitness <reminders@example.com>',
        draftIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
        subject: 'Hello members',
        body: '<p>Hello team</p>',
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(AdminEmailSendError)
    expect(isDefinitiveAdminEmailSendError(thrownError)).toBe(true)
    expect((thrownError as Error).message).toBe('Resend exploded')
  })

  it('returns false from reserveDelivery only when the existing delivery is already sent', async () => {
    const supabase = createFakeSupabase([
      createDeliveryRow({
        status: 'sent',
        provider_message_id: 'resend-sent',
        sent_at: '2026-04-11T12:00:00.000Z',
      }),
    ])
    const store = createSupabaseAdminEmailDeliveryStore(supabase)

    await expect(
      store.reserveDelivery({
        senderProfileId: 'sender-1',
        sendDate: '2026-04-11',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
      }),
    ).resolves.toBe(false)
    expect(supabase.rows).toHaveLength(1)
  })

  it('treats fresh pending conflicts as retryable without deleting the reservation', async () => {
    const freshCreatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const supabase = createFakeSupabase([
      createDeliveryRow({
        status: 'pending',
        created_at: freshCreatedAt,
      }),
    ])
    const store = createSupabaseAdminEmailDeliveryStore(supabase)

    await expect(
      store.reserveDelivery({
        senderProfileId: 'sender-1',
        sendDate: '2026-04-11',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
      }),
    ).resolves.toBe(true)
    expect(supabase.rows).toEqual([
      expect.objectContaining({
        recipient_email: 'alpha@example.com',
        status: 'pending',
        created_at: freshCreatedAt,
      }),
    ])
  })

  it('recycles stale pending conflicts before retrying the reservation', async () => {
    const staleCreatedAt = new Date(Date.now() - ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS - 1_000)
      .toISOString()
    const supabase = createFakeSupabase([
      createDeliveryRow({
        status: 'pending',
        created_at: staleCreatedAt,
      }),
    ])
    const store = createSupabaseAdminEmailDeliveryStore(supabase)

    await expect(
      store.reserveDelivery({
        senderProfileId: 'sender-1',
        sendDate: '2026-04-11',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
      }),
    ).resolves.toBe(true)
    expect(supabase.rows).toHaveLength(1)
    expect(supabase.rows[0]).toEqual(
      expect.objectContaining({
        recipient_email: 'alpha@example.com',
        status: 'pending',
      }),
    )
    expect(supabase.rows[0]?.created_at).not.toBe(staleCreatedAt)
  })

  it('treats markDeliverySent as idempotent when the row is already sent', async () => {
    const supabase = createFakeSupabase([
      createDeliveryRow({
        status: 'sent',
        provider_message_id: 'resend-sent',
        sent_at: '2026-04-11T12:00:00.000Z',
      }),
    ])
    const store = createSupabaseAdminEmailDeliveryStore(supabase)

    await expect(
      store.markDeliverySent({
        senderProfileId: 'sender-1',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'alpha@example.com',
        providerMessageId: 'resend-sent',
        sentAt: '2026-04-11T12:01:00.000Z',
      }),
    ).resolves.toBeUndefined()
    expect(supabase.rows).toEqual([
      expect.objectContaining({
        status: 'sent',
        provider_message_id: 'resend-sent',
      }),
    ])
  })
})
