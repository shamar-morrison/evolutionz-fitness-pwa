import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  addDaysToDateValue,
  getUtcDateFromDateValue,
  isClassRegistrationEligibleForSession,
} from '@/lib/classes'
import {
  readClassById,
  readClassRegistrationById,
  readClassRegistrations,
} from '@/lib/classes-server'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const statusSchema = z.enum(['pending', 'approved', 'denied'])
const dateValueSchema = z.string().trim().regex(/^(\d{4})-(\d{2})-(\d{2})$/u)
const amountSchema = z.number().finite().min(0)
const optionalTextSchema = z.string().trim().nullable().optional()

const registrationsFilterSchema = z.object({
  status: statusSchema.optional(),
})

const createGuestSchema = z
  .object({
    name: z.string().trim().min(1, 'Guest name is required.'),
    phone: optionalTextSchema,
    email: z.string().trim().email('Enter a valid email address.').nullable().optional(),
    remark: optionalTextSchema,
  })
  .strict()

const createClassRegistrationSchema = z.union([
  z
    .object({
      registrant_type: z.literal('member'),
      member_id: z.string().uuid(),
      month_start: dateValueSchema,
      amount_paid: amountSchema,
      payment_received: z.boolean(),
    })
    .strict(),
  z
    .object({
      registrant_type: z.literal('guest'),
      guest: createGuestSchema,
      month_start: dateValueSchema,
      amount_paid: amountSchema,
      payment_received: z.boolean(),
    })
    .strict(),
])

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

async function rollbackGuestProfile(supabase: any, guestProfileId: string) {
  const { error } = await supabase.from('guest_profiles').delete().eq('id', guestProfileId)

  if (error) {
    throw new Error(`Registration failed and guest rollback also failed: ${error.message}`)
  }
}

async function backfillCurrentPeriodAttendance({
  supabase,
  classId,
  currentPeriodStart,
  memberId,
  guestProfileId,
  registrationStart,
}: {
  supabase: any
  classId: string
  currentPeriodStart: string
  memberId: string | null
  guestProfileId: string | null
  registrationStart: string
}) {
  if (!addDaysToDateValue(currentPeriodStart, 27)) {
    throw new Error('Failed to resolve the current class period end date.')
  }

  const nowIso = new Date().toISOString()
  const { data: sessions, error: sessionsError } = await supabase
    .from('class_sessions')
    .select('id, scheduled_at, period_start')
    .eq('class_id', classId)
    .eq('period_start', currentPeriodStart)
    .gt('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })

  if (sessionsError) {
    throw new Error(`Failed to read current-period sessions for attendance backfill: ${sessionsError.message}`)
  }

  const attendanceRows = ((sessions ?? []) as Array<{
    id: string
    scheduled_at: string
    period_start: string
  }>)
    .filter((session) =>
      isClassRegistrationEligibleForSession(
        registrationStart,
        String(session.scheduled_at),
        String(session.period_start ?? currentPeriodStart),
      ),
    )
    .map((session) => ({
      session_id: String(session.id),
      member_id: memberId,
      guest_profile_id: guestProfileId,
      marked_at: null,
      marked_by: null,
    }))

  if (attendanceRows.length === 0) {
    return
  }

  const { error: attendanceError } = await supabase.from('class_attendance').insert(attendanceRows)

  if (attendanceError) {
    throw new Error(`Failed to create class attendance rows: ${attendanceError.message}`)
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // TODO: Centralize shared auth and role checks for class routes if route-level guards are extracted later.
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const filters = registrationsFilterSchema.parse({
      status: searchParams.get('status') ?? undefined,
    })
    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const effectiveStatus = profile.role === 'admin' ? filters.status : 'approved'
    const registrations = await readClassRegistrations(supabase, id, {
      status: effectiveStatus,
    })

    return NextResponse.json({
      registrations,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading class registrations.',
      500,
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // TODO: Centralize shared auth and role checks for class routes if route-level guards are extracted later.
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = createClassRegistrationSchema.parse(requestBody)

    if (!getUtcDateFromDateValue(input.month_start)) {
      return createErrorResponse('month_start must be a valid YYYY-MM-DD date.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    let memberId: string | null = null
    let guestProfileId: string | null = null

    if (input.registrant_type === 'member') {
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, status')
        .eq('id', input.member_id)
        .maybeSingle()

      if (memberError) {
        throw new Error(`Failed to read the selected member: ${memberError.message}`)
      }

      if (!member || member.status !== 'Active') {
        return createErrorResponse('Select an active member to register for class.', 400)
      }

      memberId = member.id as string
    } else {
      const { data: guestProfile, error: guestError } = await supabase
        .from('guest_profiles')
        .insert({
          name: input.guest.name.trim(),
          phone: normalizeOptionalText(input.guest.phone),
          email: normalizeOptionalText(input.guest.email),
          remark: normalizeOptionalText(input.guest.remark),
        })
        .select('id')
        .maybeSingle()

      if (guestError) {
        throw new Error(`Failed to create the guest profile: ${guestError.message}`)
      }

      const createdGuestProfileId = guestProfile?.id as string | undefined

      if (!createdGuestProfileId) {
        throw new Error('Failed to create the guest profile.')
      }

      guestProfileId = createdGuestProfileId
    }

    const { data: insertedRegistration, error: insertError } = await supabase
      .from('class_registrations')
      .insert({
        class_id: id,
        member_id: memberId,
        guest_profile_id: guestProfileId,
        month_start: input.month_start,
        amount_paid: input.payment_received ? input.amount_paid : 0,
        payment_recorded_at: input.payment_received ? new Date().toISOString() : null,
        status: profile.role === 'admin' ? 'approved' : 'pending',
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      if (guestProfileId) {
        await rollbackGuestProfile(supabase, guestProfileId)
      }

      if (isUniqueViolation(insertError)) {
        return createErrorResponse(
          'A registration already exists for this class, registrant, and first class date.',
          409,
        )
      }

      throw new Error(`Failed to create the class registration: ${insertError.message}`)
    }

    const registrationId = insertedRegistration?.id as string | undefined

    if (!registrationId) {
      if (guestProfileId) {
        await rollbackGuestProfile(supabase, guestProfileId)
      }

      throw new Error('Failed to create the class registration.')
    }

    const registration = await readClassRegistrationById(supabase, id, registrationId)

    if (!registration) {
      throw new Error('Failed to load the created class registration.')
    }

    if (classItem.current_period_start) {
      try {
        await backfillCurrentPeriodAttendance({
          supabase,
          classId: id,
          currentPeriodStart: classItem.current_period_start,
          memberId: registration.member_id,
          guestProfileId: registration.guest_profile_id,
          registrationStart: registration.month_start,
        })
      } catch (attendanceError) {
        console.error('Failed to backfill class attendance rows after registration:', attendanceError)
      }
    }

    return NextResponse.json({
      ok: true,
      registration,
    })
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
        : 'Unexpected server error while creating the class registration.',
      500,
    )
  }
}
