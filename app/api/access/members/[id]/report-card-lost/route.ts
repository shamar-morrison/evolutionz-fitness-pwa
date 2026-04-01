import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import { MEMBER_RECORD_SELECT, readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reportCardLostRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const requestBody = await request.json()
    const input = reportCardLostRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MembersReadClient & AccessControlJobsClient

    // TODO: add admin role check once auth is fully wired up

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
      return createErrorResponse('Only assigned cards can be reported lost.', 400)
    }

    const revokeJob = await createAndWaitForAccessControlJob({
      jobType: 'revoke_card',
      payload: {
        employeeNo: input.employeeNo,
        cardNo: input.cardNo,
      },
      messages: {
        createErrorPrefix: 'Failed to create revoke card job',
        missingJobIdMessage: 'Failed to create revoke card job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read revoke card job ${jobId}`,
        missingJobMessage: (jobId) => `Revoke card job ${jobId} was not found after creation.`,
        failedJobMessage: 'Revoke card job failed.',
        timeoutMessage: REVOKE_CARD_TIMEOUT_ERROR,
      },
      supabase,
    })

    if (revokeJob.status !== 'done') {
      return createErrorResponse(revokeJob.error, revokeJob.httpStatus)
    }

    const lostAt = new Date().toISOString()
    const { data: updatedCard, error: cardError } = await supabase
      .from('cards')
      .update({
        status: 'suspended_lost',
        lost_at: lostAt,
      })
      .eq('card_no', input.cardNo)
      .eq('employee_no', input.employeeNo)
      .eq('status', 'assigned')
      .select('card_no')
      .maybeSingle()

    if (cardError) {
      throw new Error(`Failed to update card ${input.cardNo}: ${cardError.message}`)
    }

    if (!updatedCard) {
      return createErrorResponse('Only assigned cards can be reported lost.', 400)
    }

    const { data: updatedMember, error: memberError } = await supabase
      .from('members')
      .update({
        status: 'Suspended',
      })
      .eq('id', id)
      .eq('employee_no', input.employeeNo)
      .select(MEMBER_RECORD_SELECT)
      .maybeSingle()

    if (memberError) {
      throw new Error(`Failed to update member ${id}: ${memberError.message}`)
    }

    if (!updatedMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const member = await readMemberWithCardCode(supabase, id)

    if (!member) {
      return createErrorResponse('Member not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      member,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while reporting a lost card.',
      500,
    )
  }
}
