import {
  createMemberPhotoSignedUrl,
  type MemberPhotoStorageClient,
} from '@/lib/member-photo-storage'
import {
  DAYS_OF_WEEK,
  getMonthRange,
  normalizeScheduledDays,
  normalizeSessionTimeValue,
  type PtAssignmentFilters,
  type PtSession,
  type PtSessionChange,
  type PtSessionDetail,
  type PtSessionFilters,
  type TrainerClient,
  type TrainerClientStatus,
} from '@/lib/pt-scheduling'

const TRAINER_CLIENT_SELECT =
  'id, trainer_id, member_id, status, pt_fee, trainer_payout, sessions_per_week, scheduled_days, session_time, created_at, updated_at'
const PT_SESSION_SELECT =
  'id, assignment_id, trainer_id, member_id, scheduled_at, status, is_recurring, notes, created_at, updated_at'
const PT_SESSION_CHANGE_SELECT =
  'id, session_id, changed_by, change_type, old_value, new_value, created_at'

type PtSchedulingAdminClient = MemberPhotoStorageClient & {
  from(table: string): any
}

type TrainerClientRow = {
  id: string
  trainer_id: string
  member_id: string
  status: TrainerClientStatus
  pt_fee: number
  trainer_payout: number
  sessions_per_week: number
  scheduled_days: string[] | null
  session_time: string
  created_at: string
  updated_at: string
}

type PtSessionRow = {
  id: string
  assignment_id: string
  trainer_id: string
  member_id: string
  scheduled_at: string
  status: PtSession['status']
  is_recurring: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type PtSessionChangeRow = {
  id: string
  session_id: string
  changed_by: string
  change_type: PtSessionChange['changeType']
  old_value: unknown
  new_value: unknown
  created_at: string
}

type TrainerSummaryRow = {
  id: string
  name: string
  titles: string[] | null
}

type MemberSummaryRow = {
  id: string
  name: string
  photo_url: string | null
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeJsonObject(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function sortAssignments(assignments: TrainerClient[]) {
  return [...assignments].sort((left, right) => {
    const memberNameComparison = (left.memberName ?? '').localeCompare(right.memberName ?? '')

    if (memberNameComparison !== 0) {
      return memberNameComparison
    }

    return (left.trainerName ?? '').localeCompare(right.trainerName ?? '')
  })
}

function sortSessions(sessions: PtSession[]) {
  return [...sessions].sort((left, right) => {
    const timeComparison = left.scheduledAt.localeCompare(right.scheduledAt)

    if (timeComparison !== 0) {
      return timeComparison
    }

    return left.id.localeCompare(right.id)
  })
}

async function loadTrainerSummaries(
  supabase: PtSchedulingAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, TrainerSummaryRow>()
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, titles')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read PT trainer profiles: ${error.message}`)
  }

  return new Map(
    ((data ?? []) as TrainerSummaryRow[]).map((profile) => [profile.id, profile]),
  )
}

async function loadMemberSummaries(
  supabase: PtSchedulingAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, MemberSummaryRow>()
  }

  const { data, error } = await supabase
    .from('members')
    .select('id, name, photo_url')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read PT member records: ${error.message}`)
  }

  const members = (data ?? []) as MemberSummaryRow[]
  const hydratedMembers = await Promise.all(
    members.map(async (member) => {
      if (!member.photo_url) {
        return {
          ...member,
          photo_url: null,
        }
      }

      try {
        const signedUrl = await createMemberPhotoSignedUrl(supabase, member.photo_url)

        return {
          ...member,
          photo_url: signedUrl,
        }
      } catch (error) {
        console.error('Failed to sign PT member photo URL:', error)

        return {
          ...member,
          photo_url: null,
        }
      }
    }),
  )

  return new Map(hydratedMembers.map((member) => [member.id, member]))
}

async function hydrateTrainerClients(
  supabase: PtSchedulingAdminClient,
  rows: TrainerClientRow[],
) {
  const trainerIds = Array.from(new Set(rows.map((row) => row.trainer_id)))
  const memberIds = Array.from(new Set(rows.map((row) => row.member_id)))
  const [trainerById, memberById] = await Promise.all([
    loadTrainerSummaries(supabase, trainerIds),
    loadMemberSummaries(supabase, memberIds),
  ])

  return sortAssignments(
    rows.map((row) => {
      const trainer = trainerById.get(row.trainer_id)
      const member = memberById.get(row.member_id)

      return {
        id: row.id,
        trainerId: row.trainer_id,
        memberId: row.member_id,
        status: row.status,
        ptFee: row.pt_fee,
        trainerPayout: row.trainer_payout,
        sessionsPerWeek: row.sessions_per_week,
        scheduledDays: normalizeScheduledDays(row.scheduled_days),
        sessionTime: normalizeSessionTimeValue(row.session_time) ?? normalizeText(row.session_time),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        trainerName: normalizeText(trainer?.name) || undefined,
        trainerTitles: Array.isArray(trainer?.titles) ? trainer.titles : [],
        memberName: normalizeText(member?.name) || undefined,
        memberPhotoUrl: member?.photo_url ?? null,
      } satisfies TrainerClient
    }),
  )
}

async function hydratePtSessions(
  supabase: PtSchedulingAdminClient,
  rows: PtSessionRow[],
) {
  const trainerIds = Array.from(new Set(rows.map((row) => row.trainer_id)))
  const memberIds = Array.from(new Set(rows.map((row) => row.member_id)))
  const [trainerById, memberById] = await Promise.all([
    loadTrainerSummaries(supabase, trainerIds),
    loadMemberSummaries(supabase, memberIds),
  ])

  return sortSessions(
    rows.map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      trainerId: row.trainer_id,
      memberId: row.member_id,
      scheduledAt: row.scheduled_at,
      status: row.status,
      isRecurring: row.is_recurring,
      notes: normalizeNullableText(row.notes),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      trainerName: normalizeText(trainerById.get(row.trainer_id)?.name) || undefined,
      memberName: normalizeText(memberById.get(row.member_id)?.name) || undefined,
    })),
  )
}

export async function readTrainerClientRowById(
  supabase: PtSchedulingAdminClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(TRAINER_CLIENT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read PT assignment ${id}: ${error.message}`)
  }

  return (data as TrainerClientRow | null) ?? null
}

export async function readTrainerClients(
  supabase: PtSchedulingAdminClient,
  filters: PtAssignmentFilters & { id?: string } = {},
) {
  let query = supabase
    .from('trainer_clients')
    .select(TRAINER_CLIENT_SELECT)
    .order('created_at', { ascending: false })

  if (filters.id) {
    query = query.eq('id', filters.id)
  }

  if (filters.trainerId) {
    query = query.eq('trainer_id', filters.trainerId)
  }

  if (filters.memberId) {
    query = query.eq('member_id', filters.memberId)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read PT assignments: ${error.message}`)
  }

  return hydrateTrainerClients(supabase, (data ?? []) as TrainerClientRow[])
}

export async function readTrainerClientById(
  supabase: PtSchedulingAdminClient,
  id: string,
) {
  const assignments = await readTrainerClients(supabase, { id })

  return assignments[0] ?? null
}

export async function readPtSessionRowById(
  supabase: PtSchedulingAdminClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('pt_sessions')
    .select(PT_SESSION_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read PT session ${id}: ${error.message}`)
  }

  return (data as PtSessionRow | null) ?? null
}

export async function readPtSessions(
  supabase: PtSchedulingAdminClient,
  filters: PtSessionFilters & { id?: string } = {},
) {
  let query = supabase
    .from('pt_sessions')
    .select(PT_SESSION_SELECT)
    .order('scheduled_at', { ascending: true })

  if (filters.id) {
    query = query.eq('id', filters.id)
  }

  if (filters.trainerId) {
    query = query.eq('trainer_id', filters.trainerId)
  }

  if (filters.memberId) {
    query = query.eq('member_id', filters.memberId)
  }

  if (filters.assignmentId) {
    query = query.eq('assignment_id', filters.assignmentId)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.month) {
    const monthParts = /^(\d{4})-(\d{2})$/u.exec(filters.month)

    if (!monthParts) {
      throw new Error('Month filters must use the YYYY-MM format.')
    }

    const [, yearPart, monthPart] = monthParts
    const monthRange = getMonthRange(Number(monthPart), Number(yearPart))

    if (!monthRange) {
      throw new Error('Month filters must use a valid calendar month.')
    }

    query = query
      .gte('scheduled_at', monthRange.startInclusive)
      .lt('scheduled_at', monthRange.endExclusive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read PT sessions: ${error.message}`)
  }

  return hydratePtSessions(supabase, (data ?? []) as PtSessionRow[])
}

export async function readPtSessionChanges(
  supabase: PtSchedulingAdminClient,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from('pt_session_changes')
    .select(PT_SESSION_CHANGE_SELECT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read PT session history for ${sessionId}: ${error.message}`)
  }

  const rows = (data ?? []) as PtSessionChangeRow[]
  const profileIds = Array.from(new Set(rows.map((row) => row.changed_by)))
  const profileById = await loadTrainerSummaries(supabase, profileIds)

  return rows.map(
    (row) =>
      ({
        id: row.id,
        sessionId: row.session_id,
        changedBy: row.changed_by,
        changeType: row.change_type,
        oldValue: normalizeJsonObject(row.old_value),
        newValue: normalizeJsonObject(row.new_value),
        createdAt: row.created_at,
        changedByName: normalizeText(profileById.get(row.changed_by)?.name) || undefined,
      }) satisfies PtSessionChange,
  )
}

export async function readPtSessionDetail(
  supabase: PtSchedulingAdminClient,
  id: string,
): Promise<PtSessionDetail | null> {
  const sessions = await readPtSessions(supabase, { id })
  const session = sessions[0] ?? null

  if (!session) {
    return null
  }

  const changes = await readPtSessionChanges(supabase, id)

  return {
    session,
    changes,
  }
}
