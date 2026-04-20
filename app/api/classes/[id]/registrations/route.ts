import { NextResponse } from 'next/server'
import { z } from 'zod'
import { backfillRegistrationAttendanceForCurrentPeriod } from '@/app/api/classes/_registration-attendance'
import {
  getNextPaymentRecordedAt,
  getStoredRegistrationAmount,
  isUniqueViolation,
  normalizeOptionalText,
  resolveClassRegistrationFeeSelection,
} from '@/app/api/classes/_registration-utils'
import { getUtcDateFromDateValue } from '@/lib/classes'
import {
  readClassById,
  readClassRegistrationById,
  readClassRegistrations,
} from '@/lib/classes-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const statusSchema = z.enum(['pending', 'approved', 'denied'])
const dateValueSchema = z.string().trim().regex(/^(\d{4})-(\d{2})-(\d{2})$/u)
const amountSchema = z.number().finite().int().min(0)
const feeTypeSchema = z.enum(['monthly', 'per_session', 'custom'])
const optionalTextSchema = z.string().trim().nullable().optional()

const registrationsFilterSchema = z.object({
  status: statusSchema.optional(),
})

const createGuestSchema = z
  .object({
    name: z.string().trim().min(1, 'Guest name is required.'),
    phone: optionalTextSchema,
    email: z.string().trim().email('Enter a valid email address.'),
    remark: optionalTextSchema,
  })
  .strict()

const createClassRegistrationSchema = z.union([
  z
    .object({
      registrant_type: z.literal('member'),
      member_id: z.string().uuid(),
      month_start: dateValueSchema,
      fee_type: feeTypeSchema,
      amount_paid: amountSchema,
      payment_received: z.boolean(),
      notes: optionalTextSchema,
    })
    .strict(),
  z
    .object({
      registrant_type: z.literal('guest'),
      guest: createGuestSchema,
      month_start: dateValueSchema,
      fee_type: feeTypeSchema,
      amount_paid: amountSchema,
      payment_received: z.boolean(),
      notes: optionalTextSchema,
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

async function findExistingGuestProfileId(
  supabase: any,
  guest: {
    name: string
    phone: string | null
    email: string | null
  },
) {
  let query = supabase.from('guest_profiles').select('id').eq('name', guest.name)

  query = guest.phone === null ? query.is('phone', null) : query.eq('phone', guest.phone)
  query = guest.email === null ? query.is('email', null) : query.eq('email', guest.email)

  const { data: guestProfile, error: guestProfileError } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (guestProfileError) {
    throw new Error(`Failed to read an existing guest profile: ${guestProfileError.message}`)
  }

  return (guestProfile?.id as string | undefined) ?? null
}

async function rollbackGuestProfile(supabase: any, guestProfileId: string) {
  const { error } = await supabase.from('guest_profiles').delete().eq('id', guestProfileId)

  if (error) {
    throw new Error(`Registration failed and guest rollback also failed: ${error.message}`)
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

    const permissions = resolvePermissionsForProfile(profile)

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const effectiveStatus = permissions.role === 'admin' ? filters.status : 'approved'
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

    const permissions = resolvePermissionsForProfile(profile)

    if (!permissions.can('classes.register')) {
      return createErrorResponse('Forbidden', 403)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    let selectedAmount: number

    let memberId: string | null = null
    let guestProfileId: string | null = null
    let createdGuestProfileId: string | null = null
    const registrationStatus = permissions.role === 'admin' ? 'approved' : 'pending'

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
      const normalizedGuest = {
        name: input.guest.name.trim(),
        phone: normalizeOptionalText(input.guest.phone),
        email: normalizeOptionalText(input.guest.email),
        remark: normalizeOptionalText(input.guest.remark),
      }

      guestProfileId = await findExistingGuestProfileId(supabase, normalizedGuest)

      if (!guestProfileId) {
        const { data: guestProfile, error: guestError } = await supabase
          .from('guest_profiles')
          .insert(normalizedGuest)
          .select('id')
          .maybeSingle()

        if (guestError) {
          throw new Error(`Failed to create the guest profile: ${guestError.message}`)
        }

        createdGuestProfileId = (guestProfile?.id as string | undefined) ?? null

        if (!createdGuestProfileId) {
          throw new Error('Failed to create the guest profile.')
        }

        guestProfileId = createdGuestProfileId
      }
    }

    selectedAmount = resolveClassRegistrationFeeSelection({
      classItem,
      feeType: input.fee_type,
      requestedAmount: input.amount_paid,
    })

    const { data: insertedRegistration, error: insertError } = await supabase
      .from('class_registrations')
      .insert({
        class_id: id,
        member_id: memberId,
        guest_profile_id: guestProfileId,
        month_start: input.month_start,
        fee_type: input.fee_type,
        amount_paid: getStoredRegistrationAmount({
          selectedAmount,
          paymentReceived: input.payment_received,
        }),
        payment_recorded_at: getNextPaymentRecordedAt({
          paymentReceived: input.payment_received,
        }),
        notes: normalizeOptionalText(input.notes),
        status: registrationStatus,
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      if (createdGuestProfileId) {
        await rollbackGuestProfile(supabase, createdGuestProfileId)
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
      if (createdGuestProfileId) {
        await rollbackGuestProfile(supabase, createdGuestProfileId)
      }

      throw new Error('Failed to create the class registration.')
    }

    const registration = await readClassRegistrationById(supabase, id, registrationId)

    if (!registration) {
      throw new Error('Failed to load the created class registration.')
    }

    if (classItem.current_period_start && registration.status === 'approved') {
      try {
        await backfillRegistrationAttendanceForCurrentPeriod({
          supabase,
          classId: id,
          registration,
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
