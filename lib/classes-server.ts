import type {
  ClassRegistrationListItem,
  ClassRegistrationStatus,
  ClassTrainerProfile,
  ClassWithTrainers,
} from '@/lib/classes'
import { normalizeStaffTitles } from '@/lib/staff'

const CLASS_SELECT =
  'id, name, schedule_description, per_session_fee, monthly_fee, trainer_compensation_pct, current_period_start, created_at'
const CLASS_REGISTRATION_SELECT =
  'id, class_id, member_id, guest_profile_id, month_start, status, amount_paid, payment_recorded_at, reviewed_by, reviewed_at, review_note, created_at'

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
  amount_paid: number | string
  payment_recorded_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

type MemberRegistrantRow = {
  id: string
  name: string
}

type GuestRegistrantRow = {
  id: string
  name: string
}

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
      ? supabase.from('members').select('id, name').in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    guestIds.length > 0
      ? supabase.from('guest_profiles').select('id, name').in('id', guestIds)
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
    const registrantName = isMember
      ? normalizeText(memberById.get(row.member_id ?? '')?.name) || 'Unknown member'
      : normalizeText(guestById.get(row.guest_profile_id ?? '')?.name) || 'Unknown guest'

    return {
      id: normalizeText(row.id),
      class_id: normalizeText(row.class_id),
      member_id: normalizeNullableText(row.member_id),
      guest_profile_id: normalizeNullableText(row.guest_profile_id),
      month_start: normalizeText(row.month_start),
      status: row.status,
      amount_paid: normalizeNumber(row.amount_paid),
      payment_recorded_at: normalizeNullableText(row.payment_recorded_at),
      reviewed_by: normalizeNullableText(row.reviewed_by),
      reviewed_at: normalizeNullableText(row.reviewed_at),
      review_note: normalizeNullableText(row.review_note),
      created_at: normalizeText(row.created_at),
      registrant_name: registrantName,
      registrant_type: isMember ? 'member' : 'guest',
    } satisfies ClassRegistrationListItem
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
