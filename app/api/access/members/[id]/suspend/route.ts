import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
  type AccessControlJobOutcome,
} from '@/lib/access-control-jobs'
import { hasAssignedCard } from '@/lib/member-card'
import { MEMBER_RECORD_SELECT, readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const suspendMemberRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  cardNo: z.string().trim().min(1).nullable().optional(),
})

const REVOKE_CARD_TIMEOUT_ERROR = 'Revoke card request timed out after 10 seconds.'

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

async function revokeAssignedCard(
  employeeNo: string,
  cardNo: string,
  supabase: MembersReadClient,
): Promise<AccessControlJobOutcome> {
  return createAndWaitForAccessControlJob({
    jobType: 'revoke_card',
    payload: {
      employeeNo,
      cardNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create revoke card job',
      missingJobIdMessage: 'Failed to create revoke card job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read revoke card job ${jobId}`,
      missingJobMessage: (jobId) => `Revoke card job ${jobId} was not found after creation.`,
      failedJobMessage: 'Revoke card job failed.',
      timeoutMessage: REVOKE_CARD_TIMEOUT_ERROR,
    },
    supabase: supabase as unknown as AccessControlJobsClient,
  })
}

async function updateMemberStatus(
  supabase: MembersReadClient,
  id: string,
  status: 'Suspended',
) {
  const { data, error } = await (supabase.from('members') as unknown as {
    update(values: { status: 'Suspended' }): {
      eq(column: 'id', value: string): {
        select(columns: typeof MEMBER_RECORD_SELECT): {
          maybeSingle(): PromiseLike<{
            data: { id: string } | null
            error: { message: string } | null
          }>
        }
      }
    }
  })
    .update({ status })
    .eq('id', id)
    .select(MEMBER_RECORD_SELECT)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to update member ${id}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return data
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const requestBody = await request.json()
    const input = suspendMemberRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MembersReadClient

    // TODO: add admin role check once auth is fully wired up

    if (hasAssignedCard(input.cardNo)) {
      const revokeJob = await revokeAssignedCard(input.employeeNo, input.cardNo, supabase)

      if (revokeJob.status !== 'done') {
        return createErrorResponse(revokeJob.error, revokeJob.httpStatus)
      }
    }

    const updatedRecord = await updateMemberStatus(supabase, id, 'Suspended')

    if (!updatedRecord) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Member not found.',
        },
        { status: 404 },
      )
    }

    const member = await readMemberWithCardCode(supabase, id)

    if (!member) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Member not found.',
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      member,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid JSON body.',
        },
        { status: 400 },
      )
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      )
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while suspending a member.',
      500,
    )
  }
}
