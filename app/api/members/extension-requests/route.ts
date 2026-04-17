import { NextResponse } from 'next/server'
import {
  MEMBER_EXTENSION_REQUEST_SELECT,
  mapMemberExtensionRequestRecord,
  type MemberExtensionRequestRecord,
} from '@/lib/member-extension-request-records'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberExtensionRequestsRouteClient = {
  from(table: 'member_extension_requests'): {
    select(columns: string): {
      eq(column: 'status', value: 'pending'): {
        order(
          column: 'created_at',
          options: {
            ascending: boolean
          },
        ): QueryResult<MemberExtensionRequestRecord[]>
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

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberExtensionRequestsRouteClient
    const { data, error } = await supabase
      .from('member_extension_requests')
      .select(MEMBER_EXTENSION_REQUEST_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to read member extension requests: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      requests: ((data ?? []) as MemberExtensionRequestRecord[]).map(
        mapMemberExtensionRequestRecord,
      ),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading member extension requests.',
      500,
    )
  }
}
