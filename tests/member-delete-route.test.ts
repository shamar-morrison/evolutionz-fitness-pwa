import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { DELETE } from '@/app/api/members/[id]/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

type JobPollResult = QueryResult<{
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result: unknown
  error: string | null
}>

type IdRow = {
  id: string
}

type MutationResult = {
  data: unknown
  error: { message: string } | null
}

function buildDeleteMemberRow(overrides: Partial<{
  id: string
  employee_no: string | null
  card_no: string | null
  photo_url: string | null
}> = {}) {
  return {
    id: 'member-1',
    employee_no: '000611',
    card_no: null,
    photo_url: null,
    ...overrides,
  }
}

function createDeleteAdminClient({
  memberRow = buildDeleteMemberRow(),
  memberReadResult,
  ptSessionRows = [],
  ptSessionReadResult,
  trainerClientRows = [],
  trainerClientReadResult,
  cardUpdateResult = {
    data: { card_no: '0102857149' },
    error: null,
  } satisfies QueryResult<{ card_no: string }>,
  ptSessionChangesDeleteResult = {
    data: null,
    error: null,
  } satisfies MutationResult,
  ptRescheduleRequestsDeleteResult = {
    data: null,
    error: null,
  } satisfies MutationResult,
  ptSessionUpdateRequestsDeleteResult = {
    data: null,
    error: null,
  } satisfies MutationResult,
  ptSessionsDeleteResult = {
    data: null,
    error: null,
  } satisfies MutationResult,
  trainingPlanDaysDeleteResult = {
    data: null,
    error: null,
  } satisfies MutationResult,
  trainerClientsDeleteResult = {
    data: null,
    error: null,
  } satisfies MutationResult,
  removeResult = {
    data: [],
    error: null,
  },
  deleteResult = {
    data: { id: 'member-1' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
  insertResult = {
    data: { id: 'job-123' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
  pollResults = [
    {
      data: {
        id: 'job-123',
        status: 'done',
        result: { accepted: true },
        error: null,
      },
      error: null,
    },
  ] satisfies JobPollResult[],
}: {
  memberRow?: {
    id: string
    employee_no: string | null
    card_no: string | null
    photo_url: string | null
  } | null
  memberReadResult?: QueryResult<{
    id: string
    employee_no: string | null
    card_no: string | null
    photo_url: string | null
  }>
  ptSessionRows?: IdRow[]
  ptSessionReadResult?: QueryResult<IdRow[]>
  trainerClientRows?: IdRow[]
  trainerClientReadResult?: QueryResult<IdRow[]>
  cardUpdateResult?: QueryResult<{ card_no: string }>
  ptSessionChangesDeleteResult?: MutationResult
  ptRescheduleRequestsDeleteResult?: MutationResult
  ptSessionUpdateRequestsDeleteResult?: MutationResult
  ptSessionsDeleteResult?: MutationResult
  trainingPlanDaysDeleteResult?: MutationResult
  trainerClientsDeleteResult?: MutationResult
  removeResult?: { data: unknown; error: { message: string } | null }
  deleteResult?: QueryResult<{ id: string }>
  insertResult?: QueryResult<{ id: string }>
  pollResults?: JobPollResult[]
} = {}) {
  const operations: string[] = []
  const insertedJobs: Array<{ type: string; payload: unknown }> = []
  const removeCalls: string[][] = []
  const cardUpdateCalls: Array<{
    values: {
      status: 'available'
      employee_no: null
    }
    filters: Array<{ column: 'card_no'; value: string }>
  }> = []
  let pollIndex = 0
  const ptSessionIds = ptSessionRows.map((row) => row.id)
  const trainerClientIds = trainerClientRows.map((row) => row.id)

  return {
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, employee_no, card_no, photo_url')
              operations.push('read-member')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-1')

                  return {
                    maybeSingle() {
                      return Promise.resolve(
                        memberReadResult ?? {
                          data: memberRow,
                          error: null,
                        },
                      )
                    },
                  }
                },
              }
            },
            delete() {
              operations.push('delete-member')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-1')

                  return {
                    select(columns: string) {
                      expect(columns).toBe('id')

                      return {
                        maybeSingle() {
                          return Promise.resolve(deleteResult)
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'cards') {
          return {
            update(values: {
              status: 'available'
              employee_no: null
            }) {
              operations.push('update-card')

              return {
                eq(firstColumn: string, firstValue: string) {
                  expect(firstColumn).toBe('card_no')

                  return {
                    select(columns: string) {
                      expect(columns).toBe('card_no')
                      cardUpdateCalls.push({
                        values,
                        filters: [{ column: 'card_no', value: firstValue }],
                      })

                      return {
                        maybeSingle() {
                          return Promise.resolve(cardUpdateResult)
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'pt_sessions') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')
              operations.push('read-pt-sessions')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('member_id')
                  expect(value).toBe('member-1')

                  return Promise.resolve(
                    ptSessionReadResult ?? {
                      data: ptSessionRows,
                      error: null,
                    },
                  )
                },
              }
            },
            delete() {
              operations.push('delete-pt-sessions')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('member_id')
                  expect(value).toBe('member-1')
                  return Promise.resolve(ptSessionsDeleteResult)
                },
              }
            },
          }
        }

        if (table === 'pt_session_changes') {
          return {
            delete() {
              operations.push('delete-pt-session-changes')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual(ptSessionIds)
                  return Promise.resolve(ptSessionChangesDeleteResult)
                },
              }
            },
          }
        }

        if (table === 'pt_reschedule_requests') {
          return {
            delete() {
              operations.push('delete-pt-reschedule-requests')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual(ptSessionIds)
                  return Promise.resolve(ptRescheduleRequestsDeleteResult)
                },
              }
            },
          }
        }

        if (table === 'pt_session_update_requests') {
          return {
            delete() {
              operations.push('delete-pt-session-update-requests')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('session_id')
                  expect(values).toEqual(ptSessionIds)
                  return Promise.resolve(ptSessionUpdateRequestsDeleteResult)
                },
              }
            },
          }
        }

        if (table === 'trainer_clients') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')
              operations.push('read-trainer-clients')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('member_id')
                  expect(value).toBe('member-1')

                  return Promise.resolve(
                    trainerClientReadResult ?? {
                      data: trainerClientRows,
                      error: null,
                    },
                  )
                },
              }
            },
            delete() {
              operations.push('delete-trainer-clients')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('member_id')
                  expect(value).toBe('member-1')
                  return Promise.resolve(trainerClientsDeleteResult)
                },
              }
            },
          }
        }

        if (table === 'training_plan_days') {
          return {
            delete() {
              operations.push('delete-training-plan-days')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('assignment_id')
                  expect(values).toEqual(trainerClientIds)
                  return Promise.resolve(trainingPlanDaysDeleteResult)
                },
              }
            },
          }
        }

        if (table === 'access_control_jobs') {
          return {
            insert(values: { type: string; payload: unknown }) {
              operations.push('insert-job')
              insertedJobs.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe('id')

                  return {
                    single() {
                      return Promise.resolve(insertResult)
                    },
                  }
                },
              }
            },
            select(columns: string) {
              expect(columns).toBe('id, status, result, error')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(insertResult.data?.id ?? 'job-123')
                  operations.push('poll-job')

                  return {
                    maybeSingle() {
                      const result = pollResults[Math.min(pollIndex, pollResults.length - 1)]

                      pollIndex += 1

                      if (!result) {
                        throw new Error('No poll result configured.')
                      }

                      return Promise.resolve(result)
                    },
                  }
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe('member-photos')

          return {
            remove(paths: string[]) {
              operations.push('delete-photo')
              removeCalls.push(paths)

              return Promise.resolve(removeResult)
            },
          }
        },
      },
    },
    operations,
    insertedJobs,
    removeCalls,
    cardUpdateCalls,
  }
}

describe('DELETE /api/members/[id]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns 401 when deletion is requested without a session', async () => {
    mockUnauthorized()

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when deletion is requested by a non-admin user', async () => {
    mockForbidden()

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns 404 when the member does not exist', async () => {
    const { client, operations, insertedJobs } = createDeleteAdminClient({
      memberRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(404)
    expect(operations).toEqual(['read-member'])
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member not found.',
    })
  })

  it('deletes a member without a card and skips photo and device cleanup', async () => {
    const { client, operations, insertedJobs, removeCalls, cardUpdateCalls } =
      createDeleteAdminClient({
        memberRow: buildDeleteMemberRow({
          card_no: null,
          photo_url: null,
        }),
      })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(200)
    expect(operations).toEqual([
      'read-member',
      'read-pt-sessions',
      'delete-pt-sessions',
      'read-trainer-clients',
      'delete-trainer-clients',
      'delete-member',
    ])
    expect(cardUpdateCalls).toEqual([])
    expect(removeCalls).toEqual([])
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('clears the card, deletes the photo and member, then removes the device user last', async () => {
    const { client, operations, insertedJobs, removeCalls, cardUpdateCalls } =
      createDeleteAdminClient({
        memberRow: buildDeleteMemberRow({
          card_no: '0102857149',
          photo_url: 'member-1.jpg',
        }),
        ptSessionRows: [{ id: 'session-1' }, { id: 'session-2' }],
        trainerClientRows: [{ id: 'assignment-1' }],
      })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(200)
    expect(operations).toEqual([
      'read-member',
      'update-card',
      'delete-photo',
      'read-pt-sessions',
      'delete-pt-session-changes',
      'delete-pt-reschedule-requests',
      'delete-pt-session-update-requests',
      'delete-pt-sessions',
      'read-trainer-clients',
      'delete-training-plan-days',
      'delete-trainer-clients',
      'delete-member',
      'insert-job',
      'poll-job',
    ])
    expect(cardUpdateCalls).toEqual([
      {
        values: {
          status: 'available',
          employee_no: null,
        },
        filters: [{ column: 'card_no', value: '0102857149' }],
      },
    ])
    expect(removeCalls).toEqual([['member-1.jpg']])
    expect(insertedJobs).toEqual([
      {
        type: 'delete_user',
        payload: {
          employeeNo: '000611',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns an error when clearing the assigned card fails and skips later steps', async () => {
    const { client, operations, insertedJobs, removeCalls } = createDeleteAdminClient({
      memberRow: buildDeleteMemberRow({
        card_no: '0102857149',
      }),
      cardUpdateResult: {
        data: null,
        error: { message: 'Update failed.' },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(500)
    expect(operations).toEqual(['read-member', 'update-card'])
    expect(removeCalls).toEqual([])
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to clear card 0102857149: Update failed.',
    })
  })

  it('returns an error when photo deletion fails and skips member and device deletion', async () => {
    const { client, operations, insertedJobs } = createDeleteAdminClient({
      memberRow: buildDeleteMemberRow({
        card_no: '0102857149',
        photo_url: 'member-1.jpg',
      }),
      removeResult: {
        data: null,
        error: { message: 'Storage remove failed.' },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(500)
    expect(operations).toEqual(['read-member', 'update-card', 'delete-photo'])
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to delete member photo: Storage remove failed.',
    })
  })

  it('returns an error when member deletion fails and skips device cleanup', async () => {
    const { client, operations, insertedJobs } = createDeleteAdminClient({
      deleteResult: {
        data: null,
        error: { message: 'Delete failed.' },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(500)
    expect(operations).toEqual([
      'read-member',
      'read-pt-sessions',
      'delete-pt-sessions',
      'read-trainer-clients',
      'delete-trainer-clients',
      'delete-member',
    ])
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to delete member member-1: Delete failed.',
    })
  })

  it('returns an error when PT reschedule cleanup fails and skips later cleanup', async () => {
    const { client, operations, insertedJobs } = createDeleteAdminClient({
      ptSessionRows: [{ id: 'session-1' }],
      ptRescheduleRequestsDeleteResult: {
        data: null,
        error: { message: 'Delete failed.' },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(500)
    expect(operations).toEqual([
      'read-member',
      'read-pt-sessions',
      'delete-pt-session-changes',
      'delete-pt-reschedule-requests',
    ])
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to delete PT reschedule requests for member member-1: Delete failed.',
    })
  })

  it('returns success with a warning when device cleanup fails after deletion', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, operations, insertedJobs } = createDeleteAdminClient({
      memberRow: buildDeleteMemberRow({
        card_no: '0102857149',
      }),
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Delete user job failed.',
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await DELETE(new Request('http://localhost/api/members/member-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(200)
    expect(operations).toEqual([
      'read-member',
      'update-card',
      'read-pt-sessions',
      'delete-pt-sessions',
      'read-trainer-clients',
      'delete-trainer-clients',
      'delete-member',
      'insert-job',
      'poll-job',
    ])
    expect(insertedJobs).toEqual([
      {
        type: 'delete_user',
        payload: {
          employeeNo: '000611',
        },
      },
    ])
    expect(consoleErrorSpy).toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning: 'The member was deleted, but the device user may need to be manually removed from iVMS.',
    })
  })
})
