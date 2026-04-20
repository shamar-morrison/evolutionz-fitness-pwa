import { describe, expect, it } from 'vitest'
import { readClassRegistrationById } from '@/lib/classes-server'

describe('classes server helpers', () => {
  it('normalizes null registration fee types to custom', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'class_registrations') {
          return {
            select(columns: string) {
              expect(columns).toContain('fee_type')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('class_id')
                  expect(value).toBe('class-1')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('id')
                      expect(nextValue).toBe('registration-1')

                      return {
                        order() {
                          return Promise.resolve({
                            data: [
                              {
                                id: 'registration-1',
                                class_id: 'class-1',
                                member_id: 'member-1',
                                guest_profile_id: null,
                                month_start: '2026-04-01',
                                status: 'approved',
                                fee_type: null,
                                amount_paid: 12000,
                                payment_recorded_at: '2026-04-12T12:00:00.000Z',
                                notes: null,
                                receipt_number: null,
                                receipt_sent_at: null,
                                reviewed_by: 'admin-1',
                                reviewed_at: '2026-04-12T12:00:00.000Z',
                                review_note: null,
                                created_at: '2026-04-10T12:00:00.000Z',
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
                        name: 'Client One',
                        email: 'client.one@example.com',
                      },
                    ],
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'guest_profiles') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, name, email')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('id')
                  expect(values).toEqual([])

                  return Promise.resolve({
                    data: [],
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    }

    const registration = await readClassRegistrationById(
      supabase as unknown as { from(table: string): unknown },
      'class-1',
      'registration-1',
    )

    expect(registration?.fee_type).toBe('custom')
  })
})
