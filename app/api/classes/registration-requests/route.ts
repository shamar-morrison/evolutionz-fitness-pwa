import { NextResponse } from 'next/server'
import {
  CLASS_REGISTRATION_EDIT_REQUEST_SELECT,
  CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT,
  mapClassRegistrationEditRequestRecord,
  mapClassRegistrationRemovalRequestRecord,
  type ClassRegistrationEditRequestRecord,
  type ClassRegistrationRemovalRequestRecord,
  type HydratedRegistrantRecord,
} from '@/lib/class-registration-request-records'
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

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

async function readRegistrantsById(
  supabase: any,
  input: {
    memberIds: string[]
    guestIds: string[]
  },
) {
  const [memberResult, guestResult] = await Promise.all([
    input.memberIds.length > 0
      ? supabase.from('members').select('id, name, email').in('id', input.memberIds)
      : Promise.resolve({ data: [], error: null }),
    input.guestIds.length > 0
      ? supabase.from('guest_profiles').select('id, name, email').in('id', input.guestIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (memberResult.error) {
    throw new Error(
      `Failed to read members for class registration requests: ${memberResult.error.message}`,
    )
  }

  if (guestResult.error) {
    throw new Error(
      `Failed to read guests for class registration requests: ${guestResult.error.message}`,
    )
  }

  return {
    memberById: new Map<string, HydratedRegistrantRecord>(
      ((memberResult.data ?? []) as Array<{ id: string; name: string; email: string | null }>).map(
        (row) => [
          String(row.id),
          {
            id: String(row.id),
            name: normalizeText(row.name),
            email: typeof row.email === 'string' ? row.email.trim() : null,
          },
        ],
      ),
    ),
    guestById: new Map<string, HydratedRegistrantRecord>(
      ((guestResult.data ?? []) as Array<{ id: string; name: string; email: string | null }>).map(
        (row) => [
          String(row.id),
          {
            id: String(row.id),
            name: normalizeText(row.name),
            email: typeof row.email === 'string' ? row.email.trim() : null,
          },
        ],
      ),
    ),
  }
}

function getRegistrantRecord(
  memberById: Map<string, HydratedRegistrantRecord>,
  guestById: Map<string, HydratedRegistrantRecord>,
  input: {
    memberId: string | null | undefined
    guestProfileId: string | null | undefined
  },
) {
  if (input.memberId) {
    return memberById.get(input.memberId) ?? null
  }

  if (input.guestProfileId) {
    return guestById.get(input.guestProfileId) ?? null
  }

  return null
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as any
    const [editResult, removalResult] = await Promise.all([
      supabase
        .from('class_registration_edit_requests')
        .select(CLASS_REGISTRATION_EDIT_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('class_registration_removal_requests')
        .select(CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    if (editResult.error) {
      throw new Error(`Failed to read class registration edit requests: ${editResult.error.message}`)
    }

    if (removalResult.error) {
      throw new Error(
        `Failed to read class registration removal requests: ${removalResult.error.message}`,
      )
    }

    const editRecords = (editResult.data ?? []) as ClassRegistrationEditRequestRecord[]
    const removalRecords = (removalResult.data ?? []) as ClassRegistrationRemovalRequestRecord[]
    const memberIds = Array.from(
      new Set(
        [
          ...editRecords.map((record) => record.registration?.member_id ?? ''),
          ...removalRecords.map((record) => record.registration?.member_id ?? ''),
        ].filter(Boolean),
      ),
    )
    const guestIds = Array.from(
      new Set(
        [
          ...editRecords.map((record) => record.registration?.guest_profile_id ?? ''),
          ...removalRecords.map((record) => record.registration?.guest_profile_id ?? ''),
        ].filter(Boolean),
      ),
    )
    const { memberById, guestById } = await readRegistrantsById(supabase, {
      memberIds,
      guestIds,
    })

    return NextResponse.json({
      ok: true,
      editRequests: editRecords.map((record) =>
        mapClassRegistrationEditRequestRecord(
          record,
          getRegistrantRecord(memberById, guestById, {
            memberId: record.registration?.member_id,
            guestProfileId: record.registration?.guest_profile_id,
          }),
        ),
      ),
      removalRequests: removalRecords.map((record) =>
        mapClassRegistrationRemovalRequestRecord(
          record,
          getRegistrantRecord(memberById, guestById, {
            memberId: record.registration?.member_id,
            guestProfileId: record.registration?.guest_profile_id,
          }),
        ),
      ),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading class registration requests.',
      500,
    )
  }
}
