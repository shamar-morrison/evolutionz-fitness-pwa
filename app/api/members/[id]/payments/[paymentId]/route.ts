import { NextResponse } from 'next/server'
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
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, paymentId } = await params
    const supabase = getSupabaseAdminClient() as any
    const { data: payment, error: paymentError } = await supabase
      .from('member_payments')
      .select('id, member_id')
      .eq('id', paymentId)
      .eq('member_id', id)
      .maybeSingle()

    if (paymentError) {
      throw new Error(`Failed to read member payment ${paymentId}: ${paymentError.message}`)
    }

    if (!payment) {
      return createErrorResponse('Member payment not found.', 404)
    }

    const { error: deleteError } = await supabase
      .from('member_payments')
      .delete()
      .eq('id', paymentId)
      .eq('member_id', id)

    if (deleteError) {
      throw new Error(`Failed to delete member payment ${paymentId}: ${deleteError.message}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting the member payment.',
      500,
    )
  }
}
