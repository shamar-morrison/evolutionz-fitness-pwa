import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hydrateMemberPhotoUrl, type MemberPhotoStorageClient } from '@/lib/member-photo-storage'
import { MEMBER_RECORD_SELECT, readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reactivateMemberRequestSchema = z.object({
  status: z.literal('Active'),
})

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
