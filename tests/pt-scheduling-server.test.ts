import { describe, expect, it } from 'vitest'
import { readPtSessionChanges } from '@/lib/pt-scheduling-server'

type QueryResult<T> = {
  data: T
  error: null
}

type PtSessionChangeRow = {
  id: string
  session_id: string
  changed_by: string
  change_type: 'reschedule' | 'cancellation' | 'status_change'
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

function createPtSessionChangesClient(rows: PtSessionChangeRow[]) {
  const profileIds: string[][] = []

  return {
    profileIds,
    client: {
      storage: {
        from(bucket: string): never {
          throw new Error(`Unexpected storage access for ${bucket}`)
        },
      },
      from(table: string) {
        if (table === 'pt_session_changes') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, session_id, changed_by, change_type, old_value, new_value, created_at')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('session_id')
                  expect(value).toBe('session-1')

                  return {
                    order(orderColumn: string, { ascending }: { ascending: boolean }) {
                      expect(orderColumn).toBe('created_at')
                      expect(ascending).toBe(false)

                      return Promise.resolve({
                        data: rows,
                        error: null,
                      } satisfies QueryResult<PtSessionChangeRow[]>)
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'profiles') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, name, titles')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('id')
                  profileIds.push(values)

                  return Promise.resolve({
                    data: values.map((id) => ({
                      id,
                      name: `User ${id}`,
                      titles: [],
                    })),
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    },
  }
}

describe('PT scheduling server helpers', () => {
  it('filters no-op reschedule history while preserving status changes and real reschedules', async () => {
    const { client, profileIds } = createPtSessionChangesClient([
      {
        id: 'change-noop-reschedule',
        session_id: 'session-1',
        changed_by: 'skipped-user',
        change_type: 'reschedule',
        old_value: {
          scheduledAt: '2026-04-06T07:00:00-05:00',
        },
        new_value: {
          scheduledAt: '2026-04-06T12:00:00.000Z',
        },
        created_at: '2026-04-06T13:00:00.000Z',
      },
      {
        id: 'change-status',
        session_id: 'session-1',
        changed_by: 'admin-1',
        change_type: 'status_change',
        old_value: {
          status: 'scheduled',
        },
        new_value: {
          status: 'completed',
        },
        created_at: '2026-04-06T13:01:00.000Z',
      },
      {
        id: 'change-real-reschedule',
        session_id: 'session-1',
        changed_by: 'admin-2',
        change_type: 'reschedule',
        old_value: {
          scheduledAt: '2026-04-06T07:00:00-05:00',
        },
        new_value: {
          scheduledAt: '2026-04-07T07:00:00-05:00',
        },
        created_at: '2026-04-06T13:02:00.000Z',
      },
    ])

    const changes = await readPtSessionChanges(client, 'session-1')

    expect(changes.map((change) => change.id)).toEqual([
      'change-status',
      'change-real-reschedule',
    ])
    expect(changes.map((change) => change.changeType)).toEqual([
      'status_change',
      'reschedule',
    ])
    expect(profileIds).toEqual([['admin-1', 'admin-2']])
  })
})
