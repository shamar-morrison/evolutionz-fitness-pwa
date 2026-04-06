import { NextResponse } from 'next/server'
import {
  createAndWaitForAccessControlJob,
  type AccessControlJobsClient,
} from '@/lib/access-control-jobs'
import { MEMBER_EVENTS_PAGE_SIZE, normalizeBridgeMemberEvents } from '@/lib/member-events'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const MAX_WAIT_MS = 60_000
const TIMEOUT_ERROR = 'Fetch member events request timed out after 60 seconds.'
const MEMBER_EVENTS_JOB_MESSAGES = {
  createErrorPrefix: 'Failed to create get member events job',
  missingJobIdMessage: 'Failed to create get member events job: missing job id in response',
  readErrorPrefix: (jobId: string) => `Failed to read get member events job ${jobId}`,
  missingJobMessage: (jobId: string) =>
    `Get member events job ${jobId} was not found after creation.`,
  failedJobMessage: 'Get member events job failed.',
  timeoutMessage: TIMEOUT_ERROR,
}

function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (value === null) {
    return fallback
  }

  if (!/^\d+$/u.test(value)) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
    return null
  }

  return parsedValue
}

async function requestMemberEvents({
  employeeNo,
  maxResults,
  searchID,
  searchResultPosition,
  supabase,
}: {
  employeeNo: string
  maxResults: number
  searchID: string
  searchResultPosition: number
  supabase: AccessControlJobsClient
}) {
  return createAndWaitForAccessControlJob({
    jobType: 'get_member_events',
    payload: {
      employeeNoString: employeeNo,
      maxResults,
      searchID,
      searchResultPosition,
    },
    messages: MEMBER_EVENTS_JOB_MESSAGES,
    maxWaitMs: MAX_WAIT_MS,
    supabase,
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const page = parseNonNegativeInteger(searchParams.get('page'), 0)
    const limit = parseNonNegativeInteger(searchParams.get('limit'), MEMBER_EVENTS_PAGE_SIZE)

    if (page === null || limit === null) {
      return NextResponse.json(
        {
          error: 'page and limit must be non-negative integers.',
        },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdminClient()
    const accessControlClient = supabase as unknown as AccessControlJobsClient
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('employee_no')
      .eq('id', id)
      .maybeSingle()

    if (memberError) {
      throw new Error(`Failed to read member ${id}: ${memberError.message}`)
    }

    if (!member) {
      return NextResponse.json(
        {
          error: 'Member not found.',
        },
        { status: 404 },
      )
    }

    const employeeNo =
      typeof member.employee_no === 'string' ? member.employee_no.trim() : ''

    if (!employeeNo) {
      throw new Error(`Member ${id} is missing an employee number.`)
    }

    const searchID = Date.now().toString()

    const probeJob = await requestMemberEvents({
      employeeNo,
      maxResults: 1,
      searchID,
      searchResultPosition: 0,
      supabase: accessControlClient,
    })

    if (probeJob.status !== 'done') {
      return NextResponse.json(
        {
          jobId: probeJob.jobId,
          error: probeJob.error,
        },
        { status: probeJob.httpStatus },
      )
    }

    const totalMatches = normalizeBridgeMemberEvents(probeJob.result).totalMatches

    if (page * limit >= totalMatches) {
      return NextResponse.json({
        events: [],
        totalMatches,
      })
    }

    const searchResultPosition = Math.max(0, totalMatches - page * limit - limit)
    const maxResults = Math.min(limit, totalMatches - page * limit)
    const job = await requestMemberEvents({
      employeeNo,
      maxResults,
      searchID,
      searchResultPosition,
      supabase: accessControlClient,
    })

    if (job.status === 'done') {
      const normalizedResult = normalizeBridgeMemberEvents(job.result)

      return NextResponse.json({
        events: [...normalizedResult.events].reverse(),
        totalMatches,
      })
    }

    return NextResponse.json(
      {
        jobId: job.jobId,
        error: job.error,
      },
      { status: job.httpStatus },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while fetching member events.',
      },
      { status: 500 },
    )
  }
}
