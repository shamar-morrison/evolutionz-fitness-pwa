import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import { buildAddCardPayload } from '@/lib/member-job'
import { resolveMembershipLifecycleStatus } from '@/lib/member-status'
import { MEMBER_RECORD_SELECT, readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const recoverCardRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
})

const RECOVER_CARD_TIMEOUT_ERROR = 'Issue card request timed out after 10 seconds.'

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
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = recoverCardRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MembersReadClient & AccessControlJobsClient

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

    if (currentMember.cardStatus === 'disabled') {
      return createErrorResponse('Disabled cards cannot be recovered.', 400)
    }

    if (currentMember.cardStatus !== 'suspended_lost') {
      return createErrorResponse('Only suspended lost cards can be recovered.', 400)
    }

    if (currentMember.status !== 'Paused') {
      const addCardJob = await createAndWaitForAccessControlJob({
        jobType: 'add_card',
        payload: buildAddCardPayload({
          employeeNo: input.employeeNo,
          cardNo: input.cardNo,
        }),
        messages: {
          createErrorPrefix: 'Failed to create add card job',
          missingJobIdMessage: 'Failed to create add card job: missing job id in response',
          readErrorPrefix: (jobId) => `Failed to read add card job ${jobId}`,
          missingJobMessage: (jobId) => `Add card job ${jobId} was not found after creation.`,
          failedJobMessage: 'Add card job failed.',
          timeoutMessage: RECOVER_CARD_TIMEOUT_ERROR,
        },
        supabase,
      })

      if (addCardJob.status !== 'done') {
        return createErrorResponse(addCardJob.error, addCardJob.httpStatus)
      }
    }

    const { data: updatedCard, error: cardError } = await supabase
      .from('cards')
      .update({
        status: 'assigned',
        lost_at: null,
      })
      .eq('card_no', input.cardNo)
      .eq('employee_no', input.employeeNo)
      .eq('status', 'suspended_lost')
      .select('card_no')
      .maybeSingle()

    if (cardError) {
      throw new Error(`Failed to update card ${input.cardNo}: ${cardError.message}`)
    }

    if (!updatedCard) {
      return createErrorResponse('Only suspended lost cards can be recovered.', 400)
    }

    const restoredStatus =
      currentMember.status === 'Paused'
        ? 'Paused'
        : resolveMembershipLifecycleStatus(currentMember.endTime)

    const { data: updatedMember, error: memberError } = await supabase
      .from('members')
      .update({
        status: restoredStatus,
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
        : 'Unexpected server error while recovering a card.',
      500,
    )
  }
}
