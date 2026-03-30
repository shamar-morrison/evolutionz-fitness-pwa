import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_MAX_WAIT_MS = 10_000

export type AccessControlJobStatus = 'pending' | 'processing' | 'done' | 'failed'

type AccessControlJob = {
  id: string
  status: AccessControlJobStatus
  result: unknown
  error: string | null
}

type AccessControlQueryError = {
  message: string
}

type AccessControlQueryResult<T> = PromiseLike<{
  data: T | null
  error: AccessControlQueryError | null
}>

export type AccessControlJobsClient = {
  from(table: 'access_control_jobs'): {
    insert(values: { type: string; payload: unknown }): {
      select(columns: 'id'): {
        single(): AccessControlQueryResult<{ id: string }>
      }
    }
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): AccessControlQueryResult<AccessControlJob>
      }
    }
  }
}

type AccessControlJobMessages = {
  createErrorPrefix: string
  missingJobIdMessage: string
  readErrorPrefix: (jobId: string) => string
  missingJobMessage: (jobId: string) => string
  failedJobMessage: string
  timeoutMessage: string
}

type CreateAndWaitOptions = {
  jobType: string
  payload: unknown
  messages: AccessControlJobMessages
  pollIntervalMs?: number
  maxWaitMs?: number
  supabase?: AccessControlJobsClient
}

export type AccessControlJobOutcome =
  | {
      status: 'done'
      jobId: string
      result: unknown
    }
  | {
      status: 'failed' | 'timeout'
      jobId: string
      error: string
      httpStatus: 502 | 504
    }

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForAccessControlJob(
  jobId: string,
  {
    messages,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    supabase,
  }: Omit<CreateAndWaitOptions, 'jobType' | 'payload'>,
): Promise<AccessControlJobOutcome> {
  const supabaseClient =
    supabase ?? (getSupabaseAdminClient() as unknown as AccessControlJobsClient)
  const deadline = Date.now() + maxWaitMs

  while (Date.now() <= deadline) {
    const { data: job, error } = await supabaseClient
      .from('access_control_jobs')
      .select('id, status, result, error')
      .eq('id', jobId)
      .maybeSingle()

    if (error) {
      throw new Error(`${messages.readErrorPrefix(jobId)}: ${error.message}`)
    }

    if (!job) {
      throw new Error(messages.missingJobMessage(jobId))
    }

    if (job.status === 'done') {
      return {
        status: 'done',
        jobId,
        result: job.result,
      }
    }

    if (job.status === 'failed') {
      return {
        status: 'failed',
        jobId,
        error: job.error ?? messages.failedJobMessage,
        httpStatus: 502,
      }
    }

    await sleep(pollIntervalMs)
  }

  return {
    status: 'timeout',
    jobId,
    error: messages.timeoutMessage,
    httpStatus: 504,
  }
}

export async function createAndWaitForAccessControlJob({
  jobType,
  payload,
  messages,
  pollIntervalMs,
  maxWaitMs,
  supabase,
}: CreateAndWaitOptions): Promise<AccessControlJobOutcome> {
  const supabaseClient =
    supabase ?? (getSupabaseAdminClient() as unknown as AccessControlJobsClient)

  const { data: job, error } = await supabaseClient
    .from('access_control_jobs')
    .insert({
      type: jobType,
      payload,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`${messages.createErrorPrefix}: ${error.message}`)
  }

  if (!job) {
    throw new Error(messages.missingJobIdMessage)
  }

  return waitForAccessControlJob(job.id, {
    messages,
    pollIntervalMs,
    maxWaitMs,
    supabase: supabaseClient,
  })
}
