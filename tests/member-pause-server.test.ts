import { describe, expect, it } from 'vitest'
import { getMemberPauseEligibilityError } from '@/lib/member-pause-server'
import { MEMBER_PAUSE_ACTIVE_ERROR } from '@/lib/member-pause'

function createMemberPauseServerClient({
  memberRow,
  activePauseRow = null,
}: {
  memberRow: Record<string, unknown> | null
  activePauseRow?: Record<string, unknown> | null
}) {
  return {
    from(table: string) {
      if (table === 'members') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: memberRow,
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'cards') {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  data: [],
                  error: null,
                })
              },
            }
          },
        }
      }

      if (table === 'member_pauses') {
        return {
          select() {
            const query = {
              eq() {
                return query
              },
              maybeSingle() {
                return Promise.resolve({
                  data: activePauseRow,
                  error: null,
                })
              },
            }

            return query
          },
        }
      }

      if (table === 'member_pause_resume_requests') {
        return {
          select() {
            const query = {
              eq() {
                return query
              },
              order() {
                return query
              },
              limit() {
                return Promise.resolve({
                  data: [],
                  error: null,
                })
              },
            }

            return query
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

function createMemberRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'member-1',
    employee_no: '000611',
    name: 'Jane Doe',
    card_no: null,
    type: 'General',
    member_type_id: null,
    status: 'Active',
    gender: 'Female',
    email: 'jane@example.com',
    phone: '876-555-1212',
    remark: null,
    photo_url: null,
    joined_at: '2026-01-01',
    begin_time: '2026-01-01T00:00:00Z',
    end_time: '2026-06-30T23:59:59Z',
    updated_at: '2026-04-18T12:00:00Z',
    ...overrides,
  }
}

describe('member pause server helpers', () => {
  it('returns the active-pause error when the member status is already Paused', async () => {
    const client = createMemberPauseServerClient({
      memberRow: createMemberRow({
        status: 'Paused',
      }),
    })

    const result = await getMemberPauseEligibilityError(client as never, 'member-1')

    expect(result).toEqual({
      member: expect.objectContaining({
        id: 'member-1',
        status: 'Paused',
      }),
      error: MEMBER_PAUSE_ACTIVE_ERROR,
      status: 400,
    })
  })

  it('returns the active-pause error before inactive checks when an active pause exists', async () => {
    const client = createMemberPauseServerClient({
      memberRow: createMemberRow({
        status: 'Active',
        end_time: '2026-04-01T00:00:00Z',
      }),
      activePauseRow: {
        id: 'pause-1',
        member_id: 'member-1',
        pause_start_date: '2026-04-10',
        planned_resume_date: '2026-04-24',
        original_end_time: '2026-06-30T23:59:59Z',
        status: 'active',
      },
    })

    const result = await getMemberPauseEligibilityError(client as never, 'member-1')

    expect(result).toEqual({
      member: expect.objectContaining({
        id: 'member-1',
        status: 'Active',
      }),
      error: MEMBER_PAUSE_ACTIVE_ERROR,
      status: 400,
    })
  })
})
