import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_APPROVAL_REQUEST_SELECT,
  mapMemberApprovalRequestRecord,
  type MemberApprovalRequestRecord,
} from '@/lib/member-approval-request-records'
import { formatDateInputValue, parseLocalDateTime } from '@/lib/member-access-time'
import { readMemberTypeById, type MemberTypesReadClient } from '@/lib/member-types-server'
import { requireAdminUser, requireAuthenticatedProfile } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberGender } from '@/types'

const createMemberApprovalRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.'),
    member_type_id: z.string().trim().uuid('Membership type is required.'),
    gender: z.enum(['Male', 'Female']),
    email: z.string().trim().min(1, 'Email is required.').email('Email must be valid.'),
    phone: z.string().trim().min(1, 'Phone is required.'),
    remark: z.string().trim().min(1).nullable().optional(),
    beginTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Begin time must be valid.'),
    endTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'End time must be valid.'),
    cardNo: z.string().trim().min(1, 'Card number is required.'),
    cardCode: z.string().trim().min(1, 'Card code is required.'),
  })
  .strict()

const statusSchema = z.enum(['pending', 'approved', 'denied'])

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberApprovalRequestRouteClient = MemberTypesReadClient & {
    from(table: 'member_approval_requests'): {
      select(columns: string): {
        eq(column: 'status', value: string): {
          order(
            column: 'created_at',
            options: {
              ascending: boolean
            },
          ): QueryResult<MemberApprovalRequestRecord[]>
        }
      }
      insert(values: {
        name: string
        member_type_id: string
        gender: MemberGender | null
        email: string | null
        phone: string | null
        remark: string | null
        begin_time: string
        end_time: string
        card_no: string
        card_code: string
        submitted_by: string
      }): {
        select(columns: string): {
          single(): QueryResult<MemberApprovalRequestRecord>
        }
      }
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

function validateAccessWindow(beginTime: string, endTime: string) {
  const parsedBeginTime = parseLocalDateTime(beginTime)

  if (!parsedBeginTime) {
    return 'Begin time must be a valid YYYY-MM-DDTHH:mm:ss datetime.'
  }

  const parsedEndTime = parseLocalDateTime(endTime)

  if (!parsedEndTime) {
    return 'End time must be a valid YYYY-MM-DDTHH:mm:ss datetime.'
  }

  if (beginTime.slice(0, 10) < formatDateInputValue(new Date())) {
    return 'Begin time date must be today or later.'
  }

  if (parsedEndTime.getTime() <= parsedBeginTime.getTime()) {
    return 'End time must be after begin time.'
  }

  return null
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const status = statusSchema.parse(searchParams.get('status') ?? 'pending')
    const supabase = getSupabaseAdminClient() as unknown as MemberApprovalRequestRouteClient
    const { data, error } = await supabase
      .from('member_approval_requests')
      .select(MEMBER_APPROVAL_REQUEST_SELECT)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to read member approval requests: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      requests: ((data ?? []) as MemberApprovalRequestRecord[]).map(mapMemberApprovalRequestRecord),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse('status must be pending, approved, or denied.', 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading member approval requests.',
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createMemberApprovalRequestSchema.parse(requestBody)
    const validationError = validateAccessWindow(input.beginTime, input.endTime)

    if (validationError) {
      return createErrorResponse(validationError, 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberApprovalRequestRouteClient
    const memberType = await readMemberTypeById(supabase, input.member_type_id)

    if (!memberType) {
      return createErrorResponse('Membership type not found.', 404)
    }

    const { data: selectedCard, error: selectedCardError } = await supabase
      .from('cards')
      .select('card_no, card_code')
      .eq('card_no', input.cardNo.trim())
      .eq('status', 'available')
      .maybeSingle()

    if (selectedCardError) {
      throw new Error(`Failed to read selected card ${input.cardNo}: ${selectedCardError.message}`)
    }

    if (!selectedCard) {
      return createErrorResponse('Selected card is no longer available.', 400)
    }

    const normalizedCardCode =
      typeof selectedCard.card_code === 'string' && selectedCard.card_code.trim()
        ? selectedCard.card_code.trim()
        : input.cardCode.trim()

    if (!normalizedCardCode) {
      return createErrorResponse('Selected card is missing its synced card code.', 400)
    }

    const { data, error } = await supabase
      .from('member_approval_requests')
      .insert({
        name: input.name.trim(),
        member_type_id: memberType.id,
        gender: input.gender ?? null,
        email: normalizeOptionalText(input.email),
        phone: normalizeOptionalText(input.phone),
        remark: normalizeOptionalText(input.remark),
        begin_time: input.beginTime,
        end_time: input.endTime,
        card_no: input.cardNo.trim(),
        card_code: normalizedCardCode,
        submitted_by: authResult.profile.id,
      })
      .select(MEMBER_APPROVAL_REQUEST_SELECT)
      .single()

    if (error) {
      throw new Error(`Failed to create member approval request: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      request: mapMemberApprovalRequestRecord(data as MemberApprovalRequestRecord),
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
        : 'Unexpected server error while creating the member approval request.',
      500,
    )
  }
}
