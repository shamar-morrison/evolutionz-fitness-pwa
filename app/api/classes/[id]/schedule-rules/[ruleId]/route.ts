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
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, ruleId } = await params
    const supabase = getSupabaseAdminClient()
    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const { data, error } = await supabase
      .from('class_schedule_rules')
      .delete()
      .eq('id', ruleId)
      .eq('class_id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to delete class schedule rule: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Schedule rule not found.', 404)
    }

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting the class schedule rule.',
      500,
    )
  }
}
