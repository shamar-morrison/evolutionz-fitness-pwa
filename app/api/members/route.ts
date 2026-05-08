import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseDateInputValue } from '@/lib/member-access-time'
import { isMemberType, memberTypeRequiresCard } from '@/lib/member-type-utils'
import {
  createCardlessMemberAccess,
  provisionMemberAccess,
} from '@/lib/member-provisioning-server'
import { readMemberTypeById, type MemberTypesReadClient } from '@/lib/member-types-server'
import { readMemberWithCardCode, readMembersWithCardCodes, type MembersReadClient } from '@/lib/members'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export const MEMBER_JOIN_DATE_WARNING =
  'Member was created successfully, but the join date could not be fully saved. Please verify the member details manually.'

const createMemberSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.'),
    type: z.string().trim().min(1).optional(),
    member_type_id: z.string().trim().uuid('Membership type is required.'),
    gender: z.enum(['Male', 'Female']),
    email: z.string().trim().min(1, 'Email is required.').email('Email must be valid.'),
    phone: z.string().trim().min(1, 'Phone is required.'),
    remark: z.string().trim().min(1).optional(),
    beginTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Begin time must be valid.'),
    endTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'End time must be valid.'),
    cardNo: z.string().trim().min(1).nullable().optional(),
    cardCode: z.string().trim().min(1).nullable().optional(),
    joined_at: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be valid.')
      .refine((value) => Boolean(parseDateInputValue(value)), 'Join date must be valid.')
      .optional(),
  })
  .strict()

type MembersRouteClient = MembersReadClient & MemberTypesReadClient & {
  from(table: 'members'): {
    update(values: {
      joined_at: string | null
    }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): {
          maybeSingle(): PromiseLike<{
            data: { id: string } | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
  from(table: string): unknown
}

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient()
    const members = await readMembersWithCardCodes(supabase)

    return NextResponse.json({
      ok: true,
      members,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unexpected server error while loading members.',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createMemberSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MembersRouteClient
    const memberType = await readMemberTypeById(supabase, input.member_type_id)

    if (!memberType) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Membership type not found.',
        },
        { status: 404 },
      )
    }

    if (!isMemberType(memberType.name)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Membership type is not supported for member creation.',
        },
        { status: 400 },
      )
    }

    if (memberTypeRequiresCard(memberType) && (!input.cardNo?.trim() || !input.cardCode?.trim())) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Card number and card code are required for this membership type.',
        },
        { status: 400 },
      )
    }

    const result = memberTypeRequiresCard(memberType)
      ? await provisionMemberAccess({
          name: input.name,
          type: memberType.name,
          memberTypeId: memberType.id,
          gender: input.gender ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          remark: input.remark ?? null,
          beginTime: input.beginTime,
          endTime: input.endTime,
          cardNo: input.cardNo?.trim() ?? '',
          cardCode: input.cardCode?.trim() ?? '',
        })
      : await createCardlessMemberAccess({
          name: input.name,
          type: memberType.name,
          memberTypeId: memberType.id,
          gender: input.gender ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          remark: input.remark ?? null,
          beginTime: input.beginTime,
          endTime: input.endTime,
        })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: result.status },
      )
    }

    if (!input.joined_at) {
      return NextResponse.json({
        ok: true,
        member: result.member,
      })
    }

    const { error: joinedAtError } = await supabase
      .from('members')
      .update({
        joined_at: input.joined_at,
      })
      .eq('id', result.member.id)
      .select('id')
      .maybeSingle()

    if (joinedAtError) {
      console.error(
        `Failed to update joined_at for created member ${result.member.id}: ${joinedAtError.message}`,
      )

      return NextResponse.json({
        ok: true,
        member: result.member,
        warning: MEMBER_JOIN_DATE_WARNING,
      })
    }

    const member = await readMemberWithCardCode(supabase, result.member.id)

    if (!member) {
      return NextResponse.json({
        ok: true,
        member: result.member,
        warning: MEMBER_JOIN_DATE_WARNING,
      })
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
          error instanceof Error ? error.message : 'Unexpected server error while creating a member.',
      },
      { status: 500 },
    )
  }
}
