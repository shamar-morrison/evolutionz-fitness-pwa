import { NextResponse } from 'next/server'
import { readStaffProfile, type StaffReadClient } from '@/lib/staff'
import {
  deleteStaffPhotoObject,
  uploadStaffPhotoObject,
  type StaffPhotoStorageClient,
} from '@/lib/staff-photo-storage'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type StaffPhotoMutationClient = StaffReadClient &
  StaffPhotoStorageClient & {
    from(table: 'profiles'): {
      update(values: {
        photo_url: string | null
      }): {
        eq(column: 'id', value: string): {
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

    const supabase = getSupabaseAdminClient() as unknown as StaffPhotoMutationClient
    const existingProfile = await readStaffProfile(supabase, id)

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const photoPath = await uploadStaffPhotoObject(supabase, id, await photo.arrayBuffer())
    const { data, error } = await supabase
      .from('profiles')
      .update({ photo_url: photoPath })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      try {
        await deleteStaffPhotoObject(supabase, photoPath)
      } catch (cleanupError) {
        console.error('Failed to clean up staff photo after database update failure:', cleanupError)
      }

      throw new Error(`Failed to update staff profile ${id}: ${error.message}`)
    }

    if (!data) {
      try {
        await deleteStaffPhotoObject(supabase, photoPath)
      } catch (cleanupError) {
        console.error('Failed to clean up staff photo after missing profile row:', cleanupError)
      }

      return createErrorResponse('Staff profile not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      photo_url: photoPath,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while uploading the staff photo.',
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
    const supabase = getSupabaseAdminClient() as unknown as StaffPhotoMutationClient
    const existingProfile = await readStaffProfile(supabase, id)

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (!existingProfile.photoUrl) {
      return createErrorResponse('Staff photo not found.', 400)
    }

    await deleteStaffPhotoObject(supabase, existingProfile.photoUrl)

    const { data, error } = await supabase
      .from('profiles')
      .update({ photo_url: null })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update staff profile ${id}: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting the staff photo.',
      500,
    )
  }
}
