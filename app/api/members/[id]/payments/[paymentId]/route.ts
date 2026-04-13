import { NextResponse } from 'next/server'
import { buildMemberTypeUpdateValues } from '@/lib/member-type-sync'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberType } from '@/types'

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

async function readLatestMemberPayment(supabase: any, memberId: string) {
  const { data, error } = await supabase
    .from('member_payments')
    .select('id, member_type_id')
    .eq('member_id', memberId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read latest member payment for ${memberId}: ${error.message}`)
  }

  return data as { id: string; member_type_id: string } | null
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

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id, type, member_type_id')
      .eq('id', id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(`Failed to read member ${id}: ${existingMemberError.message}`)
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const latestPaymentBeforeDelete = await readLatestMemberPayment(supabase, id)
    const { error: deleteError } = await supabase
      .from('member_payments')
      .delete()
      .eq('id', paymentId)
      .eq('member_id', id)

    if (deleteError) {
      throw new Error(`Failed to delete member payment ${paymentId}: ${deleteError.message}`)
    }

    if (latestPaymentBeforeDelete?.id === paymentId) {
      const latestPaymentAfterDelete = await readLatestMemberPayment(supabase, id)
      const updateValues = latestPaymentAfterDelete
        ? await buildMemberTypeUpdateValues(
            supabase,
            latestPaymentAfterDelete.member_type_id,
            existingMember.type as MemberType,
          )
        : {
            member_type_id: null,
            type: existingMember.type as MemberType,
          }
      const { error: updateError } = await supabase
        .from('members')
        .update(updateValues)
        .eq('id', id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(`Failed to update member ${id}: ${updateError.message}`)
      }
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
