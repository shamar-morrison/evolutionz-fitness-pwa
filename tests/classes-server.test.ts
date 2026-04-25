import { describe, expect, it, vi } from 'vitest'
import { readClassRegistrationById, readClasses } from '@/lib/classes-server'

describe('classes server helpers', () => {
  it('filters classes by trainer profile when a trainer scope is provided', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'class-1',
          name: 'Weight Loss Club',
          schedule_description: '3 times per week',
          per_session_fee: null,
          monthly_fee: 15500,
          trainer_compensation_pct: 30,
          current_period_start: '2026-04-01',
          created_at: '2026-04-01T00:00:00.000Z',
          class_trainers: [{ profile_id: 'trainer-1' }],
        },
      ],
      error: null,
    })
    const classesEqMock = vi.fn().mockReturnValue({
      order: orderMock,
    })
    const classesSelectMock = vi.fn().mockReturnValue({
      eq: classesEqMock,
      order: orderMock,
    })
    const classTrainersInMock = vi.fn().mockResolvedValue({
      data: [
        {
          class_id: 'class-1',
          profile_id: 'trainer-1',
        },
      ],
      error: null,
    })
    const classTrainersSelectMock = vi.fn().mockReturnValue({
      in: classTrainersInMock,
    })
    const profilesInMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'trainer-1',
          name: 'Jordan Trainer',
          titles: ['Trainer'],
        },
      ],
      error: null,
    })
    const profilesSelectMock = vi.fn().mockReturnValue({
      in: profilesInMock,
    })
    const supabase = {
      from(table: string) {
        if (table === 'classes') {
          return {
            select: classesSelectMock,
          }
        }

        if (table === 'class_trainers') {
          return {
            select: classTrainersSelectMock,
          }
        }

        if (table === 'profiles') {
          return {
            select: profilesSelectMock,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    }

    const classes = await readClasses(
      supabase as unknown as { from(table: string): unknown },
      'trainer-1',
    )

    expect(classesSelectMock).toHaveBeenCalledWith(
      expect.stringContaining('class_trainers!inner(profile_id)'),
    )
    expect(classesEqMock).toHaveBeenCalledWith('class_trainers.profile_id', 'trainer-1')
    expect(orderMock).toHaveBeenCalledWith('name', { ascending: true })
    expect(classTrainersSelectMock).toHaveBeenCalledWith('class_id, profile_id')
    expect(classTrainersInMock).toHaveBeenCalledWith('class_id', ['class-1'])
    expect(profilesSelectMock).toHaveBeenCalledWith('id, name, titles')
    expect(profilesInMock).toHaveBeenCalledWith('id', ['trainer-1'])
    expect(classes).toEqual([
      {
        id: 'class-1',
        name: 'Weight Loss Club',
        schedule_description: '3 times per week',
        per_session_fee: null,
        monthly_fee: 15500,
        trainer_compensation_pct: 30,
        current_period_start: '2026-04-01',
        created_at: '2026-04-01T00:00:00.000Z',
        trainers: [
          {
            id: 'trainer-1',
            name: 'Jordan Trainer',
            titles: ['Trainer'],
          },
        ],
      },
    ])
  })

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
