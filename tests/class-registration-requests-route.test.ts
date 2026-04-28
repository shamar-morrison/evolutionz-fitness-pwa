import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
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

import { GET } from '@/app/api/classes/registration-requests/route'
import {
  CLASS_REGISTRATION_EDIT_REQUEST_SELECT,
  CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT,
} from '@/lib/class-registration-request-records'

function createRegistrationRequestsClient() {
  return {
    client: {
      from(table: string) {
        if (table === 'class_registration_edit_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(CLASS_REGISTRATION_EDIT_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('status')
                  expect(value).toBe('pending')

                  return {
                    order(orderColumn: string, options: { ascending: boolean }) {
                      expect(orderColumn).toBe('created_at')
                      expect(options).toEqual({ ascending: false })

                      return Promise.resolve({
                        data: [
                          {
                            id: 'edit-request-1',
                            registration_id: 'registration-1',
                            class_id: 'class-1',
                            requested_by: 'staff-1',
                            proposed_fee_type: 'custom',
                            proposed_amount_paid: 4500,
                            proposed_period_start: '2026-04-15',
                            proposed_payment_received: true,
                            proposed_notes: ' Updated notes ',
                            status: 'pending',
                            reviewed_by: null,
                            review_timestamp: null,
                            created_at: '2026-04-12T12:00:00.000Z',
                            class: {
                              name: 'Weight Loss Club',
                            },
                            registration: {
                              id: 'registration-1',
                              member_id: 'member-1',
                              guest_profile_id: null,
                              month_start: '2026-04-01',
                              fee_type: 'monthly',
                              amount_paid: 12000,
                              notes: 'April registration',
                            },
                            requestedByProfile: {
                              name: 'Jordan Staff',
                            },
                            reviewedByProfile: null,
                          },
                        ],
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'class_registration_removal_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('status')
                  expect(value).toBe('pending')

                  return {
                    order(orderColumn: string, options: { ascending: boolean }) {
                      expect(orderColumn).toBe('created_at')
                      expect(options).toEqual({ ascending: false })

                      return Promise.resolve({
                        data: [
                          {
                            id: 'removal-request-1',
                            registration_id: 'registration-2',
                            class_id: 'class-2',
                            requested_by: 'staff-2',
                            amount_paid_at_request: 0,
                            status: 'pending',
                            reviewed_by: null,
                            review_timestamp: null,
                            created_at: '2026-04-13T12:00:00.000Z',
                            class: {
                              name: 'Boxing Basics',
                            },
                            registration: {
                              id: 'registration-2',
                              member_id: 'member-1',
                              guest_profile_id: null,
                            },
                            requestedByProfile: {
                              name: 'Taylor Staff',
                            },
                            reviewedByProfile: null,
                          },
                        ],
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, name, email')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('id')
                  expect(values).toEqual(['member-1'])

                  return Promise.resolve({
                    data: [
                      {
                        id: 'member-1',
                        name: ' Jane Doe ',
                        email: 'jane@example.com ',
                      },
                    ],
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('GET /api/classes/registration-requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the combined pending edit and removal requests for admins', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createRegistrationRequestsClient().client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      editRequests: [
        {
          id: 'edit-request-1',
          registrationId: 'registration-1',
          classId: 'class-1',
          className: 'Weight Loss Club',
          memberId: 'member-1',
          guestProfileId: null,
          registrantName: 'Jane Doe',
          registrantEmail: 'jane@example.com',
          currentFeeType: 'monthly',
          currentAmountPaid: 12000,
          currentPeriodStart: '2026-04-01',
          currentPaymentReceived: true,
          currentNotes: 'April registration',
          proposedFeeType: 'custom',
          proposedAmountPaid: 4500,
          proposedPeriodStart: '2026-04-15',
          proposedPaymentReceived: true,
          proposedNotes: 'Updated notes',
          requestedBy: 'staff-1',
          requestedByName: 'Jordan Staff',
          reviewedBy: null,
          reviewedByName: null,
          reviewedAt: null,
          status: 'pending',
          createdAt: '2026-04-12T12:00:00.000Z',
        },
      ],
      removalRequests: [
        {
          id: 'removal-request-1',
          registrationId: 'registration-2',
          classId: 'class-2',
          className: 'Boxing Basics',
          memberId: 'member-1',
          guestProfileId: null,
          registrantName: 'Jane Doe',
          registrantEmail: 'jane@example.com',
          amountPaidAtRequest: 0,
          requestedBy: 'staff-2',
          requestedByName: 'Taylor Staff',
          reviewedBy: null,
          reviewedByName: null,
          reviewedAt: null,
          status: 'pending',
          createdAt: '2026-04-13T12:00:00.000Z',
        },
      ],
    })
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mockUnauthorized()

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the request is forbidden', async () => {
    mockForbidden()

    const response = await GET()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })
})
