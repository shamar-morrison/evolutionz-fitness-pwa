import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_DURATION_LABEL_VALUES,
  normalizeTimeInputValue,
  parseDateInputValue,
} from '@/lib/member-access-time'
import {
  MEMBER_EDIT_REQUEST_SELECT,
  mapMemberEditRequestRecord,
  type MemberEditRequestRecord,
} from '@/lib/member-edit-request-records'
import {
  insertNotifications,
  readAdminNotificationRecipients,
} from '@/lib/pt-notifications-server'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToProfiles } from '@/lib/web-push'
import type { MemberGender } from '@/types'

const createMemberEditRequestSchema = z
  .object({
    member_id: z.string().trim().uuid('Member is required.'),
    proposed_name: z.string().trim().min(1, 'Name is required.').optional(),
    proposed_gender: z.enum(['Male', 'Female']).optional(),
    proposed_phone: z.string().trim().min(1, 'Phone is required.').optional(),
    proposed_email: z
      .string()
      .trim()
      .min(1, 'Email is required.')
      .email('Email must be valid.')
      .optional(),
    proposed_member_type_id: z.string().trim().uuid('Membership type must be valid.').optional(),
    proposed_join_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be valid.')
      .optional(),
    proposed_start_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be valid.')
      .optional(),
    proposed_start_time: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}:\d{2}$/, 'Start time must be valid.')
      .optional(),
    proposed_duration: z.enum(MEMBER_DURATION_LABEL_VALUES).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.proposed_join_date && !parseDateInputValue(value.proposed_join_date)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Join date must be valid.',
        path: ['proposed_join_date'],
      })
    }

    if (value.proposed_start_date && !parseDateInputValue(value.proposed_start_date)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date must be valid.',
        path: ['proposed_start_date'],
      })
    }

    if (value.proposed_start_time && !normalizeTimeInputValue(value.proposed_start_time)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start time must be valid.',
        path: ['proposed_start_time'],
      })
    }

    const hasChange =
      value.proposed_name !== undefined ||
      value.proposed_gender !== undefined ||
      value.proposed_phone !== undefined ||
      value.proposed_email !== undefined ||
      value.proposed_member_type_id !== undefined ||
      value.proposed_join_date !== undefined ||
      value.proposed_start_date !== undefined ||
      value.proposed_start_time !== undefined ||
      value.proposed_duration !== undefined

    if (!hasChange) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one proposed field is required.',
      })
    }
  })

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberEditRequestsRouteClient = {
  from(table: 'member_edit_requests'): {
    select(columns: string): {
      eq(column: 'status', value: 'pending'): {
        order(
          column: 'created_at',
          options: {
            ascending: boolean
          },
        ): QueryResult<MemberEditRequestRecord[]>
      }
    }
    insert(values: {
      member_id: string
      requested_by: string
      status: 'pending'
      proposed_name?: string
      proposed_gender?: MemberGender
      proposed_phone?: string
      proposed_email?: string
      proposed_member_type_id?: string
      proposed_join_date?: string
      proposed_start_date?: string
      proposed_start_time?: string
      proposed_duration?: string
    }): {
      select(columns: string): {
        single(): QueryResult<MemberEditRequestRecord>
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

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberEditRequestsRouteClient
    const { data, error } = await supabase
      .from('member_edit_requests')
      .select(MEMBER_EDIT_REQUEST_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to read member edit requests: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      requests: ((data ?? []) as MemberEditRequestRecord[]).map(mapMemberEditRequestRecord),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading member edit requests.',
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createMemberEditRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MemberEditRequestsRouteClient
    const { data, error } = await supabase
      .from('member_edit_requests')
      .insert({
        member_id: input.member_id,
        requested_by: authResult.user.id,
        status: 'pending',
        ...(input.proposed_name ? { proposed_name: input.proposed_name.trim() } : {}),
        ...(input.proposed_gender ? { proposed_gender: input.proposed_gender } : {}),
        ...(input.proposed_phone ? { proposed_phone: input.proposed_phone.trim() } : {}),
        ...(input.proposed_email ? { proposed_email: input.proposed_email.trim() } : {}),
        ...(input.proposed_member_type_id
          ? { proposed_member_type_id: input.proposed_member_type_id }
          : {}),
        ...(input.proposed_join_date ? { proposed_join_date: input.proposed_join_date } : {}),
        ...(input.proposed_start_date
          ? { proposed_start_date: input.proposed_start_date }
          : {}),
        ...(input.proposed_start_time
          ? { proposed_start_time: normalizeTimeInputValue(input.proposed_start_time) ?? input.proposed_start_time }
          : {}),
        ...(input.proposed_duration ? { proposed_duration: input.proposed_duration } : {}),
      })
      .select(MEMBER_EDIT_REQUEST_SELECT)
      .single()

    if (error) {
      throw new Error(`Failed to create member edit request: ${error.message}`)
    }

    const requestRecord = data as MemberEditRequestRecord
    try {
      const adminRecipients = await readAdminNotificationRecipients(supabase)
      const memberName = requestRecord.member?.name?.trim() || 'this member'
      const requestedBy = requestRecord.requestedByProfile?.name?.trim() || 'A staff member'

      await insertNotifications(
        supabase,
        adminRecipients.map((recipient) => ({
          recipientId: recipient.id,
          type: 'member_edit_request',
          title: 'Member Edit Request',
          body: `New member edit request from ${requestedBy}.`,
          metadata: {
            requestId: requestRecord.id,
            memberId: requestRecord.member_id,
            memberName,
            requestedBy,
          },
        })),
      )

      await sendPushToProfiles(
        adminRecipients.map((recipient) => recipient.id),
        {
          title: 'Edit Request',
          body: 'A staff member submitted a member edit request.',
          url: '/pending-approvals/edit-requests',
        },
      )
    } catch (notificationError) {
      console.error(
        'Failed to send member edit request notifications:',
        notificationError,
      )
    }

    return NextResponse.json({
      ok: true,
      request: mapMemberEditRequestRecord(requestRecord),
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
        : 'Unexpected server error while creating the member edit request.',
      500,
    )
  }
}
