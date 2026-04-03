import { NextResponse } from 'next/server'
import {
  deleteMemberPhotoObject,
  hydrateMemberPhotoUrl,
  uploadMemberPhotoObject,
  type MemberPhotoStorageClient,
} from '@/lib/member-photo-storage'
import {
  MEMBER_RECORD_SELECT,
  readMemberWithCardCode,
  type MembersReadClient,
} from '@/lib/members'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberPhotoMutationClient = MembersReadClient &
  MemberPhotoStorageClient & {
    from(table: 'members'): {
      update(values: {
        photo_url: string | null
      }): {
        eq(column: string, value: string): {
          select(columns: string): {
            maybeSingle(): QueryResult<{ id: string }>
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

async function readHydratedMember(
  supabase: MemberPhotoMutationClient,
  id: string,
) {
  const member = await readMemberWithCardCode(supabase, id)

  if (!member) {
    return null
  }

  return hydrateMemberPhotoUrl(supabase, member)
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
    const formData = await request.formData()
    const photo = formData.get('photo')

    if (!(photo instanceof File) || photo.size === 0) {
      return createErrorResponse('Photo file is required.', 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberPhotoMutationClient
    const existingMember = await readMemberWithCardCode(supabase, id)

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const photoPath = await uploadMemberPhotoObject(supabase, id, await photo.arrayBuffer())
    const { data, error } = await supabase
      .from('members')
      .update({ photo_url: photoPath })
      .eq('id', id)
      .select(MEMBER_RECORD_SELECT)
      .maybeSingle()

    if (error) {
      try {
        await deleteMemberPhotoObject(supabase, photoPath)
      } catch (cleanupError) {
        console.error('Failed to clean up member photo after database update failure:', cleanupError)
      }

      throw new Error(`Failed to update member ${id}: ${error.message}`)
    }

    if (!data) {
      try {
        await deleteMemberPhotoObject(supabase, photoPath)
      } catch (cleanupError) {
        console.error('Failed to clean up member photo after missing member row:', cleanupError)
      }

      return createErrorResponse('Member not found.', 404)
    }

    const member = await readHydratedMember(supabase, id)

    if (!member) {
      return createErrorResponse('Member not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      member,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while uploading the member photo.',
      500,
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
    const supabase = getSupabaseAdminClient() as unknown as MemberPhotoMutationClient
    const existingMember = await readMemberWithCardCode(supabase, id)

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (!existingMember.photoUrl) {
      return createErrorResponse('Member photo not found.', 400)
    }

    await deleteMemberPhotoObject(supabase, existingMember.photoUrl)

    const { data, error } = await supabase
      .from('members')
      .update({ photo_url: null })
      .eq('id', id)
      .select(MEMBER_RECORD_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update member ${id}: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Member not found.', 404)
    }

    const member = await readHydratedMember(supabase, id)

    if (!member) {
      return createErrorResponse('Member not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      member,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting the member photo.',
      500,
    )
  }
}
