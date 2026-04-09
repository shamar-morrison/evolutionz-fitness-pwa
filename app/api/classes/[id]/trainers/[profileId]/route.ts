import { NextResponse } from 'next/server'
import { readClassById } from '@/lib/classes-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, profileId } = await params
    const supabase = getSupabaseAdminClient()
    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const { data, error } = await supabase
      .from('class_trainers')
      .delete()
      .eq('class_id', id)
      .eq('profile_id', profileId)
      .select('profile_id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to remove class trainer: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Class trainer not found.', 404)
    }

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while removing the class trainer.',
      500,
    )
  }
}
