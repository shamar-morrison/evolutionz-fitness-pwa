import { NextResponse } from 'next/server'
import {
  type DirectMemberEditClient,
  directMemberEditSchema,
  executeDirectMemberEdit,
} from '@/lib/member-direct-edit'
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
    const input = directMemberEditSchema.parse(requestBody)
    const result = await executeDirectMemberEdit(
      id,
      input,
      getSupabaseAdminClient() as unknown as DirectMemberEditClient,
    )

    if (!result.ok) {
      return createErrorResponse(result.error, result.status)
    }

    return NextResponse.json(result)
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
        : 'Unexpected server error while updating a member.',
      500,
    )
  }
}
