import { describe, expect, it } from 'vitest'
import { clearFutureRegistrationAttendance } from '@/app/api/classes/_registration-attendance'

function createAttendanceCleanupClient() {
  const deletedAttendanceIds: string[] = []
  let markedAtFilterApplied = false

  return {
    deletedAttendanceIds,
    get markedAtFilterApplied() {
      return markedAtFilterApplied
    },
    client: {
      from(table: string) {
        if (table === 'class_sessions') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, scheduled_at, period_start')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('class_id')
                  expect(value).toBe('class-1')

                  return {
                    gt(nextColumn: string) {
                      expect(nextColumn).toBe('scheduled_at')

                      return Promise.resolve({
                        data: [
                          {
                            id: 'session-1',
                            scheduled_at: '2026-05-01T09:00:00.000Z',
                            period_start: '2026-04-01',
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

        if (table === 'class_registrations') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, month_start')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('class_id')
                  expect(value).toBe('class-1')

                  const chain = {
                    eq(nextColumn: string, nextValue: string) {
                      if (nextColumn === 'status') {
                        expect(nextValue).toBe('approved')
                        return chain
                      }

                      expect(nextColumn).toBe('member_id')
                      expect(nextValue).toBe('member-1')
                      return chain
                    },
                    neq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('id')
                      expect(nextValue).toBe('registration-1')
                      return chain
                    },
                    is(nextColumn: string, nextValue: null) {
                      expect(nextColumn).toBe('guest_profile_id')
                      expect(nextValue).toBeNull()

                      return Promise.resolve({
                        data: [],
                        error: null,
                      })
                    },
                  }

                  return chain
                },
              }
            },
          }
        }

        expect(table).toBe('class_attendance')

        return {
          select(columns: string) {
            expect(columns).toBe('id, session_id')

            return {
              in(column: string, values: string[]) {
                expect(column).toBe('session_id')
                expect(values).toEqual(['session-1'])

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('member_id')
                    expect(nextValue).toBe('member-1')

                    return {
                      is(finalColumn: string, finalValue: null) {
                        expect(finalColumn).toBe('guest_profile_id')
                        expect(finalValue).toBeNull()

                        return Promise.resolve({
                          data: [{ id: 'attendance-1', session_id: 'session-1' }],
                          error: null,
                        })
                      },
                    }
                  },
                }
              },
            }
          },
          delete() {
            return {
              in(column: string, values: string[]) {
                expect(column).toBe('id')
                deletedAttendanceIds.push(...values)

                return {
                  is(nextColumn: string, nextValue: null) {
                    expect(nextColumn).toBe('marked_at')
                    expect(nextValue).toBeNull()
                    markedAtFilterApplied = true

                    return Promise.resolve({
                      error: null,
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

describe('class registration attendance helpers', () => {
  it('only deletes unmarked future attendance rows during registration cleanup', async () => {
    const cleanupClient = createAttendanceCleanupClient()

    await clearFutureRegistrationAttendance({
      supabase: cleanupClient.client,
      classId: 'class-1',
      registration: {
        id: 'registration-1',
        member_id: 'member-1',
        guest_profile_id: null,
      },
    })

    expect(cleanupClient.deletedAttendanceIds).toEqual(['attendance-1'])
    expect(cleanupClient.markedAtFilterApplied).toBe(true)
  })
})
