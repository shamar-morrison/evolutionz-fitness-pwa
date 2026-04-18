import { z } from 'zod'
import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import { normalizeTimeInputValue } from '@/lib/member-access-time'

export { JAMAICA_OFFSET, JAMAICA_TIME_ZONE }
export const SESSION_STATUSES = ['scheduled', 'completed', 'missed', 'rescheduled', 'cancelled'] as const
export type SessionStatus = typeof SESSION_STATUSES[number]
export const PT_SESSION_FILTER_STATUSES = ['active', ...SESSION_STATUSES] as const
export type PtSessionFilterStatus = typeof PT_SESSION_FILTER_STATUSES[number]

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const
export type DayOfWeek = typeof DAYS_OF_WEEK[number]

export const PREDEFINED_TRAINING_TYPES = [
  'Cardio',
  'Strength',
  'Lower Body',
  'Upper Body',
  'Legs',
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Core',
  'HIIT',
  'Flexibility & Mobility',
  'Recovery',
  'Full Body',
] as const

export const PT_ASSIGNMENT_STATUSES = ['active', 'inactive'] as const
export type TrainerClientStatus = typeof PT_ASSIGNMENT_STATUSES[number]

export const TRAINER_PAYOUT_PER_CLIENT_JMD = 10500
export const DEFAULT_PT_SESSION_TIME = '07:00'
export const DEFAULT_PT_SESSIONS_PER_WEEK = 3
export const MAX_PT_SESSIONS_PER_WEEK = 7

export type TrainingPlanDay = {
  id: string
  assignmentId: string
  dayOfWeek: DayOfWeek
  sessionTime: string
  trainingTypeName: string | null
  createdAt: string
  updatedAt: string
}

export type DayTrainingPlan = {
  day: DayOfWeek
  trainingTypeName: string
  isCustom: boolean
}

export type AssignmentTrainingPlanInput = {
  day: DayOfWeek
  trainingTypeName: string
}

export type ScheduledSessionInput = {
  day: DayOfWeek
  sessionTime: string
}

export type AssignmentScheduleDay = {
  day: DayOfWeek
  sessionTime: string
  trainingTypeName: string | null
  isCustom: boolean
}

export type TrainerClient = {
  id: string
  trainerId: string
  memberId: string
  status: 'active' | 'inactive'
  ptFee: number
  sessionsPerWeek: number
  scheduledSessions: AssignmentScheduleDay[]
  scheduledDays: DayOfWeek[]
  sessionTime: string
  notes: string | null
  trainingPlan: DayTrainingPlan[]
  createdAt: string
  updatedAt: string
  trainerName?: string
  trainerTitles?: string[]
  memberName?: string
  memberPhotoUrl?: string | null
}

export type PendingRequestType = 'reschedule' | 'status_change'
export type SessionUpdateRequestedStatus = 'completed' | 'missed' | 'cancelled'

export type PtSession = {
  id: string
  assignmentId: string
  trainerId: string
  memberId: string
  scheduledAt: string
  status: SessionStatus
  isRecurring: boolean
  notes: string | null
  trainingTypeName: string | null
  createdAt: string
  updatedAt: string
  trainerName?: string
  memberName?: string
  memberPhotoUrl?: string | null
  pendingRequestType: PendingRequestType | null
}

export type PtSessionChangeType = 'reschedule' | 'cancellation' | 'status_change'

export type PtSessionChange = {
  id: string
  sessionId: string
  changedBy: string
  changeType: PtSessionChangeType
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  createdAt: string
  changedByName?: string
}

export type PtSessionDetail = {
  session: PtSession
  changes: PtSessionChange[]
}

export type ApprovalRequestStatus = 'pending' | 'approved' | 'denied'

export type RescheduleRequest = {
  id: string
  sessionId: string
  requestedBy: string
  requestedByName: string
  proposedAt: string
  note: string | null
  status: ApprovalRequestStatus
  reviewedBy: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  sessionScheduledAt?: string
  memberName?: string
  trainerName?: string
}

export type SessionUpdateRequest = {
  id: string
  sessionId: string
  requestedBy: string
  requestedByName: string
  requestedStatus: SessionUpdateRequestedStatus
  note: string | null
  status: ApprovalRequestStatus
  reviewedBy: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  sessionScheduledAt?: string
  memberName?: string
  trainerName?: string
}

export type Notification = {
  id: string
  recipientId: string
  type:
    | 'reschedule_request'
    | 'member_create_request'
    | 'member_edit_request'
    | 'member_payment_request'
    | 'member_extension_request'
    | 'member_pause_request'
    | 'reschedule_approved'
    | 'reschedule_denied'
    | 'client_assigned'
    | 'status_change_request'
    | 'status_change_approved'
    | 'status_change_denied'
  title: string
  body: string
  read: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type PtPaymentsReportSummary = {
  totalAssignments: number
  totalSessionsCompleted: number
  totalPayout: number
}

export type PtPaymentsReportClient = {
  memberId: string
  memberName: string
  ptFee: number
  sessionsCompleted: number
  sessionsMissed: number
  attendanceRate: number
}

export type PtPaymentsReportTrainer = {
  trainerId: string
  trainerName: string
  trainerTitles: string[]
  activeClients: number
  monthlyPayout: number
  clients: PtPaymentsReportClient[]
}

export type PtPaymentsReport = {
  summary: PtPaymentsReportSummary
  trainers: PtPaymentsReportTrainer[]
}

export type PtAssignmentFilters = {
  trainerId?: string
  memberId?: string
  status?: TrainerClientStatus
}

export type PtSessionFilters = {
  trainerId?: string
  memberId?: string
  assignmentId?: string
  month?: string
  status?: PtSessionFilterStatus
  past?: 'true'
}

export type CreatePtAssignmentData = {
  trainerId: string
  memberId: string
  ptFee: number
  sessionsPerWeek: number
  scheduledSessions: ScheduledSessionInput[]
  trainingPlan?: AssignmentTrainingPlanInput[]
  notes?: string | null
}

export type UpdatePtAssignmentData = {
  status?: TrainerClientStatus
  ptFee?: number
  sessionsPerWeek?: number
  scheduledSessions?: ScheduledSessionInput[]
  trainingPlan?: AssignmentTrainingPlanInput[]
  notes?: string | null
}

export type GeneratePtSessionsRequest = {
  month: number
  year: number
  override?: boolean
}

export type GeneratePtSessionsResult =
  | {
      ok: true
      generated: number
      skipped: number
    }
  | {
      ok: false
      code: 'WEEK_LIMIT_EXCEEDED'
      weeks: string[]
    }

export type UpdatePtSessionData = {
  status?: SessionStatus
  scheduledAt?: string
  notes?: string | null
}

export type CreateRescheduleRequestData = {
  proposedAt: string
  note?: string | null
}

export type ReviewRescheduleRequestData = {
  status: 'approved' | 'denied'
  proposedAt?: string
  reviewNote?: string | null
}

export type MarkPtSessionData =
  | {
      requestedStatus: SessionUpdateRequestedStatus
      status?: SessionUpdateRequestedStatus
      note?: string | null
    }
  | {
      status: SessionUpdateRequestedStatus
      requestedStatus?: SessionUpdateRequestedStatus
      note?: string | null
    }

export type ApprovalRequestFilters = {
  status?: ApprovalRequestStatus
  requestedBy?: 'me'
}

export type ReviewSessionUpdateRequestData = {
  status: 'approved' | 'denied'
  reviewNote?: string | null
}

const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u
const MONTH_VALUE_PATTERN = /^(\d{4})-(\d{2})$/u
const LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/u
const OFFSET_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u

const trainerClientSchema = z.object({
  id: z.string().trim().min(1),
  trainerId: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  status: z.enum(PT_ASSIGNMENT_STATUSES),
  ptFee: z.number().int(),
  sessionsPerWeek: z.number().int().min(1).max(MAX_PT_SESSIONS_PER_WEEK),
  scheduledSessions: z
    .array(
      z.object({
        day: z.enum(DAYS_OF_WEEK),
        sessionTime: z.string().trim().min(1),
        trainingTypeName: z.string().trim().min(1).nullable(),
        isCustom: z.boolean(),
      }),
    )
    .default([]),
  scheduledDays: z.array(z.enum(DAYS_OF_WEEK)),
  sessionTime: z.string().trim().min(1),
  notes: z.string().nullable(),
  trainingPlan: z
    .array(
      z.object({
        day: z.enum(DAYS_OF_WEEK),
        trainingTypeName: z.string().trim().min(1),
        isCustom: z.boolean(),
      }),
    )
    .default([]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  trainerName: z.string().trim().min(1).optional(),
  trainerTitles: z.array(z.string()).optional(),
  memberName: z.string().trim().min(1).optional(),
  memberPhotoUrl: z.string().trim().min(1).nullable().optional(),
})

const ptSessionSchema = z.object({
  id: z.string().trim().min(1),
  assignmentId: z.string().trim().min(1),
  trainerId: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  scheduledAt: z.string().trim().min(1),
  status: z.enum(SESSION_STATUSES),
  isRecurring: z.boolean(),
  notes: z.string().nullable(),
  trainingTypeName: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  trainerName: z.string().trim().min(1).optional(),
  memberName: z.string().trim().min(1).optional(),
  memberPhotoUrl: z.string().trim().min(1).nullable().optional(),
  pendingRequestType: z.enum(['reschedule', 'status_change']).nullable(),
})

const ptSessionChangeSchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  changedBy: z.string().trim().min(1),
  changeType: z.enum(['reschedule', 'cancellation', 'status_change']),
  oldValue: z.record(z.unknown()).nullable(),
  newValue: z.record(z.unknown()).nullable(),
  createdAt: z.string().trim().min(1),
  changedByName: z.string().trim().min(1).optional(),
})

const assignmentsResponseSchema = z.object({
  assignments: z.array(trainerClientSchema).default([]),
})

const assignmentMutationResponseSchema = z.object({
  ok: z.literal(true),
  assignment: trainerClientSchema,
})

const assignmentDeleteResponseSchema = z.object({
  ok: z.literal(true),
  cancelledSessions: z.number().int().nonnegative(),
})

const sessionsResponseSchema = z.object({
  sessions: z.array(ptSessionSchema).default([]),
})

const sessionMutationResponseSchema = z.object({
  ok: z.literal(true),
  session: ptSessionSchema,
})

const sessionDetailResponseSchema = z.object({
  ok: z.literal(true),
  session: ptSessionSchema,
  changes: z.array(ptSessionChangeSchema).default([]),
})

const rescheduleRequestSchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().min(1),
  proposedAt: z.string().trim().min(1),
  note: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'denied']),
  reviewedBy: z.string().trim().min(1).nullable(),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  sessionScheduledAt: z.string().trim().min(1).optional(),
  memberName: z.string().trim().min(1).optional(),
  trainerName: z.string().trim().min(1).optional(),
})

const sessionUpdateRequestSchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().min(1),
  requestedStatus: z.enum(['completed', 'missed', 'cancelled']),
  note: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'denied']),
  reviewedBy: z.string().trim().min(1).nullable(),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  sessionScheduledAt: z.string().trim().min(1).optional(),
  memberName: z.string().trim().min(1).optional(),
  trainerName: z.string().trim().min(1).optional(),
})

const notificationSchema = z.object({
  id: z.string().trim().min(1),
  recipientId: z.string().trim().min(1),
  type: z.enum([
    'reschedule_request',
    'member_create_request',
    'member_edit_request',
    'member_payment_request',
    'member_extension_request',
    'member_pause_request',
    'reschedule_approved',
    'reschedule_denied',
    'client_assigned',
    'status_change_request',
    'status_change_approved',
    'status_change_denied',
  ]),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  read: z.boolean(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string().trim().min(1),
})

const rescheduleRequestsResponseSchema = z.object({
  requests: z.array(rescheduleRequestSchema).default([]),
})

const rescheduleRequestMutationResponseSchema = z.object({
  ok: z.literal(true),
  request: rescheduleRequestSchema,
})

const sessionUpdateRequestsResponseSchema = z.object({
  requests: z.array(sessionUpdateRequestSchema).default([]),
})

const sessionUpdateRequestMutationResponseSchema = z.object({
  ok: z.literal(true),
  request: sessionUpdateRequestSchema,
})

const markPtSessionResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(true),
    pending: z.literal(true),
  }),
])

const ptPaymentsReportResponseSchema = z.object({
  summary: z.object({
    totalAssignments: z.number().int().nonnegative(),
    totalSessionsCompleted: z.number().int().nonnegative(),
    totalPayout: z.number().int().nonnegative(),
  }),
  trainers: z
    .array(
      z.object({
        trainerId: z.string().trim().min(1),
        trainerName: z.string().trim().min(1),
        trainerTitles: z.array(z.string()).default([]),
        activeClients: z.number().int().nonnegative(),
        monthlyPayout: z.number().int().nonnegative(),
        clients: z
          .array(
            z.object({
              memberId: z.string().trim().min(1),
              memberName: z.string().trim().min(1),
              ptFee: z.number().int().nonnegative(),
              sessionsCompleted: z.number().int().nonnegative(),
              sessionsMissed: z.number().int().nonnegative(),
              attendanceRate: z.number().int().min(0).max(100),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
})

const generateSessionsSuccessSchema = z.object({
  ok: z.literal(true),
  generated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})

const generateSessionsWarningSchema = z.object({
  ok: z.literal(false),
  code: z.literal('WEEK_LIMIT_EXCEEDED'),
  weeks: z.array(z.string()).default([]),
})

const errorResponseSchema = z.object({
  ok: z.literal(false).optional(),
  error: z.string().trim().min(1),
  code: z.string().trim().optional(),
})

const predefinedTrainingTypeSet = new Set<string>(PREDEFINED_TRAINING_TYPES)

const sessionStatusBadgeClassNames: Record<SessionStatus, string> = {
  scheduled: 'bg-slate-500/15 text-slate-700 hover:bg-slate-500/25',
  completed: 'bg-green-500/15 text-green-700 hover:bg-green-500/25',
  missed: 'bg-red-500/15 text-red-700 hover:bg-red-500/25',
  rescheduled: 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25',
  cancelled: 'bg-zinc-500/15 text-zinc-700 hover:bg-zinc-500/25',
}

const sessionStatusLabels: Record<SessionStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  missed: 'Missed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
}

const dayToWeekdayIndex: Record<DayOfWeek, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 0,
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSearchParams(filters: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  return searchParams
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  const parsed = errorResponseSchema.safeParse(payload)

  return parsed.success ? parsed.data.error : fallback
}

function getUtcDateFromDateValue(value: string) {
  const match = DATE_VALUE_PATTERN.exec(value.trim())

  if (!match) {
    return null
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const day = Number(dayPart)
  const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function getDatePartsInTimeZone(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-JM',
) {
  const formatter = new Intl.DateTimeFormat(locale, options)
  const values = new Map<string, string>()

  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'literal') {
      continue
    }

    values.set(part.type, part.value)
  }

  return values
}

function getMonthName(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleDateString('en-JM', {
    timeZone: 'UTC',
    month: 'long',
  })
}

export function isDateValue(value: string) {
  return Boolean(getUtcDateFromDateValue(value))
}

export function isDayOfWeek(value: string | null | undefined): value is DayOfWeek {
  return DAYS_OF_WEEK.includes(value as DayOfWeek)
}

export function normalizeScheduledDays(value: unknown): DayOfWeek[] {
  if (!Array.isArray(value)) {
    return []
  }

  const uniqueDays = new Set(
    value.filter((entry): entry is DayOfWeek => typeof entry === 'string' && isDayOfWeek(entry)),
  )

  return DAYS_OF_WEEK.filter((day) => uniqueDays.has(day))
}

export function normalizeScheduledSessions(value: unknown): ScheduledSessionInput[] {
  if (!Array.isArray(value)) {
    return []
  }

  const scheduledSessionByDay = new Map<DayOfWeek, string>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue
    }

    const day = 'day' in entry && isDayOfWeek(entry.day as string) ? (entry.day as DayOfWeek) : null
    const sessionTime =
      'sessionTime' in entry && typeof entry.sessionTime === 'string'
        ? normalizeSessionTimeValue(entry.sessionTime)
        : null

    if (!day || !sessionTime) {
      continue
    }

    scheduledSessionByDay.set(day, sessionTime)
  }

  return DAYS_OF_WEEK.flatMap((day) => {
    const sessionTime = scheduledSessionByDay.get(day)

    return sessionTime
      ? [
          {
            day,
            sessionTime,
          },
        ]
      : []
  })
}

export function isPredefinedTrainingType(value: string) {
  return predefinedTrainingTypeSet.has(value.trim())
}

export function normalizeTrainingPlan(value: unknown): DayTrainingPlan[] {
  if (!Array.isArray(value)) {
    return []
  }

  const trainingTypeByDay = new Map<DayOfWeek, string>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue
    }

    const day = 'day' in entry && isDayOfWeek(entry.day as string) ? (entry.day as DayOfWeek) : null
    const trainingTypeName =
      'trainingTypeName' in entry && typeof entry.trainingTypeName === 'string'
        ? entry.trainingTypeName.trim()
        : ''

    if (!day || !trainingTypeName) {
      continue
    }

    trainingTypeByDay.set(day, trainingTypeName)
  }

  return DAYS_OF_WEEK.flatMap((day) => {
    const trainingTypeName = trainingTypeByDay.get(day)

    return trainingTypeName
      ? [
          {
            day,
            trainingTypeName,
            isCustom: !isPredefinedTrainingType(trainingTypeName),
          },
        ]
      : []
  })
}

export function normalizeAssignmentTrainingPlan(value: unknown): AssignmentTrainingPlanInput[] {
  return normalizeTrainingPlan(value).map(({ day, trainingTypeName }) => ({
    day,
    trainingTypeName,
  }))
}

export function normalizeAssignmentSchedule(value: unknown): AssignmentScheduleDay[] {
  if (!Array.isArray(value)) {
    return []
  }

  const scheduleByDay = new Map<
    DayOfWeek,
    {
      sessionTime: string
      trainingTypeName: string | null
    }
  >()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue
    }

    const day = 'day' in entry && isDayOfWeek(entry.day as string) ? (entry.day as DayOfWeek) : null
    const sessionTime =
      'sessionTime' in entry && typeof entry.sessionTime === 'string'
        ? normalizeSessionTimeValue(entry.sessionTime)
        : null
    const trainingTypeName =
      'trainingTypeName' in entry && typeof entry.trainingTypeName === 'string'
        ? entry.trainingTypeName.trim() || null
        : null

    if (!day || !sessionTime) {
      continue
    }

    scheduleByDay.set(day, {
      sessionTime,
      trainingTypeName,
    })
  }

  return DAYS_OF_WEEK.flatMap((day) => {
    const entry = scheduleByDay.get(day)

    return entry
      ? [
          {
            day,
            sessionTime: entry.sessionTime,
            trainingTypeName: entry.trainingTypeName,
            isCustom: entry.trainingTypeName ? !isPredefinedTrainingType(entry.trainingTypeName) : false,
          },
        ]
      : []
  })
}

export function buildAssignmentSchedule(
  scheduledSessionsValue: unknown,
  trainingPlanValue: unknown = [],
): AssignmentScheduleDay[] {
  const trainingTypeByDay = new Map<DayOfWeek, string>(
    normalizeAssignmentTrainingPlan(trainingPlanValue).map((entry) => [entry.day, entry.trainingTypeName]),
  )

  return normalizeScheduledSessions(scheduledSessionsValue).map(({ day, sessionTime }) => {
    const trainingTypeName = trainingTypeByDay.get(day) ?? null

    return {
      day,
      sessionTime,
      trainingTypeName,
      isCustom: trainingTypeName ? !isPredefinedTrainingType(trainingTypeName) : false,
    }
  })
}

export function getTrainingPlanFromSchedule(value: unknown): DayTrainingPlan[] {
  return normalizeAssignmentSchedule(value).flatMap((entry) =>
    entry.trainingTypeName
      ? [
          {
            day: entry.day,
            trainingTypeName: entry.trainingTypeName,
            isCustom: entry.isCustom,
          },
        ]
      : [],
  )
}

export function getTrainingTypeForDay(trainingPlan: DayTrainingPlan[], day: DayOfWeek) {
  return normalizeTrainingPlan(trainingPlan).find((entry) => entry.day === day)?.trainingTypeName ?? null
}

export function normalizeSessionTimeValue(value: string) {
  const normalizedTime = normalizeTimeInputValue(value)

  return normalizedTime ? normalizedTime.slice(0, 5) : null
}

export function formatSessionTime(value: string) {
  const normalizedTime = normalizeSessionTimeValue(value)

  if (!normalizedTime) {
    return value
  }

  const date = new Date(`2026-01-01T${normalizedTime}:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return normalizedTime
  }

  return date.toLocaleTimeString('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDayOfWeekShort(day: DayOfWeek) {
  return day.slice(0, 3)
}

export function getJamaicaDayOfWeek(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: JAMAICA_TIME_ZONE,
    weekday: 'long',
  }).format(date)

  return isDayOfWeek(day) ? day : null
}

export function formatScheduleSummary(
  scheduledDays: DayOfWeek[],
  sessionTime: string,
  sessionsPerWeek?: number,
): string
export function formatScheduleSummary(
  scheduledSessions: ScheduledSessionInput[] | AssignmentScheduleDay[],
  sessionsPerWeek?: number,
): string
export function formatScheduleSummary(
  scheduleOrDays: DayOfWeek[] | ScheduledSessionInput[] | AssignmentScheduleDay[],
  sessionTimeOrSessionsPerWeek?: string | number,
  maybeSessionsPerWeek?: number,
) {
  const scheduledSessions =
    typeof scheduleOrDays[0] === 'string'
      ? normalizeScheduledDays(scheduleOrDays).flatMap((day) => {
          const sessionTime =
            typeof sessionTimeOrSessionsPerWeek === 'string'
              ? normalizeSessionTimeValue(sessionTimeOrSessionsPerWeek)
              : null

          return sessionTime
            ? [
                {
                  day,
                  sessionTime,
                },
              ]
            : []
        })
      : normalizeScheduledSessions(scheduleOrDays)
  const sessionsPerWeek =
    typeof sessionTimeOrSessionsPerWeek === 'number' ? sessionTimeOrSessionsPerWeek : maybeSessionsPerWeek
  const frequencySummary =
    typeof sessionsPerWeek === 'number' && sessionsPerWeek > 0 ? ` (${sessionsPerWeek}x/week)` : ''

  if (scheduledSessions.length === 0) {
    return frequencySummary ? frequencySummary.slice(1, -1) : ''
  }

  const timeGroups = new Map<string, DayOfWeek[]>()

  for (const { day, sessionTime } of scheduledSessions) {
    const existingDays = timeGroups.get(sessionTime) ?? []
    existingDays.push(day)
    timeGroups.set(sessionTime, existingDays)
  }

  if (timeGroups.size === 1) {
    const [{ sessionTime }] = scheduledSessions
    const daySummary = scheduledSessions.map(({ day }) => formatDayOfWeekShort(day)).join(', ')

    return `${daySummary} at ${formatSessionTime(sessionTime)}${frequencySummary}`
  }

  const scheduleSummary = scheduledSessions
    .map(({ day, sessionTime }) => `${formatDayOfWeekShort(day)} ${formatSessionTime(sessionTime)}`)
    .join(', ')

  return `${scheduleSummary}${frequencySummary}`
}

export function formatJmdCurrency(value: number) {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function calculateAttendanceRate(completedCount: number, missedCount: number) {
  const trackedTotal = completedCount + missedCount

  if (trackedTotal === 0) {
    return 0
  }

  return Math.round((completedCount / trackedTotal) * 100)
}

export function formatPtSessionStatusLabel(status: SessionStatus) {
  return sessionStatusLabels[status]
}

export function getPtSessionStatusBadgeClassName(status: SessionStatus) {
  return sessionStatusBadgeClassNames[status]
}

export function buildJamaicaScheduledAt(dateValue: string, timeValue: string) {
  if (!getUtcDateFromDateValue(dateValue)) {
    return null
  }

  const normalizedTime = normalizeTimeInputValue(timeValue)

  if (!normalizedTime) {
    return null
  }

  return `${dateValue}T${normalizedTime}${JAMAICA_OFFSET}`
}

export function buildJamaicaScheduledAtFromLocalInput(value: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return null
  }

  const offsetMatch = OFFSET_DATE_TIME_PATTERN.exec(normalizedValue)

  if (offsetMatch) {
    const date = new Date(normalizedValue)
    return Number.isNaN(date.getTime()) ? null : normalizedValue
  }

  const localMatch = LOCAL_DATE_TIME_PATTERN.exec(normalizedValue)

  if (!localMatch) {
    return null
  }

  const [, dateValue, timeValue, secondsPart = '00'] = localMatch

  return buildJamaicaScheduledAt(dateValue, `${timeValue}:${secondsPart}`)
}

export function getJamaicaDateValue(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = getDatePartsInTimeZone(
    date,
    {
      timeZone: JAMAICA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
    'en-US',
  )
  const year = parts.get('year')
  const month = parts.get('month')
  const day = parts.get('day')

  if (!year || !month || !day) {
    return null
  }

  return `${year}-${month}-${day}`
}

export function getMonthValueInJamaica(date = new Date()) {
  const parts = getDatePartsInTimeZone(
    date,
    {
      timeZone: JAMAICA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    },
    'en-US',
  )
  const year = parts.get('year')
  const month = parts.get('month')

  if (!year || !month) {
    throw new Error('Failed to read the current Jamaica month.')
  }

  return `${year}-${month}`
}

export function parseMonthValue(value: string) {
  const match = MONTH_VALUE_PATTERN.exec(value.trim())

  if (!match) {
    return null
  }

  const [, yearPart, monthPart] = match
  const year = Number(yearPart)
  const month = Number(monthPart)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return { year, month }
}

export function shiftDateValue(value: string, offsetDays: number) {
  const date = getUtcDateFromDateValue(value)

  if (!date) {
    return null
  }

  date.setUTCDate(date.getUTCDate() + offsetDays)

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

export function getMonthLabel(month: number, year: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return ''
  }

  return `${getMonthName(month)} ${year}`
}

export function getMonthDateValues(month: number, year: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return []
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const values: string[] = []

  for (let day = 1; day <= daysInMonth; day += 1) {
    values.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }

  return values
}

export function getCurrentMonthDateRangeInJamaica(date = new Date()) {
  const monthValue = getMonthValueInJamaica(date)
  const parts = parseMonthValue(monthValue)

  if (!parts) {
    throw new Error('Failed to resolve the current Jamaica month range.')
  }

  const dateValues = getMonthDateValues(parts.month, parts.year)
  const startDate = dateValues[0]
  const endDate = dateValues[dateValues.length - 1]

  if (!startDate || !endDate) {
    throw new Error('Failed to resolve the current Jamaica month range.')
  }

  return {
    startDate,
    endDate,
  }
}

export function getScheduledDateValuesForMonth(
  month: number,
  year: number,
  scheduledDays: DayOfWeek[],
) {
  const matchingWeekdays = new Set(scheduledDays.map((day) => dayToWeekdayIndex[day]))

  return getMonthDateValues(month, year).filter((dateValue) => {
    const date = getUtcDateFromDateValue(dateValue)

    return date ? matchingWeekdays.has(date.getUTCDay()) : false
  })
}

export function getIsoWeekKey(dateValue: string) {
  const date = getUtcDateFromDateValue(dateValue)

  if (!date) {
    return null
  }

  const adjustedDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = adjustedDate.getUTCDay() || 7
  adjustedDate.setUTCDate(adjustedDate.getUTCDate() + 4 - weekday)

  const isoYear = adjustedDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const diffDays = Math.floor((adjustedDate.getTime() - yearStart.getTime()) / 86_400_000)
  const isoWeek = Math.ceil((diffDays + 1) / 7)

  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`
}

export function getMonthRange(month: number, year: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return null
  }

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  return {
    startInclusive: `${year}-${String(month).padStart(2, '0')}-01T00:00:00${JAMAICA_OFFSET}`,
    endExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00${JAMAICA_OFFSET}`,
  }
}

export function getDateRangeBoundsInJamaica(startDate: string, endDate: string) {
  if (!isDateValue(startDate) || !isDateValue(endDate) || startDate > endDate) {
    return null
  }

  const endExclusiveDate = shiftDateValue(endDate, 1)

  if (!endExclusiveDate) {
    return null
  }

  return {
    startInclusive: `${startDate}T00:00:00${JAMAICA_OFFSET}`,
    endExclusive: `${endExclusiveDate}T00:00:00${JAMAICA_OFFSET}`,
  }
}

export function formatPtSessionDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatPtSessionDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatPtSessionDateTimeInputValue(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const parts = getDatePartsInTimeZone(
    date,
    {
      timeZone: JAMAICA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    },
    'en-US',
  )
  const year = parts.get('year')
  const month = parts.get('month')
  const day = parts.get('day')
  const hour = parts.get('hour')
  const minute = parts.get('minute')

  if (!year || !month || !day || !hour || !minute) {
    return ''
  }

  return `${year}-${month}-${day}T${hour}:${minute}`
}

export async function fetchPtAssignments(filters: PtAssignmentFilters = {}) {
  const searchParams = buildSearchParams(filters)
  const response = await fetch(
    `/api/pt/assignments${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load PT assignments.'))
  }

  const parsed = assignmentsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load PT assignments.')
  }

  return parsed.data.assignments
}

export async function createPtAssignment(data: CreatePtAssignmentData) {
  const response = await fetch('/api/pt/assignments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to create the trainer assignment.'))
  }

  const parsed = assignmentMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to create the trainer assignment.')
  }

  return parsed.data.assignment
}

export async function updatePtAssignment(id: string, data: UpdatePtAssignmentData) {
  const response = await fetch(`/api/pt/assignments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update the trainer assignment.'))
  }

  const parsed = assignmentMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update the trainer assignment.')
  }

  return parsed.data.assignment
}

export async function deletePtAssignment(
  id: string,
  data: { cancelFutureSessions: boolean },
): Promise<{ ok: true; cancelledSessions: number }> {
  const response = await fetch(`/api/pt/assignments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to remove the trainer assignment.'))
  }

  const parsed = assignmentDeleteResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to remove the trainer assignment.')
  }

  return parsed.data
}

export async function generatePtAssignmentSessions(
  assignmentId: string,
  data: GeneratePtSessionsRequest,
): Promise<GeneratePtSessionsResult> {
  const response = await fetch(
    `/api/pt/assignments/${encodeURIComponent(assignmentId)}/generate-sessions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
  )
  const payload = await readJson(response)
  const warning = generateSessionsWarningSchema.safeParse(payload)

  if (warning.success) {
    return warning.data
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to generate PT sessions.'))
  }

  const parsed = generateSessionsSuccessSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to generate PT sessions.')
  }

  return parsed.data
}

export async function fetchPtSessions(filters: PtSessionFilters = {}) {
  const searchParams = buildSearchParams(filters)
  const response = await fetch(
    `/api/pt/sessions${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load PT sessions.'))
  }

  const parsed = sessionsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load PT sessions.')
  }

  return parsed.data.sessions
}

export async function fetchPtPaymentsReport(
  startDate: string,
  endDate: string,
): Promise<PtPaymentsReport> {
  const searchParams = buildSearchParams({
    startDate,
    endDate,
  })
  const response = await fetch(`/api/reports/pt-payments?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the PT payments report.'))
  }

  const parsed = ptPaymentsReportResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the PT payments report.')
  }

  return parsed.data
}

export async function updatePtSession(id: string, data: UpdatePtSessionData) {
  const response = await fetch(`/api/pt/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update the PT session.'))
  }

  const parsed = sessionMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update the PT session.')
  }

  return parsed.data.session
}

export async function fetchPtSessionDetail(id: string): Promise<PtSessionDetail> {
  const response = await fetch(`/api/pt/sessions/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the PT session details.'))
  }

  const parsed = sessionDetailResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the PT session details.')
  }

  return {
    session: parsed.data.session,
    changes: parsed.data.changes,
  }
}

export async function createPtRescheduleRequest(id: string, data: CreateRescheduleRequestData) {
  const response = await fetch(`/api/pt/sessions/${encodeURIComponent(id)}/reschedule-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to create the reschedule request.'))
  }

  const parsed = rescheduleRequestMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to create the reschedule request.')
  }

  return parsed.data.request
}

export async function fetchRescheduleRequests(filters: ApprovalRequestFilters = {}) {
  const searchParams = buildSearchParams({
    status: filters.status,
    requestedBy: filters.requestedBy,
  })
  const response = await fetch(
    `/api/pt/reschedule-requests${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load reschedule requests.'))
  }

  const parsed = rescheduleRequestsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load reschedule requests.')
  }

  return parsed.data.requests
}

export async function reviewRescheduleRequest(id: string, data: ReviewRescheduleRequestData) {
  const response = await fetch(`/api/pt/reschedule-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to review the reschedule request.'))
  }

  const parsed = rescheduleRequestMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to review the reschedule request.')
  }

  return parsed.data.request
}

export async function markPtSession(id: string, data: MarkPtSessionData) {
  const response = await fetch(`/api/pt/sessions/${encodeURIComponent(id)}/mark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update the PT session status.'))
  }

  const parsed = markPtSessionResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update the PT session status.')
  }

  return parsed.data
}

export async function fetchSessionUpdateRequests(filters: ApprovalRequestFilters = {}) {
  const searchParams = buildSearchParams({
    status: filters.status,
    requestedBy: filters.requestedBy,
  })
  const response = await fetch(
    `/api/pt/session-update-requests${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load session update requests.'))
  }

  const parsed = sessionUpdateRequestsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load session update requests.')
  }

  return parsed.data.requests
}

export async function reviewSessionUpdateRequest(
  id: string,
  data: ReviewSessionUpdateRequestData,
) {
  const response = await fetch(`/api/pt/session-update-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to review the session update request.'))
  }

  const parsed = sessionUpdateRequestMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to review the session update request.')
  }

  return parsed.data.request
}

export function normalizeNotification(input: unknown): Notification | null {
  const parsed = notificationSchema.safeParse(input)

  if (!parsed.success) {
    return null
  }

  return parsed.data
}
