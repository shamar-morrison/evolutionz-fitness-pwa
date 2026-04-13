import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type DeleteMemberPaymentRouteClient = {
  from(table: 'member_payments'): {
    select(columns: 'id, member_id'): {
      eq(column: 'id', value: string): {
        eq(column: 'member_id', value: string): {
          maybeSingle(): QueryResult<{
            id: string
            member_id: string
          }>
        }
      }
    }
  }
  from(table: 'members'): {
    select(columns: 'id'): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<{
          id: string
        }>
      }
    }
  }
  rpc(
    fn: 'delete_member_payment_and_sync_member_type',
    args: {
      p_payment_id: string
      p_member_id: string
    },
  ): PromiseLike<{
    data: null
    error: QueryError | null
  }>
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
    const supabase = getSupabaseAdminClient() as unknown as DeleteMemberPaymentRouteClient
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

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(`Failed to read member ${id}: ${existingMemberError.message}`)
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const { error: deleteError } = await supabase.rpc(
      'delete_member_payment_and_sync_member_type',
      {
        p_payment_id: paymentId,
        p_member_id: id,
      },
    )

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
