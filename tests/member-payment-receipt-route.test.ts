import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockAdminUser, mockForbidden, resetServerAuthMocks } from '@/tests/support/server-auth'

const {
  createSupabaseAdminEmailDeliveryStoreMock,
  getSupabaseAdminClientMock,
  isDefinitiveAdminEmailSendErrorMock,
  sendAdminResendEmailToRecipientMock,
} = vi.hoisted(() => ({
  createSupabaseAdminEmailDeliveryStoreMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  isDefinitiveAdminEmailSendErrorMock: vi.fn((error: unknown) => {
    return error instanceof Error && error.message.startsWith('provider:')
  }),
  sendAdminResendEmailToRecipientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/admin-email-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-email-server')>(
    '@/lib/admin-email-server',
  )

  return {
    ...actual,
    createSupabaseAdminEmailDeliveryStore: createSupabaseAdminEmailDeliveryStoreMock,
    isDefinitiveAdminEmailSendError: isDefinitiveAdminEmailSendErrorMock,
    sendAdminResendEmailToRecipient: sendAdminResendEmailToRecipientMock,
  }
})

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET, POST } from '@/app/api/members/[id]/payments/[paymentId]/receipt/route'

function createReceiptPaymentRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'payment-1',
    member_id: 'member-1',
    member_type_id: 'type-general',
    payment_type: 'membership',
    payment_method: 'cash',
    amount_paid: 12000,
    payment_date: '2026-04-12',
    notes: 'April renewal',
    receipt_number: 'EF-2026-00001',
    receipt_sent_at: null,
    membership_begin_time: '2026-04-01T00:00:00.000Z',
    membership_end_time: '2026-04-30T23:59:59.000Z',
    member: {
      id: 'member-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    memberType: {
      name: 'General',
    },
    recordedByProfile: {
      name: 'Jordan Staff',
    },
    ...overrides,
  }
}

function createReceiptRouteClient(paymentRow: Record<string, unknown> | null) {
  const receiptSentAtUpdates: string[] = []

  return {
    receiptSentAtUpdates,
    client: {
      from(table: string) {
        if (table !== 'member_payments') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            expect(columns).toContain('receipt_number')

            return {
              eq(column: 'id', value: string) {
                expect(column).toBe('id')
                expect(value).toBe('payment-1')

                return {
                  eq(nextColumn: 'member_id', nextValue: string) {
                    expect(nextColumn).toBe('member_id')
                    expect(nextValue).toBe('member-1')

                    return {
                      maybeSingle() {
                        return Promise.resolve({
                          data: paymentRow,
                          error: null,
                        })
                      },
                    }
                  },
                }
              },
            }
          },
          update(values: { receipt_sent_at: string }) {
            receiptSentAtUpdates.push(values.receipt_sent_at)

            return {
              eq(column: 'id', value: string) {
                expect(column).toBe('id')
                expect(value).toBe('payment-1')

                return {
                  select(columns: 'id') {
                    expect(columns).toBe('id')

                    return {
                      maybeSingle() {
                        return Promise.resolve({
                          data: { id: value },
                          error: null,
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
    },
  }
}

function createDeliveryStore(overrides: Partial<{
  readReceiptDelivery: ReturnType<typeof vi.fn>
  reserveDailyQuota: ReturnType<typeof vi.fn>
  reserveReceiptDelivery: ReturnType<typeof vi.fn>
  markReceiptDeliverySent: ReturnType<typeof vi.fn>
  releasePendingReceiptDelivery: ReturnType<typeof vi.fn>
}> = {}) {
  return {
    readReceiptDelivery: overrides.readReceiptDelivery ?? vi.fn().mockResolvedValue(null),
    reserveDailyQuota: overrides.reserveDailyQuota ?? vi.fn().mockResolvedValue(1),
    reserveReceiptDelivery:
      overrides.reserveReceiptDelivery ?? vi.fn().mockResolvedValue('reserved'),
    markReceiptDeliverySent:
      overrides.markReceiptDeliverySent ?? vi.fn().mockResolvedValue(undefined),
    releasePendingReceiptDelivery:
      overrides.releasePendingReceiptDelivery ?? vi.fn().mockResolvedValue(undefined),
  }
}

describe('member payment receipt route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createSupabaseAdminEmailDeliveryStoreMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    isDefinitiveAdminEmailSendErrorMock.mockClear()
    sendAdminResendEmailToRecipientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the admin auth response when forbidden', async () => {
    mockForbidden()

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })

    expect(response.status).toBe(403)
  })

  it('returns a normalized receipt preview', async () => {
    const { client } = createReceiptRouteClient(createReceiptPaymentRow())
    const deliveryStore = createDeliveryStore()
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      receipt: expect.objectContaining({
        paymentId: 'payment-1',
        receiptNumber: 'EF-2026-00001',
        memberName: 'Jane Doe',
        recipientEmail: 'jane@example.com',
        paymentLabel: 'General',
      }),
      canSend: true,
      disabledReason: null,
      receiptSentAt: null,
    })
    expect(getSupabaseAdminClientMock).toHaveBeenCalledTimes(1)
    expect(createSupabaseAdminEmailDeliveryStoreMock).toHaveBeenCalledWith(client)
  })

  it('sends a receipt, records the delivery, and updates receipt_sent_at', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(createReceiptPaymentRow())
    const deliveryStore = createDeliveryStore()
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    sendAdminResendEmailToRecipientMock.mockResolvedValue('resend-1')
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      alreadySent: false,
      receiptSentAt: expect.any(String),
    })
    expect(deliveryStore.reserveDailyQuota).toHaveBeenCalledWith({
      senderProfileId: 'admin-1',
      sendDate: expect.any(String),
      requestedCount: 1,
    })
    expect(deliveryStore.reserveReceiptDelivery).toHaveBeenCalledWith({
      senderProfileId: 'admin-1',
      sendDate: expect.any(String),
      paymentId: 'payment-1',
      recipientEmail: 'jane@example.com',
      idempotencyKey: 'payment-1',
    })
    expect(sendAdminResendEmailToRecipientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'jane@example.com',
        draftIdempotencyKey: 'payment-1',
        subject: expect.stringContaining('EF-2026-00001'),
      }),
    )
    expect(deliveryStore.markReceiptDeliverySent).toHaveBeenCalledWith({
      paymentId: 'payment-1',
      providerMessageId: 'resend-1',
      sentAt: body.receiptSentAt,
    })
    expect(receiptSentAtUpdates).toEqual([body.receiptSentAt])
    expect(getSupabaseAdminClientMock).toHaveBeenCalledTimes(1)
    expect(createSupabaseAdminEmailDeliveryStoreMock).toHaveBeenCalledWith(client)
  })

  it('returns 400 when the member has no email on file', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(
      createReceiptPaymentRow({
        member: {
          id: 'member-1',
          name: 'Jane Doe',
          email: null,
        },
      }),
    )
    const deliveryStore = createDeliveryStore()
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    mockAdminUser()

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Add an email address to the member profile before sending a receipt.',
    })
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(receiptSentAtUpdates).toEqual([])
  })

  it('returns idempotent success when the receipt was already sent', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(createReceiptPaymentRow())
    const deliveryStore = createDeliveryStore({
      readReceiptDelivery: vi.fn().mockResolvedValue({
        status: 'sent',
        createdAt: '2026-04-12T12:00:00.000Z',
        sentAt: '2026-04-12T12:05:00.000Z',
        isStale: false,
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    mockAdminUser()

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      alreadySent: true,
      receiptSentAt: '2026-04-12T12:05:00.000Z',
    })
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(receiptSentAtUpdates).toEqual(['2026-04-12T12:05:00.000Z'])
  })

  it('returns 429 when the daily quota is exhausted', async () => {
    const { client } = createReceiptRouteClient(createReceiptPaymentRow())
    const deliveryStore = createDeliveryStore({
      reserveDailyQuota: vi.fn().mockResolvedValue(0),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    mockAdminUser()

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Daily email limit reached for today.',
    })
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(getSupabaseAdminClientMock).toHaveBeenCalledTimes(1)
    expect(createSupabaseAdminEmailDeliveryStoreMock).toHaveBeenCalledWith(client)
  })

  it('returns 502 and releases the reservation when Resend rejects the send', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(createReceiptPaymentRow())
    const deliveryStore = createDeliveryStore()
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    sendAdminResendEmailToRecipientMock.mockRejectedValue(new Error('provider: Resend rejected'))
    mockAdminUser()

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'member-1', paymentId: 'payment-1' }),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'provider: Resend rejected',
    })
    expect(deliveryStore.releasePendingReceiptDelivery).toHaveBeenCalledWith({
      paymentId: 'payment-1',
    })
    expect(deliveryStore.markReceiptDeliverySent).not.toHaveBeenCalled()
    expect(receiptSentAtUpdates).toEqual([])
  })
})
