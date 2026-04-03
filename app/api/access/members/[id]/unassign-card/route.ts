import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
  type AccessControlJobOutcome,
} from '@/lib/access-control-jobs'
import { readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const unassignMemberCardRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  cardNo: z
    .string({ required_error: 'Card number is required.' })
    .trim()
    .min(1, 'Card number is required.'),
})

const REVOKE_CARD_TIMEOUT_ERROR = 'Revoke card request timed out after 10 seconds.'

type RpcError = {
  message: string
}

type RpcResult<T> = PromiseLike<{
  data: T | null
  error: RpcError | null
}>

type UnassignCardAdminClient = MembersReadClient & {
  rpc(
    fn: 'unassign_member_card',
    args: {
      p_member_id: string
      p_employee_no: string
      p_card_no: string
    },
  ): RpcResult<null>
}

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
  supabase: UnassignCardAdminClient,
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = unassignMemberCardRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as UnassignCardAdminClient

    const currentMember = await readMemberWithCardCode(supabase, id)

    if (!currentMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (currentMember.employeeNo !== input.employeeNo) {
      return createErrorResponse('Employee number does not match this member.', 400)
    }

    if (currentMember.cardNo !== input.cardNo) {
      return createErrorResponse('This member does not currently have that card assigned.', 400)
    }

    if (currentMember.cardStatus !== 'assigned') {
      return createErrorResponse('Only assigned cards can be unassigned.', 400)
    }

    const revokeJob = await revokeAssignedCard(input.employeeNo, input.cardNo, supabase)

    if (revokeJob.status !== 'done') {
      return createErrorResponse(revokeJob.error, revokeJob.httpStatus)
    }

    const { error } = await supabase.rpc('unassign_member_card', {
      p_member_id: id,
      p_employee_no: input.employeeNo,
      p_card_no: input.cardNo,
    })

    if (error) {
      throw new Error(`Failed to unassign card ${input.cardNo}: ${error.message}`)
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
        : 'Unexpected server error while unassigning a card.',
      500,
    )
  }
}
