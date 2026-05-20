import { NextResponse } from 'next/server'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
import { hasStaffTitle } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { readTrainerClients } from '@/lib/pt-scheduling-server'
import { TRAINER_PAYOUT_PER_CLIENT_JMD } from '@/lib/pt-scheduling'

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
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const { profile } = authResult
    const isAdmin = profile.role === 'admin'
    const isTrainer = hasStaffTitle(profile.titles, 'Trainer')

    if (!isAdmin && !isTrainer) {
      return createErrorResponse('Forbidden', 403)
    }

    const supabase = getSupabaseAdminClient() as any

    const assignments = await readTrainerClients(supabase, {
      trainerId: profile.id,
      status: 'active',
    })

    const mappedAssignments = assignments.map((assignment) => ({
      id: assignment.id,
      memberName: assignment.memberName,
      commissionRate: assignment.commissionOverride ?? TRAINER_PAYOUT_PER_CLIENT_JMD,
    }))

    return NextResponse.json({
      assignments: mappedAssignments,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading trainer commission.',
      500,
    )
  }
}
