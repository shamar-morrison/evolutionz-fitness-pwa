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

import { GET } from '@/app/api/classes/registrations/[registrationId]/receipt/route'
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

describe('class registration receipt routes', () => {
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
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(response.status).toBe(403)
  })

  it('rejects preview requests for non-approved registrations before delivery lookups', async () => {
    const { client } = createReceiptRouteClient(
      createClassRegistrationReceiptRow({
        status: 'pending',
      }),
    )
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only approved registrations can send a receipt.',
    })
    expect(createSupabaseAdminEmailDeliveryStoreMock).not.toHaveBeenCalled()
  })

  it('rejects send requests for non-approved registrations before delivery work', async () => {
    const { client } = createReceiptRouteClient(
      createClassRegistrationReceiptRow({
        status: 'pending',
      }),
    )
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ registrationId: 'registration-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only approved registrations can send a receipt.',
    })
    expect(createSupabaseAdminEmailDeliveryStoreMock).not.toHaveBeenCalled()
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
  })

  it('returns a 409 in-progress response when another request holds the receipt reservation', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(
      createClassRegistrationReceiptRow(),
    )
    const deliveryStore = createDeliveryStore({
      readReceiptDelivery: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'pending',
          createdAt: '2026-04-12T12:00:00.000Z',
          sentAt: null,
          isStale: false,
        }),
      reserveReceiptDelivery: vi.fn().mockResolvedValue('pending'),
    })
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

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      sendInProgress: true,
      error: 'A receipt send is already in progress for this registration.',
      receiptSentAt: null,
    })
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(deliveryStore.markReceiptDeliverySent).not.toHaveBeenCalled()
    expect(deliveryStore.releasePendingReceiptDelivery).not.toHaveBeenCalled()
    expect(deliveryStore.reserveDailyQuota).not.toHaveBeenCalled()
    expect(receiptSentAtUpdates).toEqual([])
  })

  it('reserves delivery before daily quota on a successful send', async () => {
    const callOrder: string[] = []
    const { client } = createReceiptRouteClient(createClassRegistrationReceiptRow())
    const deliveryStore = createDeliveryStore({
      reserveReceiptDelivery: vi.fn().mockImplementation(async () => {
        callOrder.push('reserve-delivery')
        return 'reserved'
      }),
      reserveDailyQuota: vi.fn().mockImplementation(async () => {
        callOrder.push('reserve-quota')
        return 1
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    createSupabaseAdminEmailDeliveryStoreMock.mockReturnValue(deliveryStore)
    sendAdminResendEmailToRecipientMock.mockImplementation(async () => {
      callOrder.push('send-email')
      return 'provider-message-1'
    })
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
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(callOrder.slice(0, 3)).toEqual(['reserve-delivery', 'reserve-quota', 'send-email'])
  })

  it('does not reserve daily quota when the reservation is already marked sent', async () => {
    const { client, receiptSentAtUpdates } = createReceiptRouteClient(createClassRegistrationReceiptRow())
    const deliveryStore = createDeliveryStore({
      reserveReceiptDelivery: vi.fn().mockResolvedValue('sent'),
      readReceiptDelivery: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'sent',
          createdAt: '2026-04-12T12:00:00.000Z',
          sentAt: '2026-04-12T13:00:00.000Z',
          isStale: false,
        }),
    })
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
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      alreadySent: true,
      receiptSentAt: '2026-04-12T13:00:00.000Z',
    })
    expect(deliveryStore.reserveDailyQuota).not.toHaveBeenCalled()
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
    expect(receiptSentAtUpdates).toEqual(['2026-04-12T13:00:00.000Z'])
  })

  it('releases the pending reservation when daily quota reservation fails', async () => {
    const { client } = createReceiptRouteClient(createClassRegistrationReceiptRow())
    const deliveryStore = createDeliveryStore({
      reserveReceiptDelivery: vi.fn().mockResolvedValue('reserved'),
      reserveDailyQuota: vi.fn().mockResolvedValue(0),
    })
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
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body).toEqual({
      ok: false,
      error: 'Daily email limit reached for today.',
    })
    expect(deliveryStore.releasePendingReceiptDelivery).toHaveBeenCalledWith({
      classRegistrationId: 'registration-1',
    })
    expect(sendAdminResendEmailToRecipientMock).not.toHaveBeenCalled()
  })
})
