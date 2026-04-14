import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAccessDateTimeValue } from '@/lib/member-access-time'
import {
  MEMBER_APPROVAL_REQUEST_SELECT,
  mapMemberApprovalRequestRecord,
  type MemberApprovalRequestRecord,
} from '@/lib/member-approval-request-records'
import {
  buildMemberPhotoPath,
  moveMemberPhotoObject,
  type MemberPhotoStorageClient,
} from '@/lib/member-photo-storage'
import { provisionMemberAccess } from '@/lib/member-provisioning-server'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { readMemberTypeById, type MemberTypesReadClient } from '@/lib/member-types-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberPaymentMethod, MemberType } from '@/types'

const APPROVE_MEMBER_REQUEST_WARNING =
  'Member was approved and provisioned successfully, but the request record could not be fully updated. Please verify the member details manually.'

const denyMemberApprovalRequestSchema = z
  .object({
    status: z.literal('denied'),
    review_note: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

const approveMemberApprovalRequestSchema = z
  .object({
    status: z.literal('approved'),
    selected_card_no: z.string().trim().min(1, 'Card number is required.'),
    member_type_id: z.string().trim().uuid('Membership type is required.'),
    payment_method: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
    amount_paid: z.number().finite().min(0),
    promotion: z.string().trim().min(1).nullable().optional(),
    payment_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format.'),
    notes: z.string().trim().min(1).nullable().optional(),
    review_note: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

const reviewMemberApprovalRequestSchema = z.union([
  approveMemberApprovalRequestSchema,
  denyMemberApprovalRequestSchema,
])

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberApprovalRequestReviewRow = MemberApprovalRequestRecord

type MemberApprovalRequestStatusUpdateValues = {
  status: 'approved' | 'denied'
  reviewed_by: string
  reviewed_at: string
  review_note: string | null
  updated_at: string
}

type MemberApprovalRequestFinalizeValues = {
  card_no: string
  card_code: string
  member_type_id: string
  member_id: string
  photo_url: string | null
  updated_at: string
}

type MemberApprovalRequestUpdateQuery = {
  eq(column: 'id', value: string): {
    eq(column: 'status', value: 'pending'): {
      select(columns: string): QueryResult<MemberApprovalRequestReviewRow[]>
    }
    select(columns: string): {
      maybeSingle(): QueryResult<MemberApprovalRequestReviewRow>
    }
  }
}

type MemberApprovalRequestReviewClient = MemberTypesReadClient &
  MemberPhotoStorageClient & {
  from(table: 'member_approval_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberApprovalRequestRecord>
      }
    }
    update(
      values: MemberApprovalRequestStatusUpdateValues | MemberApprovalRequestFinalizeValues,
    ): MemberApprovalRequestUpdateQuery
  }
  from(table: 'cards'): {
    select(columns: 'card_no, card_code'): {
      eq(column: 'card_no' | 'status', value: string): {
        eq(column: 'status', value: 'available'): {
          maybeSingle(): QueryResult<{
            card_no: string
            card_code: string | null
          }>
        }
      }
    }
  }
  from(table: 'member_payments'): {
    insert(values: {
      member_id: string
      member_type_id: string
      payment_method: MemberPaymentMethod
      amount_paid: number
      promotion: string | null
      recorded_by: string
      payment_date: string
      notes: string | null
    }): {
      select(columns: '*'): {
        maybeSingle(): QueryResult<{
          id: string
        }>
      }
    }
  }
  from(table: 'members'): {
    update(values: {
      photo_url: string
    }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): {
          maybeSingle(): QueryResult<{
            id: string
          }>
        }
      }
    }
  }
  from(table: string): unknown
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

async function archiveMemberCreateRequestNotifications(
  supabase: MemberApprovalRequestReviewClient,
  requestId: string,
  archivedAt: string,
) {
  try {
    await archiveResolvedRequestNotifications(supabase, {
      requestId,
      type: 'member_create_request',
      archivedAt,
    })
  } catch (archiveError) {
    console.error(
      'Failed to archive resolved member create request notifications:',
      archiveError,
    )
  }
}

async function moveRequestPhotoToMember(
  supabase: MemberApprovalRequestReviewClient,
  request: MemberApprovalRequestRecord,
  memberId: string,
) {
  if (!request.photo_url) {
    return null
  }

  const nextPhotoPath = buildMemberPhotoPath(memberId)
  const movedPath = await moveMemberPhotoObject(supabase, request.photo_url, nextPhotoPath)
  const { error } = await supabase
    .from('members')
    .update({ photo_url: movedPath })
    .eq('id', memberId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to update the approved member photo: ${error.message}`)
  }

  return movedPath
}

async function recordApprovalPayment(
  supabase: MemberApprovalRequestReviewClient,
  {
    memberId,
    memberTypeId,
    paymentMethod,
    amountPaid,
    promotion,
    recordedBy,
    paymentDate,
    notes,
  }: {
    memberId: string
    memberTypeId: string
    paymentMethod: MemberPaymentMethod
    amountPaid: number
    promotion: string | null
    recordedBy: string
    paymentDate: string
    notes: string | null
  },
) {
  const { error } = await supabase
    .from('member_payments')
    .insert({
      member_id: memberId,
      member_type_id: memberTypeId,
      payment_method: paymentMethod,
      amount_paid: amountPaid,
      promotion,
      recorded_by: recordedBy,
      payment_date: paymentDate,
      notes,
    })
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to record the approval payment: ${error.message}`)
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
    const input = reviewMemberApprovalRequestSchema.parse(requestBody)
    const reviewTimestamp = new Date().toISOString()
    const supabase = getSupabaseAdminClient() as unknown as MemberApprovalRequestReviewClient
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_approval_requests')
      .select(MEMBER_APPROVAL_REQUEST_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read member approval request ${id}: ${existingRequestError.message}`,
      )
    }

    if (!existingRequest) {
      return createErrorResponse('Member approval request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (input.status === 'denied') {
      const { data: deniedRequests, error } = await supabase
        .from('member_approval_requests')
        .update({
          status: 'denied',
          reviewed_by: authResult.profile.id,
          reviewed_at: reviewTimestamp,
          review_note: normalizeOptionalText(input.review_note),
          updated_at: reviewTimestamp,
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select(MEMBER_APPROVAL_REQUEST_SELECT)

      if (error) {
        throw new Error(`Failed to deny member approval request ${id}: ${error.message}`)
      }

      const deniedRequest = deniedRequests?.[0] ?? null

      if (!deniedRequest) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      await archiveMemberCreateRequestNotifications(supabase, deniedRequest.id, reviewTimestamp)

      return NextResponse.json({
        ok: true,
        request: mapMemberApprovalRequestRecord(deniedRequest),
      })
    }

    const memberType = await readMemberTypeById(supabase, input.member_type_id)

    if (!memberType) {
      return createErrorResponse('Membership type not found.', 404)
    }

    const { data: selectedCard, error: selectedCardError } = await supabase
      .from('cards')
      .select('card_no, card_code')
      .eq('card_no', input.selected_card_no)
      .eq('status', 'available')
      .maybeSingle()

    if (selectedCardError) {
      throw new Error(
        `Failed to read selected card ${input.selected_card_no}: ${selectedCardError.message}`,
      )
    }

    if (!selectedCard) {
      return createErrorResponse('Selected card is no longer available.', 400)
    }

    const beginTime = getAccessDateTimeValue(existingRequest.begin_time)
    const endTime = getAccessDateTimeValue(existingRequest.end_time)

    if (!beginTime || !endTime) {
      return createErrorResponse('The request access window is invalid.', 400)
    }

    const reviewNote = normalizeOptionalText(input.review_note)
    const cardCode =
      typeof selectedCard.card_code === 'string' && selectedCard.card_code.trim()
        ? selectedCard.card_code.trim()
        : existingRequest.card_code

    const { data: approvedClaims, error: approvedClaimError } = await supabase
      .from('member_approval_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        reviewed_at: reviewTimestamp,
        review_note: reviewNote,
        updated_at: reviewTimestamp,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(MEMBER_APPROVAL_REQUEST_SELECT)

    if (approvedClaimError) {
      throw new Error(
        `Failed to approve member approval request ${id}: ${approvedClaimError.message}`,
      )
    }

    if (!approvedClaims?.[0]) {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    const provisionResult = await provisionMemberAccess({
      name: existingRequest.name,
      type: memberType.name as MemberType,
      memberTypeId: memberType.id,
      gender: existingRequest.gender ?? null,
      email: normalizeOptionalText(existingRequest.email),
      phone: normalizeOptionalText(existingRequest.phone),
      remark: normalizeOptionalText(existingRequest.remark),
      beginTime,
      endTime,
      cardNo: selectedCard.card_no,
      cardCode,
    })

    if (!provisionResult.ok) {
      return createErrorResponse(provisionResult.error, provisionResult.status)
    }

    let approvedPhotoPath: string | null = null

    if (existingRequest.photo_url) {
      try {
        approvedPhotoPath = await moveRequestPhotoToMember(
          supabase,
          existingRequest,
          provisionResult.member.id,
        )
      } catch (photoError) {
        console.error('Failed to move the staged request photo to the approved member:', photoError)
      }
    }

    try {
      await recordApprovalPayment(supabase, {
        memberId: provisionResult.member.id,
        memberTypeId: memberType.id,
        paymentMethod: input.payment_method,
        amountPaid: input.amount_paid,
        promotion: normalizeOptionalText(input.promotion),
        recordedBy: authResult.profile.id,
        paymentDate: input.payment_date,
        notes: normalizeOptionalText(input.notes),
      })
    } catch (paymentError) {
      console.error('Failed to record member approval payment:', paymentError)
      throw paymentError
    }

    const { data: approvedRequest, error: approvedRequestError } = await supabase
      .from('member_approval_requests')
      .update({
        card_no: selectedCard.card_no,
        card_code: cardCode,
        member_type_id: memberType.id,
        member_id: provisionResult.member.id,
        photo_url: approvedPhotoPath ? null : existingRequest.photo_url,
        updated_at: reviewTimestamp,
      })
      .eq('id', id)
      .select(MEMBER_APPROVAL_REQUEST_SELECT)
      .maybeSingle()

    if (approvedRequestError) {
      console.error(
        `Failed to finalize approved member request ${id}: ${approvedRequestError.message}`,
      )
      await archiveMemberCreateRequestNotifications(supabase, id, reviewTimestamp)

      return NextResponse.json({
        ok: true,
        warning: APPROVE_MEMBER_REQUEST_WARNING,
      })
    }

    if (!approvedRequest) {
      console.error(`Failed to finalize approved member request ${id}: missing updated row`)
      await archiveMemberCreateRequestNotifications(supabase, id, reviewTimestamp)

      return NextResponse.json({
        ok: true,
        warning: APPROVE_MEMBER_REQUEST_WARNING,
      })
    }

    await archiveMemberCreateRequestNotifications(supabase, approvedRequest.id, reviewTimestamp)

    return NextResponse.json({
      ok: true,
      request: mapMemberApprovalRequestRecord(approvedRequest),
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
        : 'Unexpected server error while reviewing the member approval request.',
      500,
    )
  }
}
