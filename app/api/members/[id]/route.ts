import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildMemberPhotoPath,
  deleteMemberPhotoObject,
  hydrateMemberPhotoUrl,
  type MemberPhotoStorageClient,
} from '@/lib/member-photo-storage'
import {
  type AccessControlJobOutcome,
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import { MEMBER_RECORD_SELECT, readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reactivateMemberRequestSchema = z.object({
  status: z.literal('Active'),
})

const DELETE_MEMBER_SELECT = 'id, employee_no, card_no, photo_url'
const DELETE_USER_TIMEOUT_ERROR = 'Delete user request timed out after 10 seconds.'
const DELETE_MEMBER_DEVICE_WARNING =
  'The member was deleted, but the device user may need to be manually removed from iVMS.'

type QueryResult<
  T,
  TError extends {
    message: string
  } = {
    message: string
  },
> = PromiseLike<{
  data: T | null
  error: TError | null
}>

type CardCleanupError = {
  message: string
  code?: string | null
}

type DeleteMemberRow = {
  id: string
  employee_no: string | null
  card_no: string | null
  photo_url: string | null
}

type DeleteMemberAdminClient = MemberPhotoStorageClient &
  AccessControlJobsClient & {
    from(table: 'members'): {
      select(columns: typeof DELETE_MEMBER_SELECT): {
        eq(column: 'id', value: string): {
          maybeSingle(): QueryResult<DeleteMemberRow>
        }
      }
      delete(): {
        eq(column: 'id', value: string): {
          select(columns: 'id'): {
            maybeSingle(): QueryResult<{ id: string }>
          }
        }
      }
    }
    from(table: 'cards'): {
      update(values: {
        status: 'available'
        employee_no: null
        card_code: null
      }): {
        eq(column: 'card_no', value: string): {
          select(columns: 'card_no'): {
            maybeSingle(): QueryResult<{ card_no: string }, CardCleanupError>
          }
        }
      }
    }
    from(table: string): any
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

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

async function deleteUserFromDevice(
  employeeNo: string,
  supabase: AccessControlJobsClient,
): Promise<AccessControlJobOutcome> {
  return createAndWaitForAccessControlJob({
    jobType: 'delete_user',
    payload: {
      employeeNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create delete user job',
      missingJobIdMessage: 'Failed to create delete user job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read delete user job ${jobId}`,
      missingJobMessage: (jobId) => `Delete user job ${jobId} was not found after creation.`,
      failedJobMessage: 'Delete user job failed.',
      timeoutMessage: DELETE_USER_TIMEOUT_ERROR,
    },
    supabase,
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as unknown as MembersReadClient & MemberPhotoStorageClient
    const memberRecord = await readMemberWithCardCode(supabase, id)

    if (!memberRecord) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Member not found.',
        },
        { status: 404 },
      )
    }

    const member = await hydrateMemberPhotoUrl(supabase, memberRecord)

    return NextResponse.json({
      ok: true,
      member,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unexpected server error while loading member.',
      },
      { status: 500 },
    )
  }
}

export async function PATCH(
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
    const input = reactivateMemberRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MembersReadClient

    const { data, error } = await (supabase.from('members') as unknown as {
      update(values: { status: 'Active' }): {
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
      .update({
        status: input.status,
      })
      .eq('id', id)
      .select(MEMBER_RECORD_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update member ${id}: ${error.message}`)
    }

    if (!data) {
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

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while updating a member.',
      },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as unknown as DeleteMemberAdminClient
    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select(DELETE_MEMBER_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(`Failed to read member ${id}: ${existingMemberError.message}`)
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const employeeNo = normalizeText(existingMember.employee_no)
    const cardNo = normalizeText(existingMember.card_no)
    const hasAssignedCard = Boolean(cardNo)
    const hasPhoto = Boolean(normalizeText(existingMember.photo_url))

    if (hasAssignedCard && !employeeNo) {
      throw new Error(`Failed to delete member ${id}: missing employee number.`)
    }

    if (hasAssignedCard) {
      const { error: clearedCardError } = await supabase
        .from('cards')
        .update({
          status: 'available',
          employee_no: null,
          card_code: null,
        })
        .eq('card_no', cardNo)
        .select('card_no')
        .maybeSingle()

      if (clearedCardError) {
        if (clearedCardError.code !== 'PGRST116') {
          throw new Error(`Failed to clear card ${cardNo}: ${clearedCardError.message}`)
        }
      }
    }

    if (hasPhoto) {
      await deleteMemberPhotoObject(supabase, buildMemberPhotoPath(id))
    }

    const { data: ptSessionRows, error: ptSessionRowsError } = await supabase
      .from('pt_sessions')
      .select('id')
      .eq('member_id', id)

    if (ptSessionRowsError) {
      throw new Error(`Failed to read PT sessions for member ${id}: ${ptSessionRowsError.message}`)
    }

    const ptSessionIds = Array.isArray(ptSessionRows)
      ? ptSessionRows
          .map((row) => row?.id)
          .filter((sessionId): sessionId is string => typeof sessionId === 'string')
      : []

    if (ptSessionIds.length > 0) {
      const { error: ptSessionChangesError } = await supabase
        .from('pt_session_changes')
        .delete()
        .in('session_id', ptSessionIds)

      if (ptSessionChangesError) {
        throw new Error(
          `Failed to delete PT session changes for member ${id}: ${ptSessionChangesError.message}`,
        )
      }

      const { error: ptRescheduleRequestsError } = await supabase
        .from('pt_reschedule_requests')
        .delete()
        .in('session_id', ptSessionIds)

      if (ptRescheduleRequestsError) {
        throw new Error(
          `Failed to delete PT reschedule requests for member ${id}: ${ptRescheduleRequestsError.message}`,
        )
      }

      const { error: ptSessionUpdateRequestsError } = await supabase
        .from('pt_session_update_requests')
        .delete()
        .in('session_id', ptSessionIds)

      if (ptSessionUpdateRequestsError) {
        throw new Error(
          `Failed to delete PT session update requests for member ${id}: ${ptSessionUpdateRequestsError.message}`,
        )
      }
    }

    const { error: ptSessionsDeleteError } = await supabase.from('pt_sessions').delete().eq('member_id', id)

    if (ptSessionsDeleteError) {
      throw new Error(`Failed to delete PT sessions for member ${id}: ${ptSessionsDeleteError.message}`)
    }

    const { data: trainerClientRows, error: trainerClientRowsError } = await supabase
      .from('trainer_clients')
      .select('id')
      .eq('member_id', id)

    if (trainerClientRowsError) {
      throw new Error(
        `Failed to read PT trainer assignments for member ${id}: ${trainerClientRowsError.message}`,
      )
    }

    const trainerClientIds = Array.isArray(trainerClientRows)
      ? trainerClientRows
          .map((row) => row?.id)
          .filter((assignmentId): assignmentId is string => typeof assignmentId === 'string')
      : []

    if (trainerClientIds.length > 0) {
      const { error: trainingPlanDaysError } = await supabase
        .from('training_plan_days')
        .delete()
        .in('assignment_id', trainerClientIds)

      if (trainingPlanDaysError) {
        throw new Error(
          `Failed to delete PT training plan days for member ${id}: ${trainingPlanDaysError.message}`,
        )
      }
    }

    const { error: trainerClientsDeleteError } = await supabase
      .from('trainer_clients')
      .delete()
      .eq('member_id', id)

    if (trainerClientsDeleteError) {
      throw new Error(
        `Failed to delete PT trainer assignments for member ${id}: ${trainerClientsDeleteError.message}`,
      )
    }

    const { data: deletedMember, error: deletedMemberError } = await supabase
      .from('members')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (deletedMemberError) {
      throw new Error(`Failed to delete member ${id}: ${deletedMemberError.message}`)
    }

    if (!deletedMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (hasAssignedCard) {
      try {
        const deleteUserJob = await deleteUserFromDevice(
          employeeNo,
          supabase as unknown as AccessControlJobsClient,
        )

        if (deleteUserJob.status !== 'done') {
          console.error('Failed to delete device user after deleting member:', {
            memberId: id,
            employeeNo,
            cardNo,
            jobId: deleteUserJob.jobId,
            status: deleteUserJob.status,
            error: deleteUserJob.error,
          })

          return NextResponse.json({
            ok: true,
            warning: DELETE_MEMBER_DEVICE_WARNING,
          })
        }
      } catch (error) {
        console.error('Failed to delete device user after deleting member:', {
          memberId: id,
          employeeNo,
          cardNo,
          error: error instanceof Error ? error.message : error,
        })

        return NextResponse.json({
          ok: true,
          warning: DELETE_MEMBER_DEVICE_WARNING,
        })
      }
    }

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting a member.',
      500,
    )
  }
}
