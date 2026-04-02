import { NextResponse } from 'next/server'
import {
  createAndWaitForAccessControlJob,
  type AccessControlJobsClient,
} from '@/lib/access-control-jobs'
import { MEMBER_EVENTS_PAGE_SIZE, normalizeBridgeMemberEvents } from '@/lib/member-events'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const MAX_WAIT_MS = 60_000
const TIMEOUT_ERROR = 'Fetch member events request timed out after 60 seconds.'

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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

    // TODO: add admin role check once auth is fully wired up
    const job = await createAndWaitForAccessControlJob({
      jobType: 'get_member_events',
      payload: {
        employeeNoString: employeeNo,
        maxResults: limit,
        searchResultPosition: page * limit,
      },
      messages: {
        createErrorPrefix: 'Failed to create get member events job',
        missingJobIdMessage: 'Failed to create get member events job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read get member events job ${jobId}`,
        missingJobMessage: (jobId) =>
          `Get member events job ${jobId} was not found after creation.`,
        failedJobMessage: 'Get member events job failed.',
        timeoutMessage: TIMEOUT_ERROR,
      },
      maxWaitMs: MAX_WAIT_MS,
      supabase: accessControlClient,
    })

    if (job.status === 'done') {
      return NextResponse.json(normalizeBridgeMemberEvents(job.result))
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
