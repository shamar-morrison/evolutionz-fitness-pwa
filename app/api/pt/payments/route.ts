import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isFrontDeskStaff, readStaffProfile } from '@/lib/staff'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { paymentMethodSchema } from '@/lib/validation-schemas'
import type { MemberPaymentMethod, Profile } from '@/types'

const paymentDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Payment date must be in YYYY-MM-DD format.')

const createPtPaymentSchema = z
  .object({
    memberId: z.string().uuid(),
    assignmentId: z.string().uuid(),
    amount: z
      .number()
      .finite()
      .refine(
        (value) => Number.isInteger(value) && value > 0,
        'Amount must be a whole number greater than 0.',
      ),
    monthsCovered: z
      .number()
      .finite()
      .default(1)
      .refine(
        (value) => Number.isInteger(value) && value > 0,
        'Months covered must be a whole number greater than 0.',
      ),
    paymentMethod: paymentMethodSchema,
    notes: z.string().trim().min(1).nullable().optional(),
    paymentDate: paymentDateSchema,
  })
  .strict()

type QueryError = {
  message: string
}

type TrainerClientPaymentRow = {
  id: string
  member_id: string
  trainer_id: string
  status: 'active' | 'inactive'
}

type PtPaymentRow = {
  id: string
  member_id: string
  assignment_id: string
  trainer_id: string
  amount: number
  months_covered: number
  payment_method: MemberPaymentMethod
  notes: string | null
  payment_date: string
  recorded_by: string
  created_at: string
}

type ProfileSummaryRow = {
  id: string
  name: string
}

type PtPaymentsRouteClient = {
  from(table: 'trainer_clients'): {
    select(columns: 'id, member_id, trainer_id, status'): {
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{
          data: TrainerClientPaymentRow | null
          error: QueryError | null
        }>
      }
    }
  }
  from(table: 'pt_payments'): {
    insert(values: {
      member_id: string
      assignment_id: string
      trainer_id: string
      amount: number
      months_covered: number
      payment_method: MemberPaymentMethod
      notes: string | null
      payment_date: string
      recorded_by: string
    }): {
      select(columns: '*'): {
        maybeSingle(): PromiseLike<{
          data: PtPaymentRow | null
          error: QueryError | null
        }>
      }
    }
    select(columns: string): {
      eq(column: 'member_id', value: string): {
        order(column: 'payment_date', options: { ascending: boolean }): {
          order(column: 'created_at', options: { ascending: boolean }): PromiseLike<{
            data: PtPaymentRow[] | null
            error: QueryError | null
          }>
        }
      }
    }
  }
  from(table: 'profiles'): {
    select(columns: 'id, name'): {
      in(column: 'id', values: string[]): PromiseLike<{
        data: ProfileSummaryRow[] | null
        error: QueryError | null
      }>
    }
  }
  from(table: string): any
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function isAllowedPtPaymentRecorder(profile: Profile) {
  return profile.role === 'admin' || isFrontDeskStaff(profile.titles)
}

async function requirePtPaymentRecorder(supabase: PtPaymentsRouteClient) {
  const authResult = await requireAuthenticatedUser()

  if ('response' in authResult) {
    return authResult
  }

  const profile = await readStaffProfile(supabase, authResult.user.id)

  if (!profile || profile.isSuspended || !isAllowedPtPaymentRecorder(profile)) {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    user: authResult.user,
    profile,
  }
}

async function loadProfileNames(
  supabase: PtPaymentsRouteClient,
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))

  if (uniqueIds.length === 0) {
    return new Map<string, string>()
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', uniqueIds)

  if (error) {
    throw new Error(`Failed to read profile names for PT payments: ${error.message}`)
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile.name]))
}

function mapPaymentRow(row: PtPaymentRow, profileNamesById: Map<string, string>) {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    trainerName: profileNamesById.get(row.trainer_id) ?? 'Unknown trainer',
    amount: row.amount,
    monthsCovered: row.months_covered,
    paymentMethod: row.payment_method,
    notes: row.notes,
    paymentDate: row.payment_date,
    recordedBy: profileNamesById.get(row.recorded_by) ?? 'Unknown',
    createdAt: row.created_at,
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdminClient() as unknown as PtPaymentsRouteClient
    const authResult = await requirePtPaymentRecorder(supabase)

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId') ?? ''

    if (!z.string().uuid().safeParse(memberId).success) {
      return createErrorResponse('memberId must be a valid UUID.', 400)
    }

    const { data, error } = await supabase
      .from('pt_payments')
      .select('id, member_id, assignment_id, trainer_id, amount, months_covered, payment_method, notes, payment_date, recorded_by, created_at')
      .eq('member_id', memberId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to read PT payments for member ${memberId}: ${error.message}`)
    }

    const payments = data ?? []
    const profileNamesById = await loadProfileNames(
      supabase,
      payments.flatMap((payment) => [payment.trainer_id, payment.recorded_by]),
    )

    return NextResponse.json(payments.map((payment) => mapPaymentRow(payment, profileNamesById)))
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading PT payments.',
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdminClient() as unknown as PtPaymentsRouteClient
    const authResult = await requirePtPaymentRecorder(supabase)

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createPtPaymentSchema.parse(requestBody)
    const { data: assignment, error: assignmentError } = await supabase
      .from('trainer_clients')
      .select('id, member_id, trainer_id, status')
      .eq('id', input.assignmentId)
      .maybeSingle()

    if (assignmentError) {
      throw new Error(`Failed to read PT assignment ${input.assignmentId}: ${assignmentError.message}`)
    }

    if (!assignment || assignment.member_id !== input.memberId || assignment.status !== 'active') {
      return createErrorResponse('Active PT assignment not found for this member.', 400)
    }

    const { data, error } = await supabase
      .from('pt_payments')
      .insert({
        member_id: input.memberId,
        assignment_id: assignment.id,
        trainer_id: assignment.trainer_id,
        amount: input.amount,
        months_covered: input.monthsCovered,
        payment_method: input.paymentMethod,
        notes: normalizeOptionalText(input.notes),
        payment_date: input.paymentDate,
        recorded_by: authResult.profile.id,
      })
      .select('*')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to record the PT payment: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to record the PT payment: missing inserted row.')
    }

    return NextResponse.json({
      ok: true,
      payment: data,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof z.ZodError) {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while recording the PT payment.',
      500,
    )
  }
}
