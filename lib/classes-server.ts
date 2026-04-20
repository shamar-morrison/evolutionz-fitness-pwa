import type {
  ClassAttendanceRow,
  ClassPaymentsReportStatus,
  ClassPaymentsReportTrainer,
  ClassRegistrationListItem,
  ClassRegistrationStatus,
  ClassScheduleRule,
  ClassSessionListItem,
  ClassTrainerProfile,
  ClassWithTrainers,
} from '@/lib/classes'
import { isClassRegistrationEligibleForSession } from '@/lib/classes'
import { normalizeTimeInputValue } from '@/lib/member-access-time'
import { getDateRangeBoundsInJamaica } from '@/lib/pt-scheduling'
import { normalizeStaffTitles } from '@/lib/staff'
import type { ClassScheduleRuleDay } from '@/types'

const CLASS_SELECT =
  'id, name, schedule_description, per_session_fee, monthly_fee, trainer_compensation_pct, current_period_start, created_at'
const CLASS_REGISTRATION_SELECT =
  'id, class_id, member_id, guest_profile_id, month_start, status, fee_type, amount_paid, payment_recorded_at, notes, receipt_number, receipt_sent_at, reviewed_by, reviewed_at, review_note, created_at'
const CLASS_SCHEDULE_RULE_SELECT = 'id, class_id, day_of_week, session_time, created_at'
const CLASS_SESSION_SELECT = 'id, class_id, scheduled_at, period_start, created_at'
const CLASS_ATTENDANCE_SELECT =
  'id, session_id, member_id, guest_profile_id, marked_by, marked_at, created_at'
const CLASS_PAYMENTS_TRAINER_SELECT =
  'class_id, profile_id, profiles:profile_id ( id, name, titles ), classes:class_id ( id, name, trainer_compensation_pct )'
const CLASS_PAYMENTS_REGISTRATION_SELECT = 'class_id, amount_paid, status, created_at'

type ClassesAdminClient = {
  from(table: string): any
}

type ClassRow = {
  id: string
  name: string
  schedule_description: string
  per_session_fee: number | string | null
  monthly_fee: number | string | null
  trainer_compensation_pct: number | string
  current_period_start: string | null
  created_at: string
}

type ClassTrainerRow = {
  class_id: string
  profile_id: string
}

type ClassPaymentTrainerProfileRow = {
  id: string
  name: string
  titles: string[] | null
}

type ClassPaymentTrainerClassRow = {
  id: string
  name: string
  trainer_compensation_pct: number | string
}

type ClassPaymentTrainerJoinRow = {
  class_id: string
  profile_id: string
  profiles: ClassPaymentTrainerProfileRow | ClassPaymentTrainerProfileRow[] | null
  classes: ClassPaymentTrainerClassRow | ClassPaymentTrainerClassRow[] | null
}

type TrainerProfileRow = {
  id: string
  name: string
  titles: string[] | null
}

type ClassRegistrationRow = {
  id: string
  class_id: string
  member_id: string | null
  guest_profile_id: string | null
  month_start: string
  status: ClassRegistrationStatus
  fee_type: ClassRegistrationListItem['fee_type']
  amount_paid: number | string
  payment_recorded_at: string | null
  notes: string | null
  receipt_number: string | null
  receipt_sent_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

type MemberRegistrantRow = {
  id: string
  name: string
  email: string | null
}

type GuestRegistrantRow = {
  id: string
  name: string
  email: string | null
}

type ClassScheduleRuleRow = {
  id: string
  class_id: string
  day_of_week: number | string
  session_time: string
  created_at: string
}

type ClassSessionRow = {
  id: string
  class_id: string
  scheduled_at: string
  period_start: string
  created_at: string
}

type ClassAttendanceRowRecord = {
  id: string
  session_id: string
  member_id: string | null
  guest_profile_id: string | null
  marked_by: string | null
  marked_at: string | null
  created_at: string
}

type ClassPaymentsRegistrationRow = Pick<
  ClassRegistrationRow,
  'class_id' | 'amount_paid' | 'status' | 'created_at'
>

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value.trim())

    if (Number.isFinite(parsedValue)) {
      return parsedValue
    }
  }

  return 0
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  return normalizeNumber(value)
}

function getJoinedRow<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function getClassRegistrantKey({
  member_id,
  guest_profile_id,
}: {
  member_id: string | null
  guest_profile_id: string | null
}) {
  if (member_id) {
    return `member:${member_id}`
  }

  if (guest_profile_id) {
    return `guest:${guest_profile_id}`
  }

  return null
}

function mapTrainerProfileRow(row: TrainerProfileRow): ClassTrainerProfile {
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    titles: normalizeStaffTitles(row.titles),
  }
}

function mapClassRow(
  row: ClassRow,
  trainerProfilesByClassId: Map<string, ClassTrainerProfile[]>,
): ClassWithTrainers {
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    schedule_description: normalizeText(row.schedule_description),
    per_session_fee: normalizeNullableNumber(row.per_session_fee),
    monthly_fee: normalizeNullableNumber(row.monthly_fee),
    trainer_compensation_pct: normalizeNumber(row.trainer_compensation_pct),
    current_period_start: normalizeNullableText(row.current_period_start),
    created_at: normalizeText(row.created_at),
    trainers: trainerProfilesByClassId.get(row.id) ?? [],
  }
}

async function loadTrainerProfilesByClassId(
  supabase: ClassesAdminClient,
  classIds: string[],
) {
  if (classIds.length === 0) {
    return new Map<string, ClassTrainerProfile[]>()
  }

  const { data: classTrainerData, error: classTrainerError } = await supabase
    .from('class_trainers')
    .select('class_id, profile_id')
    .in('class_id', classIds)

  if (classTrainerError) {
    throw new Error(`Failed to read class trainers: ${classTrainerError.message}`)
  }

  const classTrainerRows = (classTrainerData ?? []) as ClassTrainerRow[]
  const profileIds = Array.from(
    new Set(classTrainerRows.map((row) => normalizeText(row.profile_id)).filter(Boolean)),
  )

  if (profileIds.length === 0) {
    return new Map<string, ClassTrainerProfile[]>()
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, titles')
    .in('id', profileIds)

  if (profileError) {
    throw new Error(`Failed to read class trainer profiles: ${profileError.message}`)
  }

  const profileById = new Map(
    ((profileData ?? []) as TrainerProfileRow[]).map((row) => [row.id, mapTrainerProfileRow(row)]),
  )
  const trainersByClassId = new Map<string, ClassTrainerProfile[]>()

  for (const row of classTrainerRows) {
    const trainerProfile = profileById.get(row.profile_id)

    if (!trainerProfile) {
      continue
    }

    const nextProfiles = trainersByClassId.get(row.class_id) ?? []
    nextProfiles.push(trainerProfile)
    trainersByClassId.set(row.class_id, nextProfiles)
  }

  for (const [classId, profiles] of trainersByClassId) {
    profiles.sort((left, right) => left.name.localeCompare(right.name))
    trainersByClassId.set(classId, profiles)
  }

  return trainersByClassId
}

async function hydrateClassRegistrations(
  supabase: ClassesAdminClient,
  rows: ClassRegistrationRow[],
) {
  const memberIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.member_id)).filter(Boolean)),
  )
  const guestIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.guest_profile_id)).filter(Boolean)),
  )

  const [memberResult, guestResult] = await Promise.all([
    memberIds.length > 0
      ? supabase.from('members').select('id, name, email').in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    guestIds.length > 0
      ? supabase.from('guest_profiles').select('id, name, email').in('id', guestIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (memberResult.error) {
    throw new Error(`Failed to read class registration members: ${memberResult.error.message}`)
  }

  if (guestResult.error) {
    throw new Error(`Failed to read class registration guests: ${guestResult.error.message}`)
  }

  const memberById = new Map(
    ((memberResult.data ?? []) as MemberRegistrantRow[]).map((row) => [row.id, row]),
  )
  const guestById = new Map(
    ((guestResult.data ?? []) as GuestRegistrantRow[]).map((row) => [row.id, row]),
  )

  return rows.map((row) => {
    const isMember = Boolean(row.member_id)
    const registrant = isMember ? memberById.get(row.member_id ?? '') : guestById.get(row.guest_profile_id ?? '')
    const registrantName =
      normalizeText(registrant?.name) || (isMember ? 'Unknown member' : 'Unknown guest')

    return {
      id: normalizeText(row.id),
      class_id: normalizeText(row.class_id),
      member_id: normalizeNullableText(row.member_id),
      guest_profile_id: normalizeNullableText(row.guest_profile_id),
      month_start: normalizeText(row.month_start),
      status: row.status,
      fee_type: row.fee_type ?? 'custom',
      amount_paid: normalizeNumber(row.amount_paid),
      payment_recorded_at: normalizeNullableText(row.payment_recorded_at),
      notes: normalizeNullableText(row.notes),
      receipt_number: normalizeNullableText(row.receipt_number),
      receipt_sent_at: normalizeNullableText(row.receipt_sent_at),
      reviewed_by: normalizeNullableText(row.reviewed_by),
      reviewed_at: normalizeNullableText(row.reviewed_at),
      review_note: normalizeNullableText(row.review_note),
      created_at: normalizeText(row.created_at),
      registrant_name: registrantName,
      registrant_type: isMember ? 'member' : 'guest',
      registrant_email: normalizeNullableText(registrant?.email),
    } satisfies ClassRegistrationListItem
  })
}

function mapClassScheduleRuleRow(row: ClassScheduleRuleRow): ClassScheduleRule {
  const normalizedTime = normalizeTimeInputValue(row.session_time) ?? normalizeText(row.session_time)
  const normalizedDay = normalizeNumber(row.day_of_week)

  return {
    id: normalizeText(row.id),
    class_id: normalizeText(row.class_id),
    day_of_week: normalizedDay as ClassScheduleRuleDay,
    session_time: normalizedTime,
    created_at: normalizeText(row.created_at),
  }
}

function mapClassSessionRow(row: ClassSessionRow): Omit<ClassSessionListItem, 'marked_count' | 'total_count'> {
  return {
    id: normalizeText(row.id),
    class_id: normalizeText(row.class_id),
    scheduled_at: normalizeText(row.scheduled_at),
    period_start: normalizeText(row.period_start),
    created_at: normalizeText(row.created_at),
  }
}

async function hydrateClassAttendanceRows(
  supabase: ClassesAdminClient,
  rows: ClassAttendanceRowRecord[],
) {
  const memberIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.member_id)).filter(Boolean)),
  )
  const guestIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.guest_profile_id)).filter(Boolean)),
  )

  const [memberResult, guestResult] = await Promise.all([
    memberIds.length > 0
      ? supabase.from('members').select('id, name').in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    guestIds.length > 0
      ? supabase.from('guest_profiles').select('id, name').in('id', guestIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (memberResult.error) {
    throw new Error(`Failed to read class attendance members: ${memberResult.error.message}`)
  }

  if (guestResult.error) {
    throw new Error(`Failed to read class attendance guests: ${guestResult.error.message}`)
  }

  const memberById = new Map(
    ((memberResult.data ?? []) as MemberRegistrantRow[]).map((row) => [row.id, row]),
  )
  const guestById = new Map(
    ((guestResult.data ?? []) as GuestRegistrantRow[]).map((row) => [row.id, row]),
  )

  return rows.map((row) => {
    const isMember = Boolean(row.member_id)

    return {
      id: normalizeText(row.id),
      session_id: normalizeText(row.session_id),
      member_id: normalizeNullableText(row.member_id),
      guest_profile_id: normalizeNullableText(row.guest_profile_id),
      marked_by: normalizeNullableText(row.marked_by),
      marked_at: normalizeNullableText(row.marked_at),
      created_at: normalizeText(row.created_at),
      registrant_name: isMember
        ? normalizeText(memberById.get(row.member_id ?? '')?.name) || 'Unknown member'
        : normalizeText(guestById.get(row.guest_profile_id ?? '')?.name) || 'Unknown guest',
      registrant_type: isMember ? 'member' : 'guest',
    } satisfies ClassAttendanceRow
  })
}

export async function readClasses(supabase: ClassesAdminClient) {
  const { data, error } = await supabase
    .from('classes')
    .select(CLASS_SELECT)
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to read classes: ${error.message}`)
  }

  const rows = (data ?? []) as ClassRow[]
  const trainersByClassId = await loadTrainerProfilesByClassId(
    supabase,
    rows.map((row) => row.id),
  )

  return rows.map((row) => mapClassRow(row, trainersByClassId))
}

export async function readClassById(
  supabase: ClassesAdminClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('classes')
    .select(CLASS_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read class ${id}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const trainersByClassId = await loadTrainerProfilesByClassId(supabase, [id])

  return mapClassRow(data as ClassRow, trainersByClassId)
}

export async function readClassTrainers(
  supabase: ClassesAdminClient,
  classId: string,
) {
  const trainersByClassId = await loadTrainerProfilesByClassId(supabase, [classId])

  return trainersByClassId.get(classId) ?? []
}

export async function readClassRegistrations(
  supabase: ClassesAdminClient,
  classId: string,
  options: {
    status?: ClassRegistrationStatus
    id?: string
  } = {},
) {
  let query = supabase
    .from('class_registrations')
    .select(CLASS_REGISTRATION_SELECT)
    .eq('class_id', classId)

  if (options.status) {
    query = query.eq('status', options.status)
  }

  if (options.id) {
    query = query.eq('id', options.id)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read class registrations: ${error.message}`)
  }

  return hydrateClassRegistrations(supabase, (data ?? []) as ClassRegistrationRow[])
}

export async function readClassRegistrationById(
  supabase: ClassesAdminClient,
  classId: string,
  registrationId: string,
) {
  const registrations = await readClassRegistrations(supabase, classId, {
    id: registrationId,
  })

  return registrations[0] ?? null
}

export async function readClassScheduleRules(
  supabase: ClassesAdminClient,
  classId: string,
) {
  const { data, error } = await supabase
    .from('class_schedule_rules')
    .select(CLASS_SCHEDULE_RULE_SELECT)
    .eq('class_id', classId)
    .order('day_of_week', { ascending: true })
    .order('session_time', { ascending: true })

  if (error) {
    throw new Error(`Failed to read class schedule rules: ${error.message}`)
  }

  return ((data ?? []) as ClassScheduleRuleRow[]).map(mapClassScheduleRuleRow)
}

export async function readClassSessionById(
  supabase: ClassesAdminClient,
  classId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(CLASS_SESSION_SELECT)
    .eq('id', sessionId)
    .eq('class_id', classId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read class session ${sessionId}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return mapClassSessionRow(data as ClassSessionRow)
}

export async function readEligibleClassRegistrationsForSession(
  supabase: ClassesAdminClient,
  classId: string,
  sessionScheduledAt: string,
  periodStart: string,
) {
  const registrations = await readClassRegistrations(supabase, classId, {
    status: 'approved',
  })

  return registrations.filter((registration) =>
    isClassRegistrationEligibleForSession(
      registration.month_start,
      sessionScheduledAt,
      periodStart,
    ),
  )
}

export async function readClassSessions(
  supabase: ClassesAdminClient,
  classId: string,
  periodStart: string,
) {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(CLASS_SESSION_SELECT)
    .eq('class_id', classId)
    .eq('period_start', periodStart)
    .order('scheduled_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to read class sessions: ${error.message}`)
  }

  const sessionRows = ((data ?? []) as ClassSessionRow[]).map(mapClassSessionRow)

  if (sessionRows.length === 0) {
    return [] as ClassSessionListItem[]
  }

  const [attendanceRows, registrations] = await Promise.all([
    supabase
      .from('class_attendance')
      .select(CLASS_ATTENDANCE_SELECT)
      .in(
        'session_id',
        sessionRows.map((row) => row.id),
      ),
    readClassRegistrations(supabase, classId, {
      status: 'approved',
    }),
  ])

  if (attendanceRows.error) {
    throw new Error(`Failed to read class attendance counts: ${attendanceRows.error.message}`)
  }

  const attendanceBySessionAndRegistrant = new Map<string, ClassAttendanceRowRecord>()

  for (const row of (attendanceRows.data ?? []) as ClassAttendanceRowRecord[]) {
    const registrantKey = getClassRegistrantKey(row)

    if (!registrantKey) {
      continue
    }

    attendanceBySessionAndRegistrant.set(`${row.session_id}:${registrantKey}`, row)
  }

  return sessionRows.map((session) => {
    const eligibleRegistrations = registrations.filter((registration) =>
      isClassRegistrationEligibleForSession(
        registration.month_start,
        session.scheduled_at,
        session.period_start,
      ),
    )

    const markedCount = eligibleRegistrations.reduce((count, registration) => {
      const registrantKey = getClassRegistrantKey(registration)

      if (!registrantKey) {
        return count
      }

      const attendance = attendanceBySessionAndRegistrant.get(`${session.id}:${registrantKey}`)

      return attendance?.marked_at ? count + 1 : count
    }, 0)

    return {
      ...session,
      marked_count: markedCount,
      total_count: eligibleRegistrations.length,
    } satisfies ClassSessionListItem
  })
}

export async function readClassAttendance(
  supabase: ClassesAdminClient,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from('class_attendance')
    .select(CLASS_ATTENDANCE_SELECT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to read class attendance: ${error.message}`)
  }

  const attendanceRows = await hydrateClassAttendanceRows(
    supabase,
    (data ?? []) as ClassAttendanceRowRecord[],
  )

  return attendanceRows.sort((left, right) => {
    if (left.registrant_type !== right.registrant_type) {
      return left.registrant_type.localeCompare(right.registrant_type)
    }

    return left.registrant_name.localeCompare(right.registrant_name)
  })
}

export async function readClassPaymentsReport(
  supabase: ClassesAdminClient,
  filters: {
    startDate: string
    endDate: string
    status: ClassPaymentsReportStatus
    includeZero: boolean
  },
): Promise<ClassPaymentsReportTrainer[]> {
  const dateRange = getDateRangeBoundsInJamaica(filters.startDate, filters.endDate)

  if (!dateRange) {
    throw new Error('Class payment report dates must use valid YYYY-MM-DD values.')
  }

  const { data: trainerData, error: trainerError } = await supabase
    .from('class_trainers')
    .select(CLASS_PAYMENTS_TRAINER_SELECT)

  if (trainerError) {
    throw new Error(`Failed to read class trainers for the payments report: ${trainerError.message}`)
  }

  const trainerRows = (trainerData ?? []) as ClassPaymentTrainerJoinRow[]

  if (trainerRows.length === 0) {
    return []
  }

  const uniqueTrainerIdsByClassId = new Map<string, Set<string>>()
  const classIds = new Set<string>()

  for (const row of trainerRows) {
    const classId = normalizeText(row.class_id)
    const trainerId = normalizeText(row.profile_id)

    if (!classId || !trainerId) {
      continue
    }

    classIds.add(classId)

    const trainerIds = uniqueTrainerIdsByClassId.get(classId) ?? new Set<string>()
    trainerIds.add(trainerId)
    uniqueTrainerIdsByClassId.set(classId, trainerIds)
  }

  if (classIds.size === 0) {
    return []
  }

  let registrationsQuery = supabase
    .from('class_registrations')
    .select(CLASS_PAYMENTS_REGISTRATION_SELECT)
    .in('class_id', Array.from(classIds))
    .gte('created_at', dateRange.startInclusive)
    .lt('created_at', dateRange.endExclusive)

  registrationsQuery =
    filters.status === 'approved'
      ? registrationsQuery.eq('status', 'approved')
      : registrationsQuery.in('status', ['approved', 'pending'])

  const { data: registrationData, error: registrationError } = await registrationsQuery

  if (registrationError) {
    throw new Error(
      `Failed to read class registrations for the payments report: ${registrationError.message}`,
    )
  }

  const registrations = ((registrationData ?? []) as ClassPaymentsRegistrationRow[]).filter((row) =>
    filters.includeZero ? true : normalizeNumber(row.amount_paid) !== 0,
  )
  const registrationTotalsByClassId = new Map<
    string,
    {
      registrationCount: number
      totalCollected: number
    }
  >()

  for (const row of registrations) {
    const classId = normalizeText(row.class_id)

    if (!classId) {
      continue
    }

    const currentTotals = registrationTotalsByClassId.get(classId) ?? {
      registrationCount: 0,
      totalCollected: 0,
    }

    currentTotals.registrationCount += 1
    currentTotals.totalCollected += normalizeNumber(row.amount_paid)
    registrationTotalsByClassId.set(classId, currentTotals)
  }

  const trainersById = new Map<string, ClassPaymentsReportTrainer>()
  const seenTrainerClassKeys = new Set<string>()

  for (const row of trainerRows) {
    const trainerId = normalizeText(row.profile_id)
    const classId = normalizeText(row.class_id)
    const trainerProfile = getJoinedRow(row.profiles)
    const classItem = getJoinedRow(row.classes)

    if (!trainerId || !classId) {
      continue
    }

    const seenKey = `${trainerId}:${classId}`

    if (seenTrainerClassKeys.has(seenKey)) {
      continue
    }

    seenTrainerClassKeys.add(seenKey)

    const trainerCount = uniqueTrainerIdsByClassId.get(classId)?.size ?? 1
    const classTotals = registrationTotalsByClassId.get(classId) ?? {
      registrationCount: 0,
      totalCollected: 0,
    }
    const compensationPct = normalizeNumber(classItem?.trainer_compensation_pct)
    const payout = Math.round((classTotals.totalCollected * compensationPct) / 100 / trainerCount)
    const existingTrainer = trainersById.get(trainerId)
    const trainer =
      existingTrainer ??
      ({
        trainerId,
        trainerName: normalizeText(trainerProfile?.name) || 'Unknown trainer',
        trainerTitles: normalizeStaffTitles(trainerProfile?.titles),
        classes: [],
        totalPayout: 0,
      } satisfies ClassPaymentsReportTrainer)

    trainer.classes.push({
      classId,
      className: normalizeText(classItem?.name) || 'Unknown class',
      registrationCount: classTotals.registrationCount,
      totalCollected: classTotals.totalCollected,
      compensationPct,
      trainerCount,
      payout,
    })
    trainer.totalPayout += payout
    trainersById.set(trainerId, trainer)
  }

  return Array.from(trainersById.values())
    .map((trainer) => ({
      ...trainer,
      classes: [...trainer.classes].sort((left, right) => left.className.localeCompare(right.className)),
    }))
    .sort((left, right) => left.trainerName.localeCompare(right.trainerName))
}
