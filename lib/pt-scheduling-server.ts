import {
  getMemberPhotoPublicUrl,
  type MemberPhotoStorageClient,
} from '@/lib/member-photo-storage'
import {
  type ApprovalRequestStatus,
  buildAssignmentSchedule,
  calculateAttendanceRate,
  DAYS_OF_WEEK,
  getDateRangeBoundsInJamaica,
  getJamaicaDayOfWeek,
  getTrainingPlanFromSchedule,
  JAMAICA_OFFSET,
  getMonthRange,
  normalizeAssignmentSchedule,
  normalizeScheduledDays,
  normalizeSessionTimeValue,
  type PtAssignmentFilters,
  type PtPaymentsReport,
  type RescheduleRequest,
  type SessionUpdateRequest,
  type AssignmentScheduleDay,
  type PtSession,
  type PtSessionChange,
  type PtSessionDetail,
  type PtSessionFilters,
  SESSION_STATUSES,
  type SessionStatus,
  TRAINER_PAYOUT_PER_CLIENT_JMD,
  type TrainerClient,
  type TrainerClientStatus,
} from '@/lib/pt-scheduling'

const TRAINER_CLIENT_SELECT =
  'id, trainer_id, member_id, status, pt_fee, sessions_per_week, scheduled_days, session_time, notes, created_at, updated_at'
const PT_PAYMENT_ASSIGNMENT_SELECT = 'id, trainer_id, member_id, pt_fee, created_at'
const TRAINING_PLAN_DAY_SELECT =
  'id, assignment_id, day_of_week, session_time, training_type_name, created_at, updated_at'
const PT_SESSION_SELECT =
  'id, assignment_id, trainer_id, member_id, scheduled_at, status, is_recurring, notes, created_at, updated_at'
const PT_PAYMENT_SESSION_SELECT = 'assignment_id, status'
const PT_SESSION_CHANGE_SELECT =
  'id, session_id, changed_by, change_type, old_value, new_value, created_at'
const PT_RESCHEDULE_REQUEST_SELECT =
  'id, session_id, requested_by, proposed_at, note, status, reviewed_by, review_note, reviewed_at, created_at, updated_at'
const PT_SESSION_UPDATE_REQUEST_SELECT =
  'id, session_id, requested_by, requested_status, note, status, reviewed_by, review_note, reviewed_at, created_at, updated_at'

type PtSchedulingAdminClient = MemberPhotoStorageClient & {
  from(table: string): any
}

type TrainerClientRow = {
  id: string
  trainer_id: string
  member_id: string
  status: TrainerClientStatus
  pt_fee: number
  sessions_per_week: number
  scheduled_days: string[] | null
  session_time: string
  notes: string | null
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

type PtRescheduleRequestRow = {
  id: string
  session_id: string
  requested_by: string
  proposed_at: string
  note: string | null
  status: ApprovalRequestStatus
  reviewed_by: string | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

type PtSessionUpdateRequestRow = {
  id: string
  session_id: string
  requested_by: string
  requested_status: SessionUpdateRequest['requestedStatus']
  note: string | null
  status: ApprovalRequestStatus
  reviewed_by: string | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

type TrainingPlanDayRow = {
  id: string
  assignment_id: string
  day_of_week: string
  session_time: string
  training_type_name: string | null
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

type MemberNameRow = {
  id: string
  name: string
}

type MemberSummaryRow = {
  id: string
  name: string
  photo_url: string | null
}

type RequestSessionRow = {
  id: string
  trainer_id: string
  member_id: string
  scheduled_at: string
}

type PendingRequestRow = {
  session_id: string
}

type PtPaymentAssignmentRow = {
  id: string
  trainer_id: string
  member_id: string
  pt_fee: number
  created_at: string
}

type PtPaymentSessionRow = {
  assignment_id: string
  status: PtSession['status']
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

function getChangeScheduledAt(value: unknown) {
  const objectValue = normalizeJsonObject(value)
  const scheduledAt = objectValue?.scheduledAt

  return typeof scheduledAt === 'string' ? scheduledAt : null
}

function areEqualTimestampValues(left: string, right: string) {
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return leftTime === rightTime
  }

  return left === right
}

function isNoOpRescheduleChange(row: PtSessionChangeRow) {
  if (row.change_type !== 'reschedule') {
    return false
  }

  const oldScheduledAt = getChangeScheduledAt(row.old_value)
  const newScheduledAt = getChangeScheduledAt(row.new_value)

  if (!oldScheduledAt || !newScheduledAt) {
    return false
  }

  return areEqualTimestampValues(oldScheduledAt, newScheduledAt)
}

function buildLegacyScheduledSessions(row: TrainerClientRow): TrainerClient['scheduledSessions'] {
  const legacySessionTime = normalizeSessionTimeValue(row.session_time) ?? normalizeText(row.session_time)

  return buildAssignmentSchedule(
    normalizeScheduledDays(row.scheduled_days).map((day) => ({
      day,
      sessionTime: legacySessionTime,
    })),
  )
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
  const hydratedMembers = members.map((member) => {
    if (!member.photo_url) {
      return {
        ...member,
        photo_url: null,
      }
    }

    return {
      ...member,
      photo_url: getMemberPhotoPublicUrl(supabase, member.photo_url),
    }
  })

  return new Map(hydratedMembers.map((member) => [member.id, member]))
}

async function loadMemberNames(
  supabase: PtSchedulingAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, MemberNameRow>()
  }

  const { data, error } = await supabase
    .from('members')
    .select('id, name')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read PT member names: ${error.message}`)
  }

  return new Map(((data ?? []) as MemberNameRow[]).map((member) => [member.id, member]))
}

async function hydrateTrainerClients(
  supabase: PtSchedulingAdminClient,
  rows: TrainerClientRow[],
) {
  const trainerIds = Array.from(new Set(rows.map((row) => row.trainer_id)))
  const memberIds = Array.from(new Set(rows.map((row) => row.member_id)))
  const assignmentIds = rows.map((row) => row.id)
  const [trainerById, memberById, scheduledSessionsByAssignmentId] = await Promise.all([
    loadTrainerSummaries(supabase, trainerIds),
    loadMemberSummaries(supabase, memberIds),
    loadScheduledSessionsByAssignmentId(supabase, assignmentIds),
  ])

  return sortAssignments(
    rows.map((row) => {
      const trainer = trainerById.get(row.trainer_id)
      const member = memberById.get(row.member_id)
      const scheduledSessions =
        scheduledSessionsByAssignmentId.get(row.id)?.length
          ? scheduledSessionsByAssignmentId.get(row.id) ?? []
          : buildLegacyScheduledSessions(row)
      const trainingPlan = getTrainingPlanFromSchedule(scheduledSessions)

      return {
        id: row.id,
        trainerId: row.trainer_id,
        memberId: row.member_id,
        status: row.status,
        ptFee: row.pt_fee,
        sessionsPerWeek: row.sessions_per_week,
        scheduledSessions,
        scheduledDays: scheduledSessions.map((entry) => entry.day),
        sessionTime:
          scheduledSessions[0]?.sessionTime ??
          normalizeSessionTimeValue(row.session_time) ??
          normalizeText(row.session_time),
        notes: normalizeNullableText(row.notes),
        trainingPlan,
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
  const assignmentIds = Array.from(new Set(rows.map((row) => row.assignment_id)))
  const sessionIds = rows.map((row) => row.id)
  const [trainerById, memberById, scheduledSessionsByAssignmentId, pendingRequestTypeBySessionId] =
    await Promise.all([
      loadTrainerSummaries(supabase, trainerIds),
      loadMemberSummaries(supabase, memberIds),
      loadScheduledSessionsByAssignmentId(supabase, assignmentIds),
      loadPendingRequestTypeBySessionId(supabase, sessionIds),
    ])

  return sortSessions(
    rows.map((row) => {
      const trainingDay = getJamaicaDayOfWeek(row.scheduled_at)
      const trainingTypeName = trainingDay
        ? (scheduledSessionsByAssignmentId.get(row.assignment_id) ?? []).find(
            (entry) => entry.day === trainingDay,
          )?.trainingTypeName ?? null
        : null

      return {
        id: row.id,
        assignmentId: row.assignment_id,
        trainerId: row.trainer_id,
        memberId: row.member_id,
        scheduledAt: row.scheduled_at,
        status: row.status,
        isRecurring: row.is_recurring,
        notes: normalizeNullableText(row.notes),
        trainingTypeName,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        trainerName: normalizeText(trainerById.get(row.trainer_id)?.name) || undefined,
        memberName: normalizeText(memberById.get(row.member_id)?.name) || undefined,
        memberPhotoUrl: memberById.get(row.member_id)?.photo_url ?? null,
        pendingRequestType: pendingRequestTypeBySessionId.get(row.id) ?? null,
      }
    }),
  )
}

async function loadScheduledSessionsByAssignmentId(
  supabase: PtSchedulingAdminClient,
  assignmentIds: string[],
) {
  if (assignmentIds.length === 0) {
    return new Map<string, TrainerClient['scheduledSessions']>()
  }

  const { data, error } = await supabase
    .from('training_plan_days')
    .select(TRAINING_PLAN_DAY_SELECT)
    .in('assignment_id', assignmentIds)

  if (error) {
    throw new Error(`Failed to read PT assignment schedules: ${error.message}`)
  }

  const scheduleRows = (data ?? []) as TrainingPlanDayRow[]
  const scheduleByAssignmentId = new Map<
    string,
    Array<{ day: string; sessionTime: string; trainingTypeName: string | null }>
  >()

  for (const row of scheduleRows) {
    const existingEntries = scheduleByAssignmentId.get(row.assignment_id) ?? []
    existingEntries.push({
      day: row.day_of_week,
      sessionTime: row.session_time,
      trainingTypeName: row.training_type_name,
    })
    scheduleByAssignmentId.set(row.assignment_id, existingEntries)
  }

  return new Map(
    assignmentIds.map((assignmentId) => [
      assignmentId,
      normalizeAssignmentSchedule(scheduleByAssignmentId.get(assignmentId) ?? []),
    ]),
  )
}

export async function readTrainingPlanDayRowsByAssignmentId(
  supabase: PtSchedulingAdminClient,
  assignmentId: string,
): Promise<TrainingPlanDayRow[]> {
  const { data, error } = await supabase
    .from('training_plan_days')
    .select(TRAINING_PLAN_DAY_SELECT)
    .eq('assignment_id', assignmentId)

  if (error) {
    throw new Error(`Failed to read PT assignment schedule days for ${assignmentId}: ${error.message}`)
  }

  return (data ?? []) as TrainingPlanDayRow[]
}

async function loadRequestSessions(
  supabase: PtSchedulingAdminClient,
  sessionIds: string[],
) {
  if (sessionIds.length === 0) {
    return new Map<string, RequestSessionRow>()
  }

  const { data, error } = await supabase
    .from('pt_sessions')
    .select('id, trainer_id, member_id, scheduled_at')
    .in('id', sessionIds)

  if (error) {
    throw new Error(`Failed to read PT request sessions: ${error.message}`)
  }

  return new Map(((data ?? []) as RequestSessionRow[]).map((row) => [row.id, row]))
}

async function loadPendingRequestTypeBySessionId(
  supabase: PtSchedulingAdminClient,
  sessionIds: string[],
) {
  if (sessionIds.length === 0) {
    return new Map<string, PtSession['pendingRequestType']>()
  }

  const [rescheduleResult, sessionUpdateResult] = await Promise.all([
    supabase
      .from('pt_reschedule_requests')
      .select('session_id')
      .in('session_id', sessionIds)
      .eq('status', 'pending'),
    supabase
      .from('pt_session_update_requests')
      .select('session_id')
      .in('session_id', sessionIds)
      .eq('status', 'pending'),
  ])

  if (rescheduleResult.error) {
    throw new Error(
      `Failed to read pending PT reschedule requests: ${rescheduleResult.error.message}`,
    )
  }

  if (sessionUpdateResult.error) {
    throw new Error(
      `Failed to read pending PT session update requests: ${sessionUpdateResult.error.message}`,
    )
  }

  const pendingRequestTypeBySessionId = new Map<string, PtSession['pendingRequestType']>()

  for (const row of (rescheduleResult.data ?? []) as PendingRequestRow[]) {
    pendingRequestTypeBySessionId.set(row.session_id, 'reschedule')
  }

  for (const row of (sessionUpdateResult.data ?? []) as PendingRequestRow[]) {
    if (!pendingRequestTypeBySessionId.has(row.session_id)) {
      pendingRequestTypeBySessionId.set(row.session_id, 'status_change')
    }
  }

  return pendingRequestTypeBySessionId
}

async function hydrateRescheduleRequests(
  supabase: PtSchedulingAdminClient,
  rows: PtRescheduleRequestRow[],
) {
  const sessionIds = Array.from(new Set(rows.map((row) => row.session_id)))
  const sessionsById = await loadRequestSessions(supabase, sessionIds)
  const profileIds = Array.from(
    new Set(rows.flatMap((row) => [row.requested_by, row.reviewed_by].filter(Boolean) as string[])),
  )
  const trainerIds = Array.from(
    new Set(Array.from(sessionsById.values()).map((session) => session.trainer_id)),
  )
  const memberIds = Array.from(
    new Set(Array.from(sessionsById.values()).map((session) => session.member_id)),
  )
  const [profileById, trainerById, memberById] = await Promise.all([
    loadTrainerSummaries(supabase, profileIds),
    loadTrainerSummaries(supabase, trainerIds),
    loadMemberNames(supabase, memberIds),
  ])

  return rows.map((row) => {
    const session = sessionsById.get(row.session_id)

    return {
      id: row.id,
      sessionId: row.session_id,
      requestedBy: row.requested_by,
      requestedByName: normalizeText(profileById.get(row.requested_by)?.name) || 'Unknown trainer',
      proposedAt: row.proposed_at,
      note: normalizeNullableText(row.note),
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewNote: normalizeNullableText(row.review_note),
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sessionScheduledAt: session?.scheduled_at,
      memberName: normalizeText(memberById.get(session?.member_id ?? '')?.name) || undefined,
      trainerName: normalizeText(trainerById.get(session?.trainer_id ?? '')?.name) || undefined,
    } satisfies RescheduleRequest
  })
}

async function hydrateSessionUpdateRequests(
  supabase: PtSchedulingAdminClient,
  rows: PtSessionUpdateRequestRow[],
) {
  const sessionIds = Array.from(new Set(rows.map((row) => row.session_id)))
  const sessionsById = await loadRequestSessions(supabase, sessionIds)
  const profileIds = Array.from(
    new Set(rows.flatMap((row) => [row.requested_by, row.reviewed_by].filter(Boolean) as string[])),
  )
  const trainerIds = Array.from(
    new Set(Array.from(sessionsById.values()).map((session) => session.trainer_id)),
  )
  const memberIds = Array.from(
    new Set(Array.from(sessionsById.values()).map((session) => session.member_id)),
  )
  const [profileById, trainerById, memberById] = await Promise.all([
    loadTrainerSummaries(supabase, profileIds),
    loadTrainerSummaries(supabase, trainerIds),
    loadMemberNames(supabase, memberIds),
  ])

  return rows.map((row) => {
    const session = sessionsById.get(row.session_id)

    return {
      id: row.id,
      sessionId: row.session_id,
      requestedBy: row.requested_by,
      requestedByName: normalizeText(profileById.get(row.requested_by)?.name) || 'Unknown trainer',
      requestedStatus: row.requested_status,
      note: normalizeNullableText(row.note),
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewNote: normalizeNullableText(row.review_note),
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sessionScheduledAt: session?.scheduled_at,
      memberName: normalizeText(memberById.get(session?.member_id ?? '')?.name) || undefined,
      trainerName: normalizeText(trainerById.get(session?.trainer_id ?? '')?.name) || undefined,
    } satisfies SessionUpdateRequest
  })
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

export async function readPtPaymentsReport(
  supabase: PtSchedulingAdminClient,
  filters: {
    startDate: string
    endDate: string
  },
): Promise<PtPaymentsReport> {
  const sessionRange = getDateRangeBoundsInJamaica(filters.startDate, filters.endDate)

  if (!sessionRange) {
    throw new Error('PT payment report dates must use valid YYYY-MM-DD values.')
  }

  const assignmentCutoff = `${filters.endDate}T23:59:59.999${JAMAICA_OFFSET}`
  const { data: assignmentData, error: assignmentError } = await supabase
    .from('trainer_clients')
    .select(PT_PAYMENT_ASSIGNMENT_SELECT)
    .eq('status', 'active')
    .lte('created_at', assignmentCutoff)

  if (assignmentError) {
    throw new Error(`Failed to read PT payment assignments: ${assignmentError.message}`)
  }

  const assignments = (assignmentData ?? []) as PtPaymentAssignmentRow[]

  if (assignments.length === 0) {
    return {
      summary: {
        totalAssignments: 0,
        totalSessionsCompleted: 0,
        totalPayout: 0,
      },
      trainers: [],
    }
  }

  const trainerIds = Array.from(new Set(assignments.map((assignment) => assignment.trainer_id)))
  const memberIds = Array.from(new Set(assignments.map((assignment) => assignment.member_id)))
  const assignmentIds = assignments.map((assignment) => assignment.id)
  const [trainerById, memberById, sessionsResult] = await Promise.all([
    loadTrainerSummaries(supabase, trainerIds),
    loadMemberNames(supabase, memberIds),
    (async () => {
      const { data, error } = await supabase
        .from('pt_sessions')
        .select(PT_PAYMENT_SESSION_SELECT)
        .in('assignment_id', assignmentIds)
        .gte('scheduled_at', sessionRange.startInclusive)
        .lt('scheduled_at', sessionRange.endExclusive)

      if (error) {
        throw new Error(`Failed to read PT payment sessions: ${error.message}`)
      }

      return (data ?? []) as PtPaymentSessionRow[]
    })(),
  ])

  const attendanceByAssignmentId = new Map<
    string,
    {
      completed: number
      missed: number
    }
  >()

  for (const session of sessionsResult) {
    const currentCounts = attendanceByAssignmentId.get(session.assignment_id) ?? {
      completed: 0,
      missed: 0,
    }

    if (session.status === 'completed') {
      currentCounts.completed += 1
    } else if (session.status === 'missed') {
      currentCounts.missed += 1
    }

    attendanceByAssignmentId.set(session.assignment_id, currentCounts)
  }

  const trainersById = new Map<string, PtPaymentsReport['trainers'][number]>()

  for (const assignment of assignments) {
    const existingTrainer = trainersById.get(assignment.trainer_id)
    const trainerSummary = trainerById.get(assignment.trainer_id)
    const memberSummary = memberById.get(assignment.member_id)
    const attendance = attendanceByAssignmentId.get(assignment.id) ?? {
      completed: 0,
      missed: 0,
    }

    const trainer =
      existingTrainer ??
      ({
        trainerId: assignment.trainer_id,
        trainerName: normalizeText(trainerSummary?.name) || 'Unknown trainer',
        trainerTitles: Array.isArray(trainerSummary?.titles) ? trainerSummary.titles : [],
        activeClients: 0,
        monthlyPayout: 0,
        clients: [],
      } satisfies PtPaymentsReport['trainers'][number])

    trainer.activeClients += 1
    trainer.clients.push({
      memberId: assignment.member_id,
      memberName: normalizeText(memberSummary?.name) || 'Unknown member',
      ptFee: assignment.pt_fee,
      sessionsCompleted: attendance.completed,
      sessionsMissed: attendance.missed,
      attendanceRate: calculateAttendanceRate(attendance.completed, attendance.missed),
    })
    trainersById.set(assignment.trainer_id, trainer)
  }

  const trainers = Array.from(trainersById.values())
    .map((trainer) => ({
      ...trainer,
      monthlyPayout: trainer.activeClients * TRAINER_PAYOUT_PER_CLIENT_JMD,
      clients: [...trainer.clients].sort((left, right) => left.memberName.localeCompare(right.memberName)),
    }))
    .sort((left, right) => left.trainerName.localeCompare(right.trainerName))

  const totalSessionsCompleted = trainers.reduce(
    (sum, trainer) =>
      sum + trainer.clients.reduce((trainerSum, client) => trainerSum + client.sessionsCompleted, 0),
    0,
  )
  const totalPayout = trainers.reduce((sum, trainer) => sum + trainer.monthlyPayout, 0)

  return {
    summary: {
      totalAssignments: assignments.length,
      totalSessionsCompleted,
      totalPayout,
    },
    trainers,
  }
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

  const allowedStatuses = new Set<SessionStatus>(SESSION_STATUSES)

  if (filters.status === 'active') {
    allowedStatuses.delete('cancelled')
  } else if (filters.status) {
    allowedStatuses.clear()
    allowedStatuses.add(filters.status)
  }

  if (filters.past === 'true') {
    query = query.lt('scheduled_at', new Date().toISOString())
    allowedStatuses.delete('scheduled')
  }

  if (allowedStatuses.size === 0) {
    return []
  }

  if (allowedStatuses.size === 1) {
    query = query.eq('status', Array.from(allowedStatuses)[0])
  } else if (allowedStatuses.size < SESSION_STATUSES.length) {
    query = query.in('status', Array.from(allowedStatuses))
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

  const rows = ((data ?? []) as PtSessionChangeRow[]).filter(
    (row) => !isNoOpRescheduleChange(row),
  )
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

export async function readPtRescheduleRequestRowById(
  supabase: PtSchedulingAdminClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('pt_reschedule_requests')
    .select(PT_RESCHEDULE_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read the PT reschedule request ${id}: ${error.message}`)
  }

  return (data as PtRescheduleRequestRow | null) ?? null
}

export async function readPtRescheduleRequests(
  supabase: PtSchedulingAdminClient,
  filters: {
    sessionId?: string
    status?: ApprovalRequestStatus
    id?: string
    requestedBy?: string
  } = {},
) {
  let query = supabase
    .from('pt_reschedule_requests')
    .select(PT_RESCHEDULE_REQUEST_SELECT)
    .order('created_at', { ascending: false })

  if (filters.id) {
    query = query.eq('id', filters.id)
  }

  if (filters.sessionId) {
    query = query.eq('session_id', filters.sessionId)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.requestedBy) {
    query = query.eq('requested_by', filters.requestedBy)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read PT reschedule requests: ${error.message}`)
  }

  return hydrateRescheduleRequests(supabase, (data ?? []) as PtRescheduleRequestRow[])
}

export async function readPtSessionUpdateRequestRowById(
  supabase: PtSchedulingAdminClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('pt_session_update_requests')
    .select(PT_SESSION_UPDATE_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read the PT session update request ${id}: ${error.message}`)
  }

  return (data as PtSessionUpdateRequestRow | null) ?? null
}

export async function readPtSessionUpdateRequests(
  supabase: PtSchedulingAdminClient,
  filters: {
    sessionId?: string
    status?: ApprovalRequestStatus
    id?: string
    requestedBy?: string
  } = {},
) {
  let query = supabase
    .from('pt_session_update_requests')
    .select(PT_SESSION_UPDATE_REQUEST_SELECT)
    .order('created_at', { ascending: false })

  if (filters.id) {
    query = query.eq('id', filters.id)
  }

  if (filters.sessionId) {
    query = query.eq('session_id', filters.sessionId)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.requestedBy) {
    query = query.eq('requested_by', filters.requestedBy)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read PT session update requests: ${error.message}`)
  }

  return hydrateSessionUpdateRequests(supabase, (data ?? []) as PtSessionUpdateRequestRow[])
}
