import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

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

import { POST } from '@/app/api/classes/registrations/[registrationId]/receipt/send/route'

function createClassRegistrationReceiptRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'registration-1',
    class_id: 'class-1',
    status: 'approved',
    member_id: 'member-1',
    guest_profile_id: null,
    fee_type: 'monthly',
    amount_paid: 12000,
    payment_recorded_at: '2026-04-12',
    notes: 'April registration',
    receipt_number: 'EF-2026-00001',
    receipt_sent_at: null,
    class: {
      id: 'class-1',
      name: 'Weight Loss Club',
    },
    member: {
      id: 'member-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    guest: null,
    ...overrides,
  }
}

function createReceiptRouteClient(registrationRow: Record<string, unknown> | null) {
  const receiptSentAtUpdates: string[] = []

  return {
    receiptSentAtUpdates,
    client: {
      from(table: string) {
        if (table !== 'class_registrations') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            expect(columns).toContain('status')
            expect(columns).toContain('receipt_number')

            return {
              eq(column: 'id', value: string) {
                expect(column).toBe('id')
                expect(value).toBe('registration-1')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: registrationRow,
                      error: null,
                    })
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
                expect(value).toBe('registration-1')

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

describe('POST /api/classes/registrations/[registrationId]/receipt/send', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    createSupabaseAdminEmailDeliveryStoreMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    isDefinitiveAdminEmailSendErrorMock.mockClear()
    sendAdminResendEmailToRecipientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('sends the receipt, updates receipt_sent_at, and records the delivery state', async () => {
    const sentAt = '2026-04-12T15:30:00.000Z'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(sentAt))

    const { client, receiptSentAtUpdates } = createReceiptRouteClient(
      createClassRegistrationReceiptRow(),
    )
    const deliveryStore = createDeliveryStore()
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    sendAdminResendEmailToRecipientMock.mockResolvedValue('provider-message-1')
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(deliveryStore.reserveReceiptDelivery).toHaveBeenCalledWith({
      senderProfileId: 'admin-1',
      sendDate: '2026-04-12',
      classRegistrationId: 'registration-1',
      recipientEmail: 'jane@example.com',
      idempotencyKey: 'registration-1',
    })
    expect(sendAdminResendEmailToRecipientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'jane@example.com',
        draftIdempotencyKey: 'registration-1',
      }),
    )
    expect(deliveryStore.markReceiptDeliverySent).toHaveBeenCalledWith({
      classRegistrationId: 'registration-1',
      providerMessageId: 'provider-message-1',
      sentAt,
    })
    expect(receiptSentAtUpdates).toEqual([sentAt])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      alreadySent: false,
      receiptSentAt: sentAt,
    })
  })

  it('returns 400 when the registrant email is missing', async () => {
    const { client } = createReceiptRouteClient(
      createClassRegistrationReceiptRow({
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
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(deliveryStore.reserveReceiptDelivery).not.toHaveBeenCalled()
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Add an email address to the registrant profile before sending a receipt.',
    })
  })

  it('returns 400 when the registration has no paid amount', async () => {
    const { client } = createReceiptRouteClient(
      createClassRegistrationReceiptRow({
        amount_paid: 0,
      }),
    )
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

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(deliveryStore.reserveReceiptDelivery).not.toHaveBeenCalled()
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only paid registrations can send a receipt.',
    })
  })

  it('returns a definitive provider error gracefully and releases the reservation', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(
      createClassRegistrationReceiptRow(),
    )
    const deliveryStore = createDeliveryStore()
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    sendAdminResendEmailToRecipientMock.mockRejectedValue(
      new Error('provider: upstream unavailable'),
    )
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(deliveryStore.releasePendingReceiptDelivery).toHaveBeenCalledWith({
      classRegistrationId: 'registration-1',
    })
    expect(deliveryStore.markReceiptDeliverySent).not.toHaveBeenCalled()
    expect(receiptSentAtUpdates).toEqual([])
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'provider: upstream unavailable',
    })
  })
})
