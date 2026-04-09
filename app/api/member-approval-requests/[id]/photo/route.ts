import { NextResponse } from 'next/server'
import {
  buildPendingMemberRequestPhotoPath,
  deleteMemberPhotoObject,
  uploadMemberPhotoAtPath,
  type MemberPhotoStorageClient,
} from '@/lib/member-photo-storage'
import {
  MEMBER_APPROVAL_REQUEST_SELECT,
  mapMemberApprovalRequestRecord,
  type MemberApprovalRequestRecord,
} from '@/lib/member-approval-request-records'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberApprovalRequestPhotoMutationClient = MemberPhotoStorageClient & {
  from(table: 'member_approval_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<{
          id: string
          submitted_by: string
          status: 'pending' | 'approved' | 'denied'
          photo_url: string | null
        }>
      }
    }
    update(values: {
      photo_url: string | null
      updated_at: string
    }): {
      eq(column: 'id', value: string): {
        select(columns: string): {
          maybeSingle(): QueryResult<MemberApprovalRequestRecord>
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const formData = await request.formData()
    const photo = formData.get('photo')

    if (!(photo instanceof File) || photo.size === 0) {
      return createErrorResponse('Photo file is required.', 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberApprovalRequestPhotoMutationClient
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_approval_requests')
      .select('id, submitted_by, status, photo_url')
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

    if (
      authResult.profile.role !== 'admin' &&
      existingRequest.submitted_by !== authResult.profile.id
    ) {
      return createErrorResponse('Forbidden', 403)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('Only pending requests can be updated.', 400)
    }

    const nextPhotoPath = buildPendingMemberRequestPhotoPath(id)
    await uploadMemberPhotoAtPath(supabase, nextPhotoPath, await photo.arrayBuffer())

    if (existingRequest.photo_url && existingRequest.photo_url !== nextPhotoPath) {
      try {
        await deleteMemberPhotoObject(supabase, existingRequest.photo_url)
      } catch (cleanupError) {
        console.error('Failed to clean up the previous request photo:', cleanupError)
      }
    }

    const { data, error } = await supabase
      .from('member_approval_requests')
      .update({
        photo_url: nextPhotoPath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(MEMBER_APPROVAL_REQUEST_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update member approval request ${id}: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Member approval request not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      request: mapMemberApprovalRequestRecord(data as MemberApprovalRequestRecord),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while uploading the request photo.',
      500,
    )
  }
}
