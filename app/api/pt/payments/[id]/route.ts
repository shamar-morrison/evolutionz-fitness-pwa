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

type DeletePtPaymentRouteClient = {
  from(table: 'pt_payments'): {
    select(columns: 'id'): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<{
          id: string
        }>
      }
    }
    delete(): {
      eq(column: 'id', value: string): PromiseLike<{
        data: null
        error: QueryError | null
      }>
    }
  }
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as unknown as DeletePtPaymentRouteClient
    const { data: payment, error: paymentError } = await supabase
      .from('pt_payments')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (paymentError) {
      throw new Error(`Failed to read PT payment ${id}: ${paymentError.message}`)
    }

    if (!payment) {
      return createErrorResponse('PT payment not found.', 404)
    }

    const { error: deleteError } = await supabase
      .from('pt_payments')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(`Failed to delete PT payment ${id}: ${deleteError.message}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting the PT payment.',
      500,
    )
  }
}
