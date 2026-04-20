import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'
import type { Profile } from '@/types'

const {
  getSupabaseAdminClientMock,
  readClassByIdMock,
  readClassAttendanceMock,
  readClassesMock,
  readClassTrainersMock,
  readClassRegistrationByIdMock,
  readClassRegistrationsMock,
  readClassScheduleRulesMock,
  readClassSessionByIdMock,
  readClassSessionsMock,
  readEligibleClassRegistrationsForSessionMock,
  readStaffProfileMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readClassByIdMock: vi.fn(),
  readClassAttendanceMock: vi.fn(),
  readClassesMock: vi.fn(),
  readClassTrainersMock: vi.fn(),
  readClassRegistrationByIdMock: vi.fn(),
  readClassRegistrationsMock: vi.fn(),
  readClassScheduleRulesMock: vi.fn(),
  readClassSessionByIdMock: vi.fn(),
  readClassSessionsMock: vi.fn(),
  readEligibleClassRegistrationsForSessionMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/classes-server', () => ({
  readClassAttendance: readClassAttendanceMock,
  readClasses: readClassesMock,
  readClassById: readClassByIdMock,
  readClassTrainers: readClassTrainersMock,
  readClassRegistrations: readClassRegistrationsMock,
  readClassRegistrationById: readClassRegistrationByIdMock,
  readClassScheduleRules: readClassScheduleRulesMock,
  readClassSessionById: readClassSessionByIdMock,
  readClassSessions: readClassSessionsMock,
  readEligibleClassRegistrationsForSession: readEligibleClassRegistrationsForSessionMock,
}))

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET as getClasses } from '@/app/api/classes/route'
import { GET as getClass, PATCH as patchClass } from '@/app/api/classes/[id]/route'
import { PATCH as patchClassSettings } from '@/app/api/classes/[id]/settings/route'
import {
  GET as getClassTrainers,
  POST as postClassTrainer,
} from '@/app/api/classes/[id]/trainers/route'
import { DELETE as deleteClassTrainer } from '@/app/api/classes/[id]/trainers/[profileId]/route'
import {
  GET as getClassRegistrations,
  POST as postClassRegistration,
} from '@/app/api/classes/[id]/registrations/route'
import { PATCH as patchClassRegistration } from '@/app/api/classes/[id]/registrations/[registrationId]/route'
import {
  GET as getClassScheduleRules,
  POST as postClassScheduleRule,
} from '@/app/api/classes/[id]/schedule-rules/route'
import { DELETE as deleteClassScheduleRule } from '@/app/api/classes/[id]/schedule-rules/[ruleId]/route'
import {
  GET as getClassSessions,
  POST as postClassSessions,
} from '@/app/api/classes/[id]/sessions/route'
import {
  GET as getSessionAttendance,
  POST as postSessionAttendance,
} from '@/app/api/classes/[id]/sessions/[sessionId]/attendance/route'
import { PATCH as patchSessionAttendance } from '@/app/api/classes/[id]/sessions/[sessionId]/attendance/[attendanceId]/route'

const TRAINER_PROFILE_ID = '11111111-1111-1111-1111-111111111111'

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Admin User',
    email: overrides.email ?? 'admin@evolutionzfitness.com',
    role: overrides.role ?? 'admin',
    titles: overrides.titles ?? ['Owner'],
    isSuspended: overrides.isSuspended ?? false,
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-08T00:00:00.000Z',
  }
}

function buildClass(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    ...overrides,
  }
}

function buildClassTrainer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    class_id: 'class-1',
    profile_id: TRAINER_PROFILE_ID,
    created_at: '2026-04-08T12:00:00.000Z',
    ...overrides,
  }
}

function buildRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'registration-1',
    class_id: 'class-1',
    member_id: 'member-1',
    guest_profile_id: null,
    month_start: '2026-04-10',
    status: 'approved',
    fee_type: 'custom',
    amount_paid: 15500,
    payment_recorded_at: '2026-04-08T12:00:00.000Z',
    notes: null,
    receipt_number: null,
    receipt_sent_at: null,
    reviewed_by: 'user-1',
    reviewed_at: '2026-04-08T12:05:00.000Z',
    review_note: null,
    created_at: '2026-04-08T12:00:00.000Z',
    registrant_name: 'Client One',
    registrant_type: 'member',
    registrant_email: 'client.one@example.com',
    ...overrides,
  }
}

function buildScheduleRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rule-1',
    class_id: 'class-1',
    day_of_week: 1,
    session_time: '09:00:00',
    created_at: '2026-04-08T12:00:00.000Z',
    ...overrides,
  }
}

function buildSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-1',
    class_id: 'class-1',
    scheduled_at: '2026-04-14T09:00:00-05:00',
    period_start: '2026-04-01',
    created_at: '2026-04-08T12:00:00.000Z',
    marked_count: 1,
    total_count: 2,
    ...overrides,
  }
}

function buildAttendance(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'attendance-1',
    session_id: 'session-1',
    member_id: 'member-1',
    guest_profile_id: null,
    marked_by: 'admin-1',
    marked_at: '2026-04-14T15:00:00.000Z',
    created_at: '2026-04-14T15:00:00.000Z',
    registrant_name: 'Client One',
    registrant_type: 'member',
    ...overrides,
  }
}

function createClassPatchClient(options: {
  updatedRow?: { id: string } | null
  error?: { message: string } | null
} = {}) {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('classes')

        return {
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('class-1')

                return {
                  select(columns: string) {
                    expect(columns).toBe('id')

                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: options.updatedRow === undefined ? { id: 'class-1' } : options.updatedRow,
                        error: options.error ?? null,
                      }),
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

function createRegistrationPostClient(options: {
  registrationError?: { message: string; code?: string } | null
  existingGuestProfile?: Record<string, unknown> | null
  existingGuestProfileError?: { message: string } | null
  futureSessions?: Array<Record<string, unknown>>
  existingAttendance?: Array<Record<string, unknown>>
  futureSessionsError?: { message: string } | null
  attendanceInsertError?: { message: string } | null
} = {}) {
  const memberId = '11111111-1111-1111-1111-111111111111'
  const registrationValues: Array<Record<string, unknown>> = []
  const guestDeletes: string[] = []
  const guestInserts: Array<Record<string, unknown>> = []
  const guestLookupFilters: Array<{
    operator: 'eq' | 'is'
    column: string
    value: unknown
  }> = []
  const guestLookupOrders: Array<{
    column: string
    ascending: boolean
  }> = []
  const guestLookupLimits: number[] = []
  const attendanceInserts: Array<Record<string, unknown>> = []
  const attendanceDeletes: string[] = []
  let attendanceDeleteMarkedAtFilterApplied = false

  return {
    registrationValues,
    guestDeletes,
    guestInserts,
    guestLookupFilters,
    guestLookupOrders,
    guestLookupLimits,
    attendanceInserts,
    attendanceDeletes,
    get attendanceDeleteMarkedAtFilterApplied() {
      return attendanceDeleteMarkedAtFilterApplied
    },
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, status')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(memberId)

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: memberId, status: 'Active' },
                      error: null,
                    }),
                  }
                },
              }
            },
          }
        }

        if (table === 'guest_profiles') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

              const chain = {
                eq(column: string, value: unknown) {
                  guestLookupFilters.push({
                    operator: 'eq',
                    column,
                    value,
                  })

                  return chain
                },
                is(column: string, value: null) {
                  guestLookupFilters.push({
                    operator: 'is',
                    column,
                    value,
                  })

                  return chain
                },
                order(column: string, orderOptions: { ascending: boolean }) {
                  guestLookupOrders.push({
                    column,
                    ascending: orderOptions.ascending,
                  })

                  return chain
                },
                limit(value: number) {
                  guestLookupLimits.push(value)
                  return chain
                },
                maybeSingle: vi.fn().mockResolvedValue({
                  data: options.existingGuestProfile ?? null,
                  error: options.existingGuestProfileError ?? null,
                }),
              }

              return chain
            },
            insert(values: Record<string, unknown>) {
              guestInserts.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe('id')

                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'guest-1' },
                      error: null,
                    }),
                  }
                },
              }
            },
            delete() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  guestDeletes.push(value)

                  return Promise.resolve({
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'class_sessions') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, scheduled_at, period_start')

              const chain = {
                eq(column: string, value: string) {
                  expect(column).toBe('class_id')
                  expect(value).toBe('class-1')

                  return chain
                },
                gt(column: string) {
                  expect(column).toBe('scheduled_at')
                  return chain
                },
                order(column: string, orderOptions: { ascending: boolean }) {
                  expect(column).toBe('scheduled_at')
                  expect(orderOptions.ascending).toBe(true)

                  return Promise.resolve({
                    data: options.futureSessions ?? [],
                    error: options.futureSessionsError ?? null,
                  })
                },
              }

              return chain
            },
          }
        }

        if (table === 'class_attendance') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, session_id')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual((options.futureSessions ?? []).map((session) => String(session.id)))

                  return {
                    eq(column: string, value: string) {
                      expect(column).toBe('member_id')
                      expect(value).toBe(memberId)

                      return {
                        is(column: string, value: null) {
                          expect(column).toBe('guest_profile_id')
                          expect(value).toBeNull()

                          return Promise.resolve({
                            data: options.existingAttendance ?? [],
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
                  attendanceDeletes.push(...values)

                  return {
                    is(column: string, value: null) {
                      expect(column).toBe('marked_at')
                      expect(value).toBeNull()
                      attendanceDeleteMarkedAtFilterApplied = true

                      return Promise.resolve({
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
              attendanceInserts.push(...(Array.isArray(values) ? values : [values]))

              return Promise.resolve({
                error: options.attendanceInsertError ?? null,
              })
            },
          }
        }

        expect(table).toBe('class_registrations')

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
                  is(nextColumn: string, nextValue: null) {
                    expect(nextColumn).toBe('guest_profile_id')
                    expect(nextValue).toBeNull()

                    return Promise.resolve({
                      data: [{ id: 'registration-1', month_start: '2026-04-10' }],
                      error: null,
                    })
                  },
                }

                return chain
              },
            }
          },
          insert(values: Record<string, unknown>) {
            registrationValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: options.registrationError ? null : { id: 'registration-1' },
                    error: options.registrationError ?? null,
                  }),
                }
              },
            }
          },
        }
      },
    },
  }
}

function createScheduleRulePostClient() {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
    client: {
      from(table: string) {
        expect(table).toBe('class_schedule_rules')

        return {
          insert(values: Record<string, unknown>) {
            insertValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id, class_id, day_of_week, session_time, created_at')

                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: buildScheduleRule(),
                    error: null,
                  }),
                }
              },
            }
          },
        }
      },
    },
  }
}

function createScheduleRuleDeleteClient() {
  return {
    client: {
      from(table: string) {
        expect(table).toBe('class_schedule_rules')

        return {
          delete() {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('rule-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('class_id')
                    expect(nextValue).toBe('class-1')

                    return {
                      select(columns: string) {
                        expect(columns).toBe('id')

                        return {
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: 'rule-1' },
                            error: null,
                          }),
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

function createClassTrainerPostClient(options: {
  insertError?: { message: string; code?: string } | null
} = {}) {
  const insertValues: Array<Record<string, unknown>> = []

  return {
    insertValues,
    client: {
      from(table: string) {
        expect(table).toBe('class_trainers')

        return {
          insert(values: Record<string, unknown>) {
            insertValues.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('class_id, profile_id, created_at')

                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: options.insertError ? null : buildClassTrainer(),
                    error: options.insertError ?? null,
                  }),
                }
              },
            }
          },
        }
      },
    },
  }
}

function createClassTrainerDeleteClient(options: {
  notFound?: boolean
} = {}) {
  return {
    client: {
      from(table: string) {
        expect(table).toBe('class_trainers')

        return {
          delete() {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('class_id')
                expect(value).toBe('class-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('profile_id')
                    expect(nextValue).toBe('trainer-1')

                    return {
                      select(columns: string) {
                        expect(columns).toBe('profile_id')

                        return {
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: options.notFound ? null : { profile_id: 'trainer-1' },
                            error: null,
                          }),
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

function createGenerateSessionsClient() {
  const upsertValues: Array<Array<Record<string, unknown>>> = []
  const attendanceInserts: Array<Record<string, unknown>> = []
  let selectCallCount = 0

  return {
    upsertValues,
    attendanceInserts,
    client: {
      from(table: string) {
        if (table === 'class_sessions') {
          return {
            select(columns: string) {
              const callIndex = selectCallCount
              selectCallCount += 1

              const chain = {
                eq(column: string, value: string) {
                  if (column === 'class_id') {
                    expect(value).toBe('class-1')
                  }

                  if (column === 'period_start') {
                    expect(value).toBe('2026-04-01')
                  }

                  return chain
                },
                in(column: string, values: string[]) {
                  expect(column).toBe('scheduled_at')
                  expect(values).toEqual([
                    '2026-04-14T09:00:00-05:00',
                    '2026-04-16T09:00:00-05:00',
                  ])

                  return Promise.resolve({
                    data:
                      callIndex === 0
                        ? [{ id: 'session-existing', scheduled_at: '2026-04-14T09:00:00-05:00' }]
                        : [
                            {
                              id: 'session-existing',
                              scheduled_at: '2026-04-14T09:00:00-05:00',
                              period_start: '2026-04-01',
                            },
                            {
                              id: 'session-new',
                              scheduled_at: '2026-04-16T09:00:00-05:00',
                              period_start: '2026-04-01',
                            },
                          ],
                    error: null,
                  })
                },
              }

              if (callIndex === 0) {
                expect(columns).toBe('id, scheduled_at')
              } else {
                expect(columns).toBe('id, scheduled_at, period_start')
              }

              return chain
            },
            upsert(values: Array<Record<string, unknown>>, options: Record<string, unknown>) {
              upsertValues.push(values)
              expect(options).toMatchObject({
                onConflict: 'class_id,scheduled_at',
                ignoreDuplicates: true,
              })

              return Promise.resolve({
                error: null,
              })
            },
          }
        }

        expect(table).toBe('class_attendance')

        return {
          insert(values: Array<Record<string, unknown>>) {
            attendanceInserts.push(...values)

            return Promise.resolve({
              error: null,
            })
          },
        }
      },
    },
  }
}

function createAttendancePatchClient() {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('class_attendance')

        return {
          select(columns: string) {
            expect(columns).toBe('id, session_id')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('attendance-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('session_id')
                    expect(nextValue).toBe('session-1')

                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: 'attendance-1', session_id: 'session-1' },
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('attendance-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('session_id')
                    expect(nextValue).toBe('session-1')

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

function createRegistrationReviewClient(options: {
  reviewState?: { id: string; class_id: string; status: string; payment_recorded_at?: string | null } | null
  updatedRegistration?: { id: string } | null
  updateError?: { message: string } | null
  futureSessions?: Array<Record<string, unknown>>
  existingAttendance?: Array<Record<string, unknown>>
  futureSessionsError?: { message: string } | null
  attendanceInsertError?: { message: string } | null
} = {}) {
  const updateValues: Array<Record<string, unknown>> = []
  const attendanceInserts: Array<Record<string, unknown>> = []
  const attendanceDeletes: string[] = []
  let attendanceDeleteMarkedAtFilterApplied = false

  return {
    updateValues,
    attendanceInserts,
    attendanceDeletes,
    get attendanceDeleteMarkedAtFilterApplied() {
      return attendanceDeleteMarkedAtFilterApplied
    },
    client: {
      from(table: string) {
        if (table === 'class_sessions') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, scheduled_at, period_start')

              const chain = {
                eq(column: string, value: string) {
                  expect(column).toBe('class_id')
                  expect(value).toBe('class-1')

                  return chain
                },
                gt(column: string) {
                  expect(column).toBe('scheduled_at')
                  return chain
                },
                order(column: string, orderOptions: { ascending: boolean }) {
                  expect(column).toBe('scheduled_at')
                  expect(orderOptions.ascending).toBe(true)

                  return Promise.resolve({
                    data: options.futureSessions ?? [],
                    error: options.futureSessionsError ?? null,
                  })
                },
              }

              return chain
            },
          }
        }

        if (table === 'class_attendance') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, session_id')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual((options.futureSessions ?? []).map((session) => String(session.id)))

                  return {
                    eq(column: string, value: string) {
                      expect(column).toBe('member_id')
                      expect(value).toBe('member-1')

                      return {
                        is(column: string, value: null) {
                          expect(column).toBe('guest_profile_id')
                          expect(value).toBeNull()

                          return Promise.resolve({
                            data: options.existingAttendance ?? [],
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
                  attendanceDeletes.push(...values)

                  return {
                    is(column: string, value: null) {
                      expect(column).toBe('marked_at')
                      expect(value).toBeNull()
                      attendanceDeleteMarkedAtFilterApplied = true

                      return Promise.resolve({
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
              attendanceInserts.push(...(Array.isArray(values) ? values : [values]))

              return Promise.resolve({
                error: options.attendanceInsertError ?? null,
              })
            },
          }
        }

        expect(table).toBe('class_registrations')

        return {
          select(columns: string) {
            if (columns === 'id, month_start') {
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
                    is(nextColumn: string, nextValue: null) {
                      expect(nextColumn).toBe('guest_profile_id')
                      expect(nextValue).toBeNull()

                      return Promise.resolve({
                        data: [{ id: 'registration-1', month_start: '2026-04-10' }],
                        error: null,
                      })
                    },
                  }

                  return chain
                },
              }
            }

            expect(columns).toBe('id, class_id, status, payment_recorded_at')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('registration-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('class_id')
                    expect(nextValue).toBe('class-1')

                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data:
                          options.reviewState ?? {
                            id: 'registration-1',
                            class_id: 'class-1',
                            status: 'pending',
                            payment_recorded_at: null,
                          },
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('registration-1')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('class_id')
                    expect(nextValue).toBe('class-1')

                    return {
                      eq(statusColumn: string, statusValue: string) {
                        expect(statusColumn).toBe('status')
                        expect(statusValue).toBe('pending')

                        return {
                          select(columns: string) {
                            expect(columns).toBe('id')

                            return {
                              maybeSingle: vi.fn().mockResolvedValue({
                                data:
                                  'updatedRegistration' in options
                                    ? options.updatedRegistration
                                    : { id: 'registration-1' },
                                error: options.updateError ?? null,
                              }),
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
        }
      },
    },
  }
}

describe('classes routes', () => {
  afterEach(() => {
    resetServerAuthMocks()
    vi.clearAllMocks()
  })

  it('returns the classes list for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassesMock.mockResolvedValue([buildClass()])

    const response = await getClasses()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.classes).toHaveLength(1)
    expect(readClassesMock).toHaveBeenCalled()
  })

  it('logs class-loading failures and returns a generic 500 response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      mockAuthenticatedUser()
      getSupabaseAdminClientMock.mockReturnValue({})
      readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
      readClassesMock.mockRejectedValue(new Error('Database offline.'))

      const response = await getClasses()
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body).toEqual({
        ok: false,
        error: 'Unexpected server error while loading classes.',
      })
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load classes:',
        expect.any(Error),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns a single class detail for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())

    const response = await getClass(new Request('http://localhost/api/classes/class-1'), {
      params: Promise.resolve({ id: 'class-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.class.name).toBe('Weight Loss Club')
  })

  it('blocks period-start updates for non-admin users', async () => {
    mockForbidden()

    const response = await patchClass(
      new Request('http://localhost/api/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ current_period_start: '2026-04-08' }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(403)
  })

  it('updates the current period start for admins', async () => {
    mockAdminUser()
    const { client, updateValues } = createClassPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass({ current_period_start: '2026-04-08' }))

    const response = await patchClass(
      new Request('http://localhost/api/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ current_period_start: '2026-04-08' }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([{ current_period_start: '2026-04-08' }])
    expect(body.class.current_period_start).toBe('2026-04-08')
  })

  it('returns 401 when class settings are updated without a session', async () => {
    mockUnauthorized()

    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 16500,
          per_session_fee: 1200,
          trainer_compensation_percent: 35,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('blocks class settings updates for non-admin users', async () => {
    mockForbidden()

    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 16500,
          per_session_fee: 1200,
          trainer_compensation_percent: 35,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(403)
  })

  it('updates class settings for admins', async () => {
    mockAdminUser()
    const { client, updateValues } = createClassPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(
      buildClass({
        monthly_fee: 16500,
        per_session_fee: 1200,
        trainer_compensation_pct: 35,
      }),
    )

    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 16500,
          per_session_fee: 1200,
          trainer_compensation_percent: 35,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        monthly_fee: 16500,
        per_session_fee: 1200,
        trainer_compensation_pct: 35,
      },
    ])
    expect(body.class.monthly_fee).toBe(16500)
    expect(body.class.per_session_fee).toBe(1200)
    expect(body.class.trainer_compensation_pct).toBe(35)
  })

  it('allows admins to clear the per-session fee', async () => {
    mockAdminUser()
    const { client, updateValues } = createClassPatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(
      buildClass({
        monthly_fee: 15500,
        per_session_fee: null,
        trainer_compensation_pct: 30,
      }),
    )

    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 15500,
          per_session_fee: null,
          trainer_compensation_percent: 30,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        monthly_fee: 15500,
        per_session_fee: null,
        trainer_compensation_pct: 30,
      },
    ])
    expect(body.class.per_session_fee).toBeNull()
  })

  it('logs unexpected class settings update failures and returns a generic 500 response', async () => {
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      mockAdminUser()
      const { client } = createClassPatchClient({
        error: {
          message: 'database write failed',
        },
      })
      getSupabaseAdminClientMock.mockReturnValue(client)

      const response = await patchClassSettings(
        new Request('http://localhost/api/classes/class-1/settings', {
          method: 'PATCH',
          body: JSON.stringify({
            monthly_fee: 16500,
            per_session_fee: 1200,
            trainer_compensation_percent: 35,
          }),
        }),
        {
          params: Promise.resolve({ id: 'class-1' }),
        },
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'Unexpected server error while updating class settings.',
      })
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Unexpected error while updating class settings.',
        expect.any(Error),
      )
      expect(readClassByIdMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorMock.mockRestore()
    }
  })

  it('rejects invalid JSON bodies for the class settings route', async () => {
    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: '{',
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })

  it('rejects non-positive monthly fees on the class settings route', async () => {
    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 0,
          per_session_fee: 1200,
          trainer_compensation_percent: 35,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'monthly_fee must be a positive number.',
    })
  })

  it('rejects invalid per-session fees on the class settings route', async () => {
    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 16500,
          per_session_fee: -50,
          trainer_compensation_percent: 35,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'per_session_fee must be a positive number or null.',
    })
  })

  it('rejects out-of-range trainer compensation on the class settings route', async () => {
    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 16500,
          per_session_fee: 1200,
          trainer_compensation_percent: 120,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'trainer_compensation_percent must be between 0 and 100.',
    })
  })

  it('returns 404 when the class settings route targets a missing class', async () => {
    mockAdminUser()
    const { client } = createClassPatchClient({
      updatedRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchClassSettings(
      new Request('http://localhost/api/classes/class-1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_fee: 16500,
          per_session_fee: 1200,
          trainer_compensation_percent: 35,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Class not found.',
    })
    expect(readClassByIdMock).not.toHaveBeenCalled()
  })

  it('uses the requested status filter for admin registration reads', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile())
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationsMock.mockResolvedValue([buildRegistration({ status: 'pending' })])

    const response = await getClassRegistrations(
      new Request('http://localhost/api/classes/class-1/registrations?status=pending'),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(readClassRegistrationsMock).toHaveBeenCalledWith({}, 'class-1', {
      status: 'pending',
    })
  })

  it('forces approved-only registration reads for staff users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationsMock.mockResolvedValue([buildRegistration()])

    const response = await getClassRegistrations(
      new Request('http://localhost/api/classes/class-1/registrations?status=denied'),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(readClassRegistrationsMock).toHaveBeenCalledWith({}, 'class-1', {
      status: 'approved',
    })
  })

  it('forces pending status when staff create registrations', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration({ status: 'pending' }))
    const { client, registrationValues } = createRegistrationPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'member',
          member_id: '11111111-1111-1111-1111-111111111111',
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(registrationValues[0]?.status).toBe('pending')
    expect(body.registration.status).toBe('pending')
  })

  it('forbids class registration for staff without classes.register permission', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Trainer'] }))

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'member',
          member_id: '11111111-1111-1111-1111-111111111111',
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(readClassByIdMock).not.toHaveBeenCalled()
  })

  it('forces approved status when admins create registrations', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'admin', titles: ['Owner'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration({ status: 'approved' }))
    const { client, registrationValues } = createRegistrationPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'member',
          member_id: '11111111-1111-1111-1111-111111111111',
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(registrationValues[0]?.status).toBe('approved')
    expect(body.registration.status).toBe('approved')
  })

  it('reuses an existing guest profile when normalized lookup fields match', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'admin', titles: ['Owner'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(
      buildRegistration({
        member_id: null,
        guest_profile_id: 'guest-existing',
        registrant_name: 'Guest One',
        registrant_type: 'guest',
      }),
    )
    const {
      client,
      guestInserts,
      guestLookupFilters,
      guestLookupLimits,
      guestLookupOrders,
      registrationValues,
    } = createRegistrationPostClient({
      existingGuestProfile: {
        id: 'guest-existing',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'guest',
          guest: {
            name: '  Guest One  ',
            phone: '   ',
            email: ' guest.one@example.com ',
            remark: 'Has a prior visit note.',
          },
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(registrationValues[0]?.guest_profile_id).toBe('guest-existing')
    expect(guestInserts).toEqual([])
    expect(guestLookupFilters).toEqual([
      {
        operator: 'eq',
        column: 'name',
        value: 'Guest One',
      },
      {
        operator: 'is',
        column: 'phone',
        value: null,
      },
      {
        operator: 'eq',
        column: 'email',
        value: 'guest.one@example.com',
      },
    ])
    expect(guestLookupOrders).toEqual([
      {
        column: 'created_at',
        ascending: true,
      },
      {
        column: 'id',
        ascending: true,
      },
    ])
    expect(guestLookupLimits).toEqual([1])
  })

  it('does not backfill attendance for pending staff-created registrations', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(buildRegistration({ status: 'pending' }))
    const { client, attendanceInserts } = createRegistrationPostClient({
      futureSessions: [
        {
          id: 'session-1',
          scheduled_at: '2026-04-12T09:00:00-05:00',
          period_start: '2026-04-01',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'member',
          member_id: '11111111-1111-1111-1111-111111111111',
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(attendanceInserts).toEqual([])
  })

  it('rolls back a guest profile if registration creation fails after the guest insert', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile())
    readClassByIdMock.mockResolvedValue(buildClass())
    const { client, guestDeletes } = createRegistrationPostClient({
      registrationError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'guest',
          guest: {
            name: 'Guest One',
            email: 'guest.one@example.com',
          },
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(guestDeletes).toEqual(['guest-1'])
    expect(body.error).toContain('A registration already exists')
  })

  it('does not roll back a reused guest profile if registration creation fails', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile())
    readClassByIdMock.mockResolvedValue(buildClass())
    const { client, guestDeletes, guestInserts } = createRegistrationPostClient({
      existingGuestProfile: {
        id: 'guest-existing',
      },
      registrationError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'guest',
          guest: {
            name: 'Guest One',
            phone: null,
            email: 'guest.one@example.com',
          },
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 3000,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(guestInserts).toEqual([])
    expect(guestDeletes).toEqual([])
    expect(body.error).toContain('A registration already exists')
  })

  it('returns 400 for invalid fee selection before creating or looking up a guest profile', async () => {
    mockAuthenticatedUser()
    readStaffProfileMock.mockResolvedValue(buildProfile())
    readClassByIdMock.mockResolvedValue(buildClass())
    const { client, guestDeletes, guestInserts, guestLookupFilters } = createRegistrationPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await postClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations', {
        method: 'POST',
        body: JSON.stringify({
          registrant_type: 'guest',
          guest: {
            name: 'Guest One',
            email: 'guest.one@example.com',
          },
          month_start: '2026-04-10',
          fee_type: 'custom',
          amount_paid: 0,
          payment_received: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Custom class fee must be a whole-number JMD amount of at least 1.')
    expect(guestLookupFilters).toEqual([])
    expect(guestInserts).toEqual([])
    expect(guestDeletes).toEqual([])
  })

  it('requires a denial reason when denying a registration', async () => {
    mockAdminUser()

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'denied',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(400)
  })

  it('updates review metadata when approving a registration', async () => {
    mockAdminUser({
      profile: {
        id: 'admin-1',
      },
    })
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(
      buildRegistration({
        status: 'approved',
        month_start: '2026-04-01',
        amount_paid: 3200,
        review_note: 'Paid at the desk.',
      }),
    )
    const { client, updateValues } = createRegistrationReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: 'Paid at the desk.',
          review_note: 'Paid at the desk.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues[0]).toMatchObject({
      status: 'approved',
      fee_type: 'custom',
      amount_paid: 3200,
      payment_recorded_at: expect.any(String),
      notes: 'Paid at the desk.',
      review_note: 'Paid at the desk.',
      reviewed_by: 'admin-1',
    })
    expect(body.registration.amount_paid).toBe(3200)
  })

  it('returns 400 when the registration is already reviewed before the update applies', async () => {
    mockAdminUser({
      profile: {
        id: 'admin-1',
      },
    })
    readClassByIdMock.mockResolvedValue(buildClass())
    const { client } = createRegistrationReviewClient({
      updatedRegistration: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: 'Paid at the desk.',
          review_note: 'Paid at the desk.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      ok: false,
      error: 'This class registration has already been reviewed.',
    })
    expect(readClassRegistrationByIdMock).not.toHaveBeenCalled()
    expect(readClassByIdMock).toHaveBeenCalledWith(client, 'class-1')
  })

  it('returns 400 when fee selection validation fails during registration approval', async () => {
    mockAdminUser({
      profile: {
        id: 'admin-1',
      },
    })
    readClassByIdMock.mockResolvedValue(
      buildClass({
        monthly_fee: null,
      }),
    )
    const { client, updateValues } = createRegistrationReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          fee_type: 'monthly',
          amount_paid: 3200,
          payment_received: true,
          notes: 'Paid at the desk.',
          review_note: 'Paid at the desk.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Monthly fee is not configured for this class.')
    expect(updateValues).toEqual([])
    expect(readClassRegistrationByIdMock).not.toHaveBeenCalled()
  })

  it('backfills current-period attendance when approving a pending registration', async () => {
    mockAdminUser({
      profile: {
        id: 'admin-1',
      },
    })
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(
      buildRegistration({
        status: 'approved',
        month_start: '2026-04-01',
        amount_paid: 3200,
        review_note: 'Paid at the desk.',
      }),
    )
    const { attendanceInserts, client } = createRegistrationReviewClient({
      futureSessions: [
        {
          id: 'session-1',
          scheduled_at: '2026-04-15T09:00:00-05:00',
          period_start: '2026-04-01',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: 'Paid at the desk.',
          review_note: 'Paid at the desk.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(attendanceInserts).toEqual([
      {
        session_id: 'session-1',
        member_id: 'member-1',
        guest_profile_id: null,
        marked_at: null,
        marked_by: null,
      },
    ])
  })

  it('only deletes unmarked attendance rows when reconciling current-period attendance', async () => {
    mockAdminUser({
      profile: {
        id: 'admin-1',
      },
    })
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationByIdMock.mockResolvedValue(
      buildRegistration({
        status: 'approved',
        month_start: '2026-04-15',
      }),
    )
    const reviewClient = createRegistrationReviewClient({
      futureSessions: [
        {
          id: 'session-1',
          scheduled_at: '2026-04-05T09:00:00-05:00',
          period_start: '2026-04-01',
        },
        {
          id: 'session-2',
          scheduled_at: '2026-04-17T09:00:00-05:00',
          period_start: '2026-04-01',
        },
      ],
      existingAttendance: [
        { id: 'attendance-1', session_id: 'session-1' },
        { id: 'attendance-2', session_id: 'session-2' },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(reviewClient.client)

    const response = await patchClassRegistration(
      new Request('http://localhost/api/classes/class-1/registrations/registration-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          fee_type: 'custom',
          amount_paid: 3200,
          payment_received: true,
          notes: 'Paid at the desk.',
          review_note: 'Paid at the desk.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', registrationId: 'registration-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(reviewClient.attendanceDeletes).toEqual(['attendance-1'])
    expect(reviewClient.attendanceDeleteMarkedAtFilterApplied).toBe(true)
  })

  it('returns class trainers for admins', async () => {
    mockAdminUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassTrainersMock.mockResolvedValue(buildClass().trainers)

    const response = await getClassTrainers(
      new Request('http://localhost/api/classes/class-1/trainers'),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.trainers).toHaveLength(1)
    expect(body.trainers[0].name).toBe('Jordan Trainer')
  })

  it('creates a class trainer assignment for admins', async () => {
    mockAdminUser()
    const { client, insertValues } = createClassTrainerPostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readStaffProfileMock.mockResolvedValue(
      buildProfile({
        id: TRAINER_PROFILE_ID,
        role: 'staff',
        titles: ['Trainer'],
      }),
    )

    const response = await postClassTrainer(
      new Request('http://localhost/api/classes/class-1/trainers', {
        method: 'POST',
        body: JSON.stringify({
          profile_id: TRAINER_PROFILE_ID,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(insertValues).toEqual([
      {
        class_id: 'class-1',
        profile_id: TRAINER_PROFILE_ID,
      },
    ])
    expect(body.class_trainer.profile_id).toBe(TRAINER_PROFILE_ID)
  })

  it('returns validation errors for invalid class trainer payloads', async () => {
    mockAdminUser()
    getSupabaseAdminClientMock.mockReturnValue({})

    const response = await postClassTrainer(
      new Request('http://localhost/api/classes/class-1/trainers', {
        method: 'POST',
        body: JSON.stringify({
          profile_id: 'not-a-uuid',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Invalid uuid')
  })

  it('rejects non-trainer staff when assigning a class trainer', async () => {
    mockAdminUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readClassByIdMock.mockResolvedValue(buildClass())
    readStaffProfileMock.mockResolvedValue(
      buildProfile({
        id: TRAINER_PROFILE_ID,
        role: 'staff',
        titles: ['Assistant'],
      }),
    )

    const response = await postClassTrainer(
      new Request('http://localhost/api/classes/class-1/trainers', {
        method: 'POST',
        body: JSON.stringify({
          profile_id: TRAINER_PROFILE_ID,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Only staff with the Trainer title can be assigned to a class')
  })

  it('returns a conflict when the trainer is already assigned to the class', async () => {
    mockAdminUser()
    const { client } = createClassTrainerPostClient({
      insertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readStaffProfileMock.mockResolvedValue(
      buildProfile({
        id: TRAINER_PROFILE_ID,
        role: 'staff',
        titles: ['Trainer'],
      }),
    )

    const response = await postClassTrainer(
      new Request('http://localhost/api/classes/class-1/trainers', {
        method: 'POST',
        body: JSON.stringify({
          profile_id: TRAINER_PROFILE_ID,
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe('Trainer is already assigned to this class')
  })

  it('removes a class trainer assignment for admins', async () => {
    mockAdminUser()
    const { client } = createClassTrainerDeleteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())

    const response = await deleteClassTrainer(
      new Request('http://localhost/api/classes/class-1/trainers/trainer-1', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'class-1', profileId: 'trainer-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('returns not found when removing a missing class trainer assignment', async () => {
    mockAdminUser()
    const { client } = createClassTrainerDeleteClient({ notFound: true })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())

    const response = await deleteClassTrainer(
      new Request('http://localhost/api/classes/class-1/trainers/trainer-1', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'class-1', profileId: 'trainer-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Class trainer not found.')
  })

  it('returns class schedule rules for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassScheduleRulesMock.mockResolvedValue([buildScheduleRule()])

    const response = await getClassScheduleRules(new Request('http://localhost/api/classes/class-1/schedule-rules'), {
      params: Promise.resolve({ id: 'class-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.schedule_rules).toHaveLength(1)
    expect(body.schedule_rules[0].day_of_week).toBe(1)
  })

  it('creates a class schedule rule for admins', async () => {
    mockAdminUser()
    const { client, insertValues } = createScheduleRulePostClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())

    const response = await postClassScheduleRule(
      new Request('http://localhost/api/classes/class-1/schedule-rules', {
        method: 'POST',
        body: JSON.stringify({
          day_of_week: 1,
          session_time: '09:00',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(insertValues).toEqual([
      {
        class_id: 'class-1',
        day_of_week: 1,
        session_time: '09:00:00',
      },
    ])
    expect(body.schedule_rule.session_time).toBe('09:00:00')
  })

  it('deletes a class schedule rule for admins', async () => {
    mockAdminUser()
    const { client } = createScheduleRuleDeleteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())

    const response = await deleteClassScheduleRule(
      new Request('http://localhost/api/classes/class-1/schedule-rules/rule-1', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({ id: 'class-1', ruleId: 'rule-1' }),
      },
    )

    expect(response.status).toBe(200)
  })

  it('returns current-period class sessions for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Trainer'] }))
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassSessionsMock.mockResolvedValue([buildSession()])

    const response = await getClassSessions(
      new Request('http://localhost/api/classes/class-1/sessions?period_start=2026-04-01'),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(readClassSessionsMock).toHaveBeenCalledWith({}, 'class-1', '2026-04-01')
    expect(body.sessions).toHaveLength(1)
  })

  it('generates only new sessions and seeds attendance for eligible registrants', async () => {
    mockAdminUser()
    const { client, upsertValues, attendanceInserts } = createGenerateSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readClassByIdMock.mockResolvedValue(buildClass())
    readClassRegistrationsMock.mockResolvedValue([
      buildRegistration({
        id: 'registration-1',
        member_id: 'member-1',
        guest_profile_id: null,
        month_start: '2026-04-05',
      }),
      buildRegistration({
        id: 'registration-2',
        member_id: null,
        guest_profile_id: 'guest-1',
        registrant_type: 'guest',
        registrant_name: 'Guest One',
        month_start: '2026-04-20',
      }),
    ])

    const response = await postClassSessions(
      new Request('http://localhost/api/classes/class-1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          sessions: [
            { scheduled_at: '2026-04-14T09:00:00-05:00' },
            { scheduled_at: '2026-04-16T09:00:00-05:00' },
          ],
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(upsertValues).toHaveLength(1)
    expect(attendanceInserts).toEqual([
      {
        session_id: 'session-new',
        member_id: 'member-1',
        guest_profile_id: null,
        marked_by: null,
        marked_at: null,
      },
    ])
    expect(body.count).toBe(1)
  })

  it('returns session attendance for authenticated users', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Trainer'] }))
    readClassSessionByIdMock.mockResolvedValue(buildSession())
    readClassAttendanceMock.mockResolvedValue([buildAttendance()])

    const response = await getSessionAttendance(
      new Request('http://localhost/api/classes/class-1/sessions/session-1/attendance'),
      {
        params: Promise.resolve({ id: 'class-1', sessionId: 'session-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.attendance).toHaveLength(1)
  })

  it('forbids trainer-title staff from marking attendance', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Trainer'] }))

    const response = await postSessionAttendance(
      new Request('http://localhost/api/classes/class-1/sessions/session-1/attendance', {
        method: 'POST',
        body: JSON.stringify({
          member_id: '11111111-1111-1111-1111-111111111111',
          marked_at: '2026-04-14T15:00:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', sessionId: 'session-1' }),
      },
    )

    expect(response.status).toBe(403)
  })

  it('returns not found when front desk staff tries to mark attendance directly', async () => {
    mockAuthenticatedUser()
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'staff', titles: ['Assistant'] }))

    const response = await postSessionAttendance(
      new Request('http://localhost/api/classes/class-1/sessions/session-1/attendance', {
        method: 'POST',
        body: JSON.stringify({
          member_id: '11111111-1111-1111-1111-111111111111',
          marked_at: '2026-04-14T15:00:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({ id: 'class-1', sessionId: 'session-1' }),
      },
    )

    expect(response.status).toBe(404)
  })

  it('updates attendance rows for admins', async () => {
    mockAuthenticatedUser({
      id: 'admin-1',
      email: 'admin@evolutionzfitness.com',
    })
    const { client, updateValues } = createAttendancePatchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(buildProfile({ id: 'admin-1', role: 'admin' }))
    readClassSessionByIdMock.mockResolvedValue(buildSession())
    readClassAttendanceMock.mockResolvedValue([
      buildAttendance({
        id: 'attendance-1',
        marked_at: '2026-04-14T15:00:00.000Z',
        marked_by: 'admin-1',
      }),
    ])

    const response = await patchSessionAttendance(
      new Request('http://localhost/api/classes/class-1/sessions/session-1/attendance/attendance-1', {
        method: 'PATCH',
        body: JSON.stringify({
          marked_at: '2026-04-14T15:00:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({
          id: 'class-1',
          sessionId: 'session-1',
          attendanceId: 'attendance-1',
        }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateValues[0]).toMatchObject({
      marked_by: 'admin-1',
    })
    expect(body.attendance.id).toBe('attendance-1')
  })

  it('returns not found when front desk staff tries to update attendance rows directly', async () => {
    mockAuthenticatedUser({
      id: 'assistant-1',
      email: 'assistant@evolutionzfitness.com',
    })
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(
      buildProfile({
        id: 'assistant-1',
        role: 'staff',
        titles: ['Administrative Assistant'],
      }),
    )

    const response = await patchSessionAttendance(
      new Request('http://localhost/api/classes/class-1/sessions/session-1/attendance/attendance-1', {
        method: 'PATCH',
        body: JSON.stringify({
          marked_at: '2026-04-14T15:00:00.000Z',
        }),
      }),
      {
        params: Promise.resolve({
          id: 'class-1',
          sessionId: 'session-1',
          attendanceId: 'attendance-1',
        }),
      },
    )

    expect(response.status).toBe(404)
  })

  it('logs attendance backfill failures without failing the registration', async () => {
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      mockAuthenticatedUser()
      readStaffProfileMock.mockResolvedValue(buildProfile({ role: 'admin', titles: ['Owner'] }))
      readClassByIdMock.mockResolvedValue(buildClass())
      readClassRegistrationByIdMock.mockResolvedValue(buildRegistration({ status: 'approved' }))
      const { client, attendanceInserts } = createRegistrationPostClient({
        futureSessions: [
          {
            id: 'session-1',
            scheduled_at: '2026-04-12T09:00:00-05:00',
            period_start: '2026-04-01',
          },
        ],
        attendanceInsertError: {
          message: 'insert failed',
        },
      })
      getSupabaseAdminClientMock.mockReturnValue(client)

      const response = await postClassRegistration(
        new Request('http://localhost/api/classes/class-1/registrations', {
          method: 'POST',
          body: JSON.stringify({
            registrant_type: 'member',
            member_id: '11111111-1111-1111-1111-111111111111',
            month_start: '2026-04-10',
            fee_type: 'custom',
            amount_paid: 3000,
            payment_received: true,
          }),
        }),
        {
          params: Promise.resolve({ id: 'class-1' }),
        },
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Failed to backfill class attendance rows after registration:',
        expect.any(Error),
      )
      expect(body.registration.status).toBe('approved')
    } finally {
      consoleErrorMock.mockRestore()
    }
  })
})
