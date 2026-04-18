import { NextResponse } from 'next/server'
import {
  mapMemberPauseRequestRecord,
  mapMemberPauseResumeRequestRecord,
  MEMBER_PAUSE_REQUEST_SELECT,
  MEMBER_PAUSE_RESUME_REQUEST_SELECT,
  type MemberPauseRequestRecord,
  type MemberPauseResumeRequestRecord,
} from '@/lib/member-pause-request-records'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberPauseRequestsRouteClient = {
  from(table: 'member_pause_requests'): {
    select(columns: string): {
      eq(column: 'status', value: 'pending'): {
        order(
          column: 'created_at',
          options: {
            ascending: boolean
          },
        ): QueryResult<MemberPauseRequestRecord[]>
      }
    }
  }
  from(table: 'member_pause_resume_requests'): {
    select(columns: string): {
      eq(column: 'status', value: 'pending'): {
        order(
          column: 'created_at',
          options: {
            ascending: boolean
          },
        ): QueryResult<MemberPauseResumeRequestRecord[]>
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

    const supabase = getSupabaseAdminClient() as unknown as MemberPauseRequestsRouteClient
    const [pauseRequestsResult, earlyResumeRequestsResult] = await Promise.all([
      supabase
        .from('member_pause_requests')
        .select(MEMBER_PAUSE_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('member_pause_resume_requests')
        .select(MEMBER_PAUSE_RESUME_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ])

    if (pauseRequestsResult.error) {
      throw new Error(
        `Failed to read member pause requests: ${pauseRequestsResult.error.message}`,
      )
    }

    if (earlyResumeRequestsResult.error) {
      throw new Error(
        `Failed to read early resume requests: ${earlyResumeRequestsResult.error.message}`,
      )
    }

    return NextResponse.json({
      ok: true,
      pauseRequests: ((pauseRequestsResult.data ?? []) as MemberPauseRequestRecord[]).map(
        mapMemberPauseRequestRecord,
      ),
      earlyResumeRequests: (
        (earlyResumeRequestsResult.data ?? []) as MemberPauseResumeRequestRecord[]
      ).map(mapMemberPauseResumeRequestRecord),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading member pause requests.',
      500,
    )
  }
}
