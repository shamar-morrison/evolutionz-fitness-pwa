import type {
  AccessControlJobsClient,
  AccessControlJobStatus,
} from '@/lib/access-control-jobs'

type QueryError = {
  message: string
}

type QueryResult<T> = {
  data: T | null
  error: QueryError | null
}

type JobRecord = {
  id: string
  status: AccessControlJobStatus
  result: unknown
  error: string | null
}

type CreateFakeAccessControlClientOptions = {
  insertResult?: QueryResult<{ id: string }>
  pollResults?: QueryResult<JobRecord>[]
}

export function createFakeAccessControlClient({
  insertResult = {
    data: { id: 'job-123' },
    error: null,
  },
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
  ],
}: CreateFakeAccessControlClientOptions = {}) {
  const insertedJobs: Array<{ type: string; payload: unknown }> = []
  let pollIndex = 0

  const client: AccessControlJobsClient = {
    from(table) {
      if (table !== 'access_control_jobs') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        insert(values) {
          insertedJobs.push(values)

          return {
            select() {
              return {
                single: () => Promise.resolve(insertResult),
              }
            },
          }
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => {
                  const result =
                    pollResults[Math.min(pollIndex, pollResults.length - 1)] ?? null

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
    },
  }

  return {
    client,
    insertedJobs,
  }
}
